// The isometric world of Anan's pictures, in three.js: an orthographic camera on the diagonal,
// clay-white blocks and cylinders, region plates with dashed boundaries, dashed connectors with
// arrowheads, packets of traffic and clouds, under a soft light from the upper right that casts
// long shadows toward the lower left, as the template's drawings do. Labels are DOM chips laid
// over the canvas at the projected points, so their letters are as crisp as the page's.
//
// Axes: x runs down to the right on the picture, z down to the left, y up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const C = {
  white: '#ffffff',
  ground: '#eef4fb',
  sky: '#d4e6fb',
  skyDeep: '#9cc6f4',
  blue: '#1a7fe8',
  teal: '#13b3a5',
  tealPale: '#d3f1ed',
  orange: '#ff7a29',
  navy: '#0c1a33',
  green: '#1fbf6a',
  slot: '#c3d2e4',
  legacy: '#d9dee6',
};

const materials = new Map();
export function mat(color, rest = {}) {
  const key = color + JSON.stringify(rest);
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...rest }));
  }
  return materials.get(key);
}

const shadowed = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** The stage: renderer, camera, lights and ground, sized to the page. */
export function stage({ width, height, view, target = [0, 0, 0], light = [5, 12, -7], fog }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('canvas').append(renderer.domElement);

  const scene = new THREE.Scene();
  // Glows go in a scene of their own, drawn over the shaded picture: occlusion would make
  // squares of them.
  const glows = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  if (fog) scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

  const aspect = width / height;
  const camera = new THREE.OrthographicCamera((-view * aspect) / 2, (view * aspect) / 2, view / 2, -view / 2, 0.1, 400);
  const t = new THREE.Vector3(...target);
  camera.position.set(t.x + 60, t.y + 60, t.z + 60);
  camera.lookAt(t);
  camera.updateMatrixWorld();

  scene.add(new THREE.HemisphereLight('#ffffff', '#bcd2ee', 0.62));
  const sun = new THREE.DirectionalLight('#ffffff', 3.4);
  sun.position.set(t.x + light[0], t.y + light[1], t.z + light[2]);
  sun.target.position.copy(t);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const reach = view * aspect * 0.9;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 80 });
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  scene.userData.glows = glows;
  return {
    scene,
    glows,
    camera,
    renderer,
    project(p) {
      const v = new THREE.Vector3(...p).project(camera);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    },
    render({ ao = true } = {}) {
      if (!ao) {
        renderer.render(scene, camera);
        return;
      }
      // Contact shadows where things meet the ground and each other.
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const gtao = new GTAOPass(scene, camera, width, height);
      gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
      const over = new RenderPass(glows, camera);
      over.clear = false;
      over.clearDepth = true;
      composer.addPass(over);
      composer.addPass(new OutputPass());
      composer.setPixelRatio(window.devicePixelRatio);
      composer.setSize(width, height);
      composer.render();
    },
  };
}

/** The ground: a plane that takes the shadows, and the isometric lattice of dots on it. */
export function ground(scene, { size = 80, color = C.ground, dots = true, spacing = 0.5, center = [0, 0] } = {}) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(center[0], 0, center[1]);
  plane.receiveShadow = true;
  scene.add(plane);
  if (dots) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = 'rgba(26,127,232,0.38)';
    g.beginPath();
    g.arc(32, 32, 3.2, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / spacing, size / spacing);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    const layer = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    layer.rotation.x = -Math.PI / 2;
    layer.position.set(center[0], 0.002, center[1]);
    scene.add(layer);
  }
  return plane;
}

/** A rounded block, its foot at (x, y, z) on the ground, by its size along x, z and up. */
export function block(scene, [x, y, z], [w, d, h], color = C.white, r = 0.05) {
  const mesh = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, h / 2.2, w / 2.2)), mat(color)));
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  scene.add(mesh);
  return mesh;
}

/** A server: a block with slots and lights on the faces the camera sees. */
export function server(scene, [x, y, z], [w, d, h], { color = C.white, lights = C.green, every = 0.22, accent } = {}) {
  block(scene, [x, y, z], [w, d, h], color);
  const rows = Math.max(1, Math.floor((h - 0.12) / every));
  const ink = color === C.white || color === C.legacy || color === C.sky ? C.slot : '#ffffff';
  for (let i = 0; i < rows; i++) {
    const yy = y + h - 0.14 - i * every;
    // The lit face (x + w) and the face in shade (z + d).
    const slotA = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, d * 0.5), mat(ink, { roughness: 0.8 }));
    slotA.position.set(x + w + 0.004, yy, z + d * 0.58);
    const slotB = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.035, 0.012), mat(ink, { roughness: 0.8 }));
    slotB.position.set(x + w * 0.42, yy, z + d + 0.004);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 8),
      mat(i === 1 && accent ? accent : lights, { emissive: i === 1 && accent ? accent : lights, emissiveIntensity: 0.9 }),
    );
    led.position.set(x + w + 0.01, yy, z + d * 0.18);
    const led2 = led.clone();
    led2.position.set(x + w * 0.82, yy, z + d + 0.01);
    scene.add(slotA, slotB, led, led2);
  }
}

/** A database: disks stacked with a seam between them, tinted, a light on each. */
export function database(scene, [x, y, z], r, h, { disks = 3, tint = C.tealPale, top = '#3cc2b5', light = C.green } = {}) {
  const gap = 0.035;
  const dh = (h - gap * (disks - 1)) / disks;
  for (let i = 0; i < disks; i++) {
    const mesh = shadowed(
      new THREE.Mesh(new THREE.CylinderGeometry(r, r, dh, 48), mat(i === disks - 1 ? tint : C.white)),
    );
    mesh.position.set(x, y + dh / 2 + i * (dh + gap), z);
    scene.add(mesh);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, gap + 0.002, 48), mat(top, { roughness: 0.5 }));
    if (i < disks - 1) {
      core.position.set(x, y + (i + 1) * (dh + gap) - gap / 2, z);
      scene.add(core);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), mat(light, { emissive: light, emissiveIntensity: 0.9 }));
    const a = Math.PI / 4;
    led.position.set(x + Math.cos(a) * (r + 0.005), y + dh * 0.55 + i * (dh + gap), z + Math.sin(a) * (r + 0.005));
    scene.add(led);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.012, 48), mat(top, { roughness: 0.4 }));
  cap.position.set(x, y + h + 0.004, z);
  scene.add(cap);
}

/** A dashed line along the ground (or at a height), from a to b, with an arrowhead at b. */
export function dashed(scene, a, b, { color = C.blue, width = 0.05, dash = 0.16, gap = 0.12, head = true, lift = 0.02 } = {}) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  const material = mat(color, { roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const end = head ? len - 0.2 : len;
  for (let t = 0; t < end; t += dash + gap) {
    const l = Math.min(dash, end - t);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, l), material);
    seg.position.copy(A.clone().add(dir.clone().multiplyScalar(t + l / 2)));
    seg.position.y += lift;
    seg.lookAt(seg.position.clone().add(dir));
    scene.add(seg);
  }
  if (head) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 3), material);
    cone.position.copy(B.clone().sub(dir.clone().multiplyScalar(0.12)));
    cone.position.y += lift + 0.01;
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.scale.set(1, 1, 0.25);
    scene.add(cone);
  }
}

/** A packet of traffic: a small bright ball and its glow. */
export function packet(scene, p, color = C.orange, size = 0.07, glow = true) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), mat(color, { emissive: color, emissiveIntensity: 0.7 }));
  ball.position.set(...p);
  ball.castShadow = true;
  scene.add(ball);
  if (!glow) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color + 'aa');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthWrite: false }));
  halo.position.set(...p);
  halo.scale.setScalar(size * 6);
  (scene.userData.glows ?? scene).add(halo);
}

/** A region: a rounded plate with a dashed boundary inset on its top. */
export function plate(scene, [x, z], [w, d], { h = 0.18, color = C.white, line = C.blue, y = 0 } = {}) {
  block(scene, [x, y, z], [w, d, h], color, 0.08);
  const m = 0.16;
  const top = y + h + 0.004;
  const edges = [
    [[x + m, top, z + m], [x + w - m, top, z + m]],
    [[x + w - m, top, z + m], [x + w - m, top, z + d - m]],
    [[x + w - m, top, z + d - m], [x + m, top, z + d - m]],
    [[x + m, top, z + d - m], [x + m, top, z + m]],
  ];
  for (const [a, b] of edges) dashed(scene, a, b, { color: line, width: 0.03, dash: 0.12, gap: 0.09, head: false, lift: 0 });
  return top;
}

/** A cloud: soft white puffs on a flat foot, floating, casting its shadow. */
export function cloud(scene, [x, y, z], s = 1) {
  const group = new THREE.Group();
  const white = mat('#ffffff', { roughness: 0.95 });
  const puffs = [
    [0, 0.0, 0, 0.55],
    [0.55, -0.08, 0.1, 0.42],
    [-0.55, -0.1, -0.05, 0.4],
    [0.2, 0.25, -0.25, 0.45],
    [-0.25, 0.18, 0.25, 0.4],
    [0.95, -0.2, 0.0, 0.28],
    [-0.95, -0.22, 0.05, 0.27],
  ];
  for (const [px, py, pz, r] of puffs) {
    const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), white));
    ball.position.set(px, py, pz);
    ball.scale.y = 0.86;
    group.add(ball);
  }
  // The soft foot of the cloud.
  const foot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1.0, 40, 20), white));
  foot.scale.set(1.12, 0.28, 0.62);
  foot.position.y = -0.22;
  group.add(foot);
  group.position.set(x, y, z);
  group.scale.setScalar(s);
  group.rotation.y = Math.PI / 4;
  scene.add(group);
}

/** A chip of the console over a point of the picture: a status light and a name in mono. */
export function chip(st, p, label, { light = C.green, dy = -10, size = 1, sub, below = false } = {}) {
  const [X, Y] = st.project(p);
  const el = document.createElement('div');
  el.className = below ? 'chip below' : 'chip';
  el.style.left = `${X}px`;
  el.style.top = `${Y + dy}px`;
  el.style.setProperty('--s', size);
  el.innerHTML = `<i style="--c:${light}"></i><span>${label}</span>${sub ? `<em>${sub}</em>` : ''}`;
  document.getElementById('labels').append(el);
  // Kept inside the picture; the pointer still points where it was asked to.
  const half = el.offsetWidth / 2;
  const width = document.getElementById('labels').offsetWidth;
  const x = Math.min(Math.max(X, half + 14), width - half - 14);
  el.style.left = `${x}px`;
  el.style.setProperty('--px', `${X - x}px`);
  return el;
}

/** The style of the chips, for a page to include. */
export const CHIP_CSS = `
  .chip { position: absolute; transform: translate(-50%, -100%); display: flex; align-items: center; gap: calc(9px * var(--s));
    padding: calc(7px * var(--s)) calc(14px * var(--s)) calc(7px * var(--s)) calc(10px * var(--s)); border-radius: 999px;
    background: rgba(255,255,255,.96); box-shadow: 0 0 0 1.5px rgba(12,26,51,.1), 0 10px 26px rgba(12,26,51,.12);
    font: 500 calc(17px * var(--s)) 'JetBrains Mono', monospace; color: #0c1a33; white-space: nowrap; }
  .chip i { width: calc(10px * var(--s)); height: calc(10px * var(--s)); border-radius: 50%; background: var(--c);
    box-shadow: 0 0 0 calc(5px * var(--s)) color-mix(in srgb, var(--c) 22%, transparent); margin: 0 calc(4px * var(--s)); }
  .chip em { font-style: normal; color: #55667f; padding-left: calc(10px * var(--s)); margin-left: calc(2px * var(--s)); border-left: 1.5px solid rgba(12,26,51,.12); }
  .chip::after { content: ''; position: absolute; left: calc(50% + var(--px, 0px)); bottom: calc(-7px * var(--s)); width: calc(12px * var(--s)); height: calc(12px * var(--s));
    background: #fff; transform: translateX(-50%) rotate(45deg); box-shadow: 1.5px 1.5px 0 rgba(12,26,51,.08); z-index: -1; }
  .chip.below { transform: translate(-50%, 0); }
  .chip.below::after { bottom: auto; top: calc(-7px * var(--s)); box-shadow: -1.5px -1.5px 0 rgba(12,26,51,.08); }
`;
