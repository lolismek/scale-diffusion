import * as THREE from 'three';
import { camera, renderer } from './engine';
import { state } from './state';
import { resolveMovement } from './collision';

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const direction = new THREE.Vector3();
const right = new THREE.Vector3();

const maxSpeed = 0.4;
const accel = 0.005;
const brakeForce = 0.015;
const friction = 0.002;
const steerSpeed = 0.03;

export function initControls(): void {
  // Mouse look (creative mode)
  document.addEventListener('mousemove', (e) => {
    if (state.driveMode) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    state.yaw -= e.movementX * 0.002;
    state.pitch -= e.movementY * 0.002;
    state.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.pitch));
    euler.set(state.pitch, state.yaw, 0);
    camera.quaternion.setFromEuler(euler);
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    state.keys[e.key.toLowerCase()] = true;
  });
  document.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });
}

export function updateMovement(): void {
  if (document.pointerLockElement !== renderer.domElement) return;

  if (state.driveMode) {
    // Car mode
    if (state.keys['w']) state.carSpeed += accel;
    if (state.keys['s']) state.carSpeed -= brakeForce;
    state.carSpeed -= friction;
    state.carSpeed = Math.max(0, Math.min(state.carSpeed, maxSpeed));

    const steerFactor = state.carSpeed / maxSpeed;
    if (state.keys['a']) state.yaw += steerSpeed * steerFactor;
    if (state.keys['d']) state.yaw -= steerSpeed * steerFactor;

    euler.set(0, state.yaw, 0);
    camera.quaternion.setFromEuler(euler);

    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    // Calculate target position
    const targetX = camera.position.x + direction.x * state.carSpeed;
    const targetZ = camera.position.z + direction.z * state.carSpeed;

    // Resolve collision and get valid position
    const resolved = resolveMovement(camera.position.x, camera.position.z, targetX, targetZ);
    camera.position.x = resolved.x;
    camera.position.z = resolved.z;

    // Reduce speed on collision (simulates hitting something)
    if (resolved.collided) {
      state.carSpeed *= 0.5;
    }
  } else {
    // Creative fly mode
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    right.crossVectors(direction, new THREE.Vector3(0, -1, 0)).normalize();

    if (state.keys['w']) camera.position.add(direction.clone().multiplyScalar(state.creativeSpeed));
    if (state.keys['s']) camera.position.add(direction.clone().multiplyScalar(-state.creativeSpeed));
    if (state.keys['a']) camera.position.add(right.clone().multiplyScalar(state.creativeSpeed));
    if (state.keys['d']) camera.position.add(right.clone().multiplyScalar(-state.creativeSpeed));
    if (state.keys[' ']) camera.position.y += state.creativeSpeed;
  }
}

export function resetCarPhysics(): void {
  state.carSpeed = 0;
  state.pitch = 0;
  euler.set(0, state.yaw, 0);
  camera.quaternion.setFromEuler(euler);
}
