// Depth of field and bloom for the Shvav renders: the scene is drawn once into a target with its
// depth, blurred in two passes (across, then down) by each pixel's circle of confusion, lit with
// bloom and written to the screen. A gather with Gaussian weights: smooth, with no sampling
// pattern, and a far pixel does not bleed over a sharper near one.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const R = 72;

const blurShader = (withCoc) => ({
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    dir: { value: new THREE.Vector2() },
    focus: { value: 1 },
    K: { value: 10 },
    maxR: { value: 40 },
    near: { value: 1 },
    far: { value: 1000 },
  },
  vertexShader:
    'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 dir;
    uniform float focus; uniform float K; uniform float maxR; uniform float near; uniform float far;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    float coc(float d) { return min(K * abs(d - focus) / d, maxR); }
    void main() {
      float d0 = dist(vUv);
      float c0 = ${withCoc ? 'texture2D(tColor, vUv).a' : 'coc(d0)'};
      vec3 sum = vec3(0.0); float wsum = 0.0;
      for (int i = -${R}; i <= ${R}; i++) {
        float r = abs(float(i));
        if (r > maxR + 1.0) continue;
        vec2 uv = vUv + dir * float(i);
        vec4 s = texture2D(tColor, uv);
        float d = dist(uv);
        float c = ${withCoc ? 's.a' : 'coc(d)'};
        // Behind the centre and blurrier than it: it may not spread over the centre's sharp edge.
        if (d > d0) c = min(c, max(c0, 0.5));
        float sigma = max(c * 0.5, 0.35);
        float w = exp(-r * r / (2.0 * sigma * sigma)) / sigma;
        sum += s.rgb * w; wsum += w;
      }
      gl_FragColor = vec4(sum / wsum, c0);
    }`,
});

/**
 * Renders `scene` from `camera` with the focus at `focus` (a distance), a blur of `K` pixels for
 * what is infinitely far (at the canvas's own pixel ratio), and bloom over `threshold`.
 */
export function renderWithFocus(
  renderer,
  scene,
  camera,
  { focus, K = 24, maxR = 48, bloom = 0.6, radius = 0.4, threshold = 3 },
) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const dpr = renderer.getPixelRatio();
  const make = (depth) =>
    new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: depth ? 4 : 0,
      ...(depth ? { depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.FloatType) } : {}),
    });
  const sceneTarget = make(true);
  const across = make(false);
  const down = make(false);
  renderer.setRenderTarget(sceneTarget);
  renderer.render(scene, camera);

  const passA = new THREE.ShaderMaterial(blurShader(false));
  const passB = new THREE.ShaderMaterial(blurShader(true));
  for (const m of [passA, passB]) {
    Object.assign(m.uniforms.focus, { value: focus });
    m.uniforms.K.value = K * dpr;
    m.uniforms.maxR.value = Math.min(maxR * dpr, R);
    m.uniforms.near.value = camera.near;
    m.uniforms.far.value = camera.far;
    m.uniforms.tDepth.value = sceneTarget.depthTexture;
  }
  passA.uniforms.tColor.value = sceneTarget.texture;
  passA.uniforms.dir.value.set(1 / size.x, 0);
  passB.uniforms.tColor.value = across.texture;
  passB.uniforms.dir.value.set(0, 1 / size.y);
  const quad = new FullScreenQuad(passA);
  renderer.setRenderTarget(across);
  quad.render(renderer);
  quad.material = passB;
  renderer.setRenderTarget(down);
  quad.render(renderer);
  renderer.setRenderTarget(null);

  const composer = new EffectComposer(renderer);
  composer.addPass(new TexturePass(down.texture));
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(size.x / dpr, size.y / dpr), bloom, radius, threshold),
  );
  composer.addPass(new OutputPass());
  composer.render();
}

/** Puts a still picture of the canvas in its place: a page of one image is quick to capture. */
export async function freeze(renderer, w, h) {
  const img = new Image();
  img.src = renderer.domElement.toDataURL('image/png');
  await img.decode();
  img.style.cssText = `display:block;width:${w}px;height:${h}px`;
  renderer.domElement.replaceWith(img);
  renderer.dispose();
}
