// A small photo studio for the product renders of the `techproduct` designs (m-meshwifi,
// m-homebattery, m-keyboard, m-passkey, m-ereader): a renderer on a transparent ground,
// a studio environment of soft boxes for reflections, soft contact shadows, and a few
// procedural textures (noise, brushed metal, knit). Rendered with tools/render-art.mjs.
import * as THREE from 'three';

export { THREE };

/** A renderer, a scene and a camera on a transparent ground, filling the page. */
export function studio({ width, height, fov = 30, exposure = 1, tone = 'agx' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = tone === 'aces' ? THREE.ACESFilmicToneMapping : tone === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.05, 200);
  return { renderer, scene, camera };
}

/**
 * An environment of soft boxes: a dim room of a gradient and rectangular panels of light.
 * panels: [{ at: [x,y,z], size: [w,h], power, color }] facing the origin.
 */
export function softboxes(renderer, { panels, top = '#3a3a3e', bottom = '#0d0d0f', horizon = '#202024', power = 1 }) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(top) },
        mid: { value: new THREE.Color(horizon) },
        bottom: { value: new THREE.Color(bottom) },
        power: { value: power },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float power; varying vec3 vDir;' +
        'void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.8, y)) : mix(mid, bottom, smoothstep(0.0, 0.5, -y)); gl_FragColor = vec4(c * power, 1.0); }',
    }),
  );
  env.add(sky);
  for (const p of panels) {
    const [w, h] = p.size;
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? '#ffffff').multiplyScalar(p.power ?? 4), side: THREE.DoubleSide });
    const panel = new THREE.Mesh(p.round ? new THREE.CircleGeometry(w / 2, 48) : new THREE.PlaneGeometry(w, h), material);
    panel.position.set(...p.at);
    panel.lookAt(0, p.lookY ?? 0, 0);
    env.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return texture;
}

/**
 * Soft contact shadows on a transparent ground (after three.js' contact-shadows example):
 * the scene seen from below as darkness, blurred twice, on a plane at `y`.
 */
export function contactShadow(renderer, scene, { width = 4, depth = 4, y = 0, height = 1, blur = 3, darkness = 1, opacity = 0.8, resolution = 1024, x = 0, z = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const target = new THREE.WebGLRenderTarget(resolution, resolution);
  target.texture.generateMipmaps = false;
  const targetBlur = new THREE.WebGLRenderTarget(resolution, resolution);
  targetBlur.texture.generateMipmaps = false;
  const geometry = new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2);
  // The shadow fades out well inside its plane, so no edge of it ever shows on the slide.
  const plane = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { map: { value: target.texture }, opacity: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform sampler2D map; uniform float opacity; varying vec2 vUv;' +
        'void main(){ float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5))); vec4 t = texture2D(map, vUv); gl_FragColor = vec4(0.0, 0.0, 0.0, t.a * opacity * edge); }',
      transparent: true,
      depthWrite: false,
    }),
  );
  plane.renderOrder = 1;
  plane.scale.y = -1;
  group.add(plane);
  const blurPlane = new THREE.Mesh(geometry);
  blurPlane.visible = false;
  group.add(blurPlane);
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  camera.rotation.x = Math.PI / 2;
  group.add(camera);
  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.userData.darkness = { value: darkness };
  depthMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMaterial.userData.darkness;
    shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );',
    )}`;
  };
  depthMaterial.depthTest = false;
  depthMaterial.depthWrite = false;
  const blurShader = (dir) =>
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, d: { value: 1 / 256 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float d; varying vec2 vUv;
        void main(){ vec4 s = vec4(0.0);
          s += texture2D(tDiffuse, vUv + ${dir} * -4.0 * d) * 0.051;
          s += texture2D(tDiffuse, vUv + ${dir} * -3.0 * d) * 0.0918;
          s += texture2D(tDiffuse, vUv + ${dir} * -2.0 * d) * 0.12245;
          s += texture2D(tDiffuse, vUv + ${dir} * -1.0 * d) * 0.1531;
          s += texture2D(tDiffuse, vUv) * 0.1633;
          s += texture2D(tDiffuse, vUv + ${dir} * 1.0 * d) * 0.1531;
          s += texture2D(tDiffuse, vUv + ${dir} * 2.0 * d) * 0.12245;
          s += texture2D(tDiffuse, vUv + ${dir} * 3.0 * d) * 0.0918;
          s += texture2D(tDiffuse, vUv + ${dir} * 4.0 * d) * 0.051;
          gl_FragColor = s; }`,
      depthTest: false,
    });
  const hBlur = blurShader('vec2(1.0, 0.0)');
  const vBlur = blurShader('vec2(0.0, 1.0)');
  const blurOnce = (amount) => {
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = target.texture;
    hBlur.uniforms.d.value = amount / 256;
    renderer.setRenderTarget(targetBlur);
    renderer.render(blurPlane, camera);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = targetBlur.texture;
    vBlur.uniforms.d.value = amount / 256;
    renderer.setRenderTarget(target);
    renderer.render(blurPlane, camera);
    blurPlane.visible = false;
  };
  return {
    plane,
    /** Draws the shadow of everything now in the scene. Hide what should cast none first. */
    update() {
      const background = scene.background;
      scene.background = null;
      plane.visible = false;
      scene.overrideMaterial = depthMaterial;
      const alpha = renderer.getClearAlpha();
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      blurOnce(blur);
      blurOnce(blur * 0.5);
      blurOnce(blur * 0.25);
      renderer.setRenderTarget(null);
      renderer.setClearAlpha(alpha);
      scene.background = background;
      plane.visible = true;
    },
  };
}

/**
 * A lathe whose section is a superellipse (a squircle at n = 4) instead of a circle:
 * profile points [r, y] from the bottom centre to the top centre, sx/sz the section's half sizes.
 */
export function squircleLathe(profile, { n = 4, sx = 1, sz = 1, segments = 192 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const e = 2 / n;
  const sgn = (v) => (v < 0 ? -1 : 1);
  let length = 0;
  const along = [0];
  for (let i = 1; i < profile.length; i++) {
    length += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
    along.push(length);
  }
  // u runs by length around the section, so a pattern keeps its pitch on faces and corners.
  const section = [];
  for (let j = 0; j <= segments; j++) {
    const t = (j / segments) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    section.push([sx * sgn(c) * Math.abs(c) ** e, sz * sgn(s) * Math.abs(s) ** e]);
  }
  const around = [0];
  for (let j = 1; j <= segments; j++) around.push(around[j - 1] + Math.hypot(section[j][0] - section[j - 1][0], section[j][1] - section[j - 1][1]));
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    for (let j = 0; j <= segments; j++) {
      positions.push(r * section[j][0], y, r * section[j][1]);
      uvs.push(around[j] / around[segments], along[i] / length);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The seam at angle 0 gets the mean of its two sides' normals.
  const normal = geometry.attributes.normal;
  for (let i = 0; i < profile.length; i++) {
    const a = i * row, b = a + segments;
    const nx = (normal.getX(a) + normal.getX(b)) / 2, ny = (normal.getY(a) + normal.getY(b)) / 2, nz = (normal.getZ(a) + normal.getZ(b)) / 2;
    const l = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(a, nx / l, ny / l, nz / l);
    normal.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geometry;
}

/** A closed superellipse curve at height y, for rings and seams. */
export function squircleCurve(r, y, { n = 4, sx = 1, sz = 1, points = 256 } = {}) {
  const e = 2 / n;
  const sgn = (v) => (v < 0 ? -1 : 1);
  const pts = [];
  for (let j = 0; j < points; j++) {
    const t = (j / points) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push(new THREE.Vector3(r * sx * sgn(c) * Math.abs(c) ** e, y, r * sz * sgn(s) * Math.abs(s) ** e));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

/**
 * A ground that shows only the shadows cast on it, fading out between two distances from
 * `center` (x, z), so a long shadow never ends at an edge of the picture.
 */
export function shadowGround({ opacity = 0.15, center = [0, 0], fade = [2, 3], y = 0, size = 30, vertical = false } = {}) {
  const material = new THREE.ShadowMaterial({ opacity });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fadeCenter = { value: new THREE.Vector2(...center) };
    shader.uniforms.fadeRange = { value: new THREE.Vector2(...fade) };
    shader.vertexShader = 'varying vec3 vWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform vec2 fadeCenter; uniform vec2 fadeRange; varying vec3 vWorld;\n' + shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `float fadeD = length(${vertical ? 'vWorld.xy' : 'vWorld.xz'} - fadeCenter); gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * (1.0 - smoothstep(fadeRange.x, fadeRange.y, fadeD)) );`,
    );
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  if (!vertical) ground.rotation.x = -Math.PI / 2;
  ground.position.y = y;
  ground.receiveShadow = true;
  return ground;
}

/** A canvas texture drawn by `draw(ctx, w, h)`. */
export function canvasTexture(w, h, draw, { srgb = true, repeat, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** A seeded random number generator. */
export function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fine grain for matte plastics and paints: a grey noise for roughness or bump maps. */
export function grain(size = 512, { base = 128, spread = 40, seed = 3 } = {}) {
  const rnd = seeded(seed);
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = base + (rnd() - 0.5) * spread;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: false, repeat: [4, 4] },
  );
}

/** Brushed metal: long fine streaks along x. */
export function brushed(size = 1024, { base = 150, spread = 70, seed = 5, streaks = 2600 } = {}) {
  const rnd = seeded(seed);
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      ctx.fillStyle = `rgb(${base},${base},${base})`;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < streaks; i++) {
        const v = Math.round(base + (rnd() - 0.5) * spread);
        ctx.strokeStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.4})`;
        ctx.lineWidth = 0.5 + rnd() * 1.4;
        const y = rnd() * h;
        const x = rnd() * w;
        const len = w * (0.3 + rnd() * 0.9);
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.lineTo(x + len / 2, y);
        ctx.stroke();
      }
    },
    { srgb: false, repeat: [1, 1] },
  );
}

/** Logs where points of the scene land in the picture, in page pixels, to place callouts by. */
export function anchors(camera, width, height, points) {
  const out = {};
  for (const [name, p] of Object.entries(points)) {
    const v = new THREE.Vector3(...p).project(camera);
    out[name] = [Math.round(((v.x + 1) / 2) * width), Math.round(((1 - v.y) / 2) * height)];
  }
  console.log('anchors ' + JSON.stringify(out));
}

const FONTS = '/home/user/Slidr/apps/desktop/node_modules/';
/** Loads a font of the app's own for drawing on a canvas: `space-grotesk`, `inter`, ... */
export async function loadFont(family, path, weight = '100 900') {
  const face = new FontFace(family, `url(${FONTS}${path})`, { weight });
  await face.load();
  document.fonts.add(face);
}

/** Says the picture is drawn, for render-art.mjs. */
export function done() {
  document.documentElement.dataset.ready = 'true';
}
