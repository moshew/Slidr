// Renders a three.js scene the way a path tracer's camera would, by accumulation: many frames, each
// with the camera somewhere on its lens (depth of field), a sub-pixel shift (antialiasing) and the
// key lights somewhere on their area (soft shadows), averaged in floating point, then tone mapped
// once. Used by the 3D pictures of the hitech designs (artwork/m-*.html). The canvas keeps alpha:
// what no object or shadow covers stays transparent.
import * as THREE from 'three';

const quadVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera  placed and aimed as for a single frame
 * @param {{ frames?: number, focus?: THREE.Vector3, aperture?: number,
 *           lights?: THREE.Light[], lightRadius?: number, onFrame?: (i: number) => void }} options
 */
export async function renderAccumulated(renderer, scene, camera, options = {}) {
  const { frames = 32, focus, aperture = 0, lights = [], lightRadius = 0, onFrame } = options;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const frame = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: options.samples ?? 0 });
  const sum = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const add = new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, k: { value: 1 / frames } },
    vertexShader: quadVertex,
    fragmentShader: `uniform sampler2D t; uniform float k; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv) * k; }`,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const out = new THREE.ShaderMaterial({
    uniforms: { t: { value: sum.texture } },
    vertexShader: quadVertex,
    fragmentShader: `uniform sampler2D t; varying vec2 vUv;
      void main() {
        vec4 a = texture2D(t, vUv);
        float alpha = clamp(a.a, 0.0, 1.0);
        gl_FragColor = vec4(alpha > 0.0001 ? a.rgb / a.a : vec3(0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
      }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });

  camera.updateMatrixWorld();
  const base = camera.position.clone();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), forward = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, forward);
  forward.negate();
  const focusDistance = focus ? focus.clone().sub(base).dot(forward) : 10;
  const pxPerUnit = size.y / (2 * focusDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const lightBase = lights.map((l) => l.position.clone());

  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  for (let i = 0; i < frames; i++) {
    // a Vogel spiral over the lens, and another, turned, over each light's area
    const r = Math.sqrt((i + 0.5) / frames), th = i * 2.399963;
    const dx = r * Math.cos(th) * aperture, dy = r * Math.sin(th) * aperture;
    camera.position.copy(base).addScaledVector(right, dx).addScaledVector(up, dy);
    const jx = ((i * 0.618034) % 1) - 0.5, jy = ((i * 0.754878) % 1) - 0.5;
    camera.setViewOffset(size.x, size.y, -dx * pxPerUnit + jx, dy * pxPerUnit + jy, size.x, size.y);
    camera.updateMatrixWorld();
    lights.forEach((light, n) => {
      const lr = Math.sqrt(((i * 7 + n * 3) % frames + 0.5) / frames) * lightRadius, lt = i * 2.399963 + n * 1.3;
      light.position.copy(lightBase[n]).add(new THREE.Vector3(Math.cos(lt) * lr, Math.sin(lt * 1.7) * lr * 0.3, Math.sin(lt) * lr));
    });
    renderer.setRenderTarget(frame);
    renderer.clear();
    renderer.render(scene, camera);
    add.uniforms.t.value = frame.texture;
    quad.material = add;
    renderer.setRenderTarget(sum);
    if (i === 0) renderer.clear();
    renderer.render(quadScene, quadCamera);
    // wait for the frame, so a slow software GPU never holds a screenshot up
    renderer.readRenderTargetPixels(sum, 0, 0, 1, 1, new Uint16Array(4));
    onFrame?.(i);
    await new Promise((r) => setTimeout(r, 0));
  }
  camera.clearViewOffset();
  camera.position.copy(base);
  lights.forEach((light, n) => light.position.copy(lightBase[n]));
  renderer.setRenderTarget(null);
  renderer.clear();
  quad.material = out;
  renderer.render(quadScene, quadCamera);
  renderer.setClearColor(clear, clearAlpha);
  renderer.autoClear = autoClear;
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}
