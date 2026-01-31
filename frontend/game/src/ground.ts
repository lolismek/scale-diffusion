import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';

let ground: THREE.Mesh | null = null;

export function createGround(): void {
  if (ground) {
    scene.remove(ground);
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
  }
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshStandardMaterial({ color: state.mapSettings.color })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.userData.isGround = true;
  scene.add(ground);
}

export function getGround(): THREE.Mesh {
  return ground!;
}
