import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { state } from './state';

const container = document.getElementById('canvasContainer')!;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(state.mapSettings.skyColor);

export const camera = new THREE.PerspectiveCamera(
  75,
  container.clientWidth / container.clientHeight,
  0.1,
  5000
);
camera.position.set(0, 1.6, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// Lighting
// Hemisphere light: sky color from above, ground bounce from below — fills all faces
scene.add(new THREE.HemisphereLight(0xc8d8e8, 0x7a6e5a, 0.9));
// Main sun
const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
dirLight.position.set(30, 50, 20);
scene.add(dirLight);
// Fill light from the opposite side to soften shadows
const fillLight = new THREE.DirectionalLight(0xd0e0f0, 0.4);
fillLight.position.set(-30, 30, -20);
scene.add(fillLight);

// Post-processing
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(container.clientWidth, container.clientHeight),
  0.5,   // strength
  0.4,   // radius
  0.7,   // threshold — only surfaces brighter than this bloom
);
composer.addPass(bloomPass);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  composer.setSize(container.clientWidth, container.clientHeight);
});
