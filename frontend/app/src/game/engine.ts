import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Engine state - initialized by createEngine()
export let scene: THREE.Scene;
export let camera: THREE.PerspectiveCamera;
export let renderer: THREE.WebGLRenderer;
export let composer: EffectComposer;

export interface EngineConfig {
  container: HTMLElement;
  width?: number;
  height?: number;
  skyColor?: string;
}

export function createEngine(config: EngineConfig) {
  const { container, width, height, skyColor = '#000000' } = config;
  const w = width || container.clientWidth;
  const h = height || container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 40, 800);

  // Camera - 16:9 for Decart compatibility
  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 5000);
  camera.position.set(0, 1.6, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setSize(w, h);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.objectFit = 'cover';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xc8d8e8, 0x7a6e5a, 0.9));
  const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
  dirLight.position.set(30, 50, 20);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0xd0e0f0, 0.4);
  fillLight.position.set(-30, 30, -20);
  scene.add(fillLight);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.3, 0.4, 0.85
  );
  composer.addPass(bloomPass);

  return { scene, camera, renderer, composer };
}

export function disposeEngine() {
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
  }
}
