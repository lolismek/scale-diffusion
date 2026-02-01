import * as THREE from 'three';
import { camera, renderer } from './engine';
import { state } from './state';
import { createGround, getGround } from './ground';
import { addBlock, updateBlock, deleteBlock } from './blocks';
import { selectBlock, deselectBlock } from './selection';
import { resetCarPhysics } from './controls';
import { scene } from './engine';

export function refreshBlockList(): void {
  const list = document.getElementById('blockList')!;
  list.innerHTML = '';
  state.blocks.forEach((b, i) => {
    const li = document.createElement('li');
    li.textContent = `Block ${i} (${b.width}\u00d7${b.height}\u00d7${b.depth})`;
    if (i === state.selectedBlockIndex) li.classList.add('active');
    li.addEventListener('click', () => selectBlock(i));
    list.appendChild(li);
  });
  document.getElementById('blockCount')!.textContent =
    `${state.blocks.length} block${state.blocks.length !== 1 ? 's' : ''}`;
}

export function initUI(): void {
  const modeBtn = document.getElementById('modeBtn')!;
  const modeIndicator = document.getElementById('modeIndicator')!;
  const driveBtn = document.getElementById('driveBtn')!;
  const creativeSpeedSection = document.getElementById('creativeSpeedSection')!;
  const creativeSpeedInput = document.getElementById('creativeSpeed') as HTMLInputElement;
  const creativeSpeedVal = document.getElementById('creativeSpeedVal')!;

  // Mode toggle
  modeBtn.addEventListener('click', () => {
    state.mode = state.mode === 'explore' ? 'build' : 'explore';
    modeBtn.textContent = `Mode: ${state.mode === 'explore' ? 'Explore' : 'Build'}`;
    if (state.mode === 'explore') {
      modeIndicator.textContent = 'Explore Mode \u2014 Click to look around';
      deselectBlock();
    } else {
      modeIndicator.textContent = 'Build Mode \u2014 Click ground to place, click block to select';
      if (document.pointerLockElement) document.exitPointerLock();
    }
  });

  // Drive mode toggle
  creativeSpeedInput.addEventListener('input', () => {
    state.creativeSpeed = parseFloat(creativeSpeedInput.value);
    creativeSpeedVal.textContent = state.creativeSpeed.toFixed(2);
  });

  driveBtn.addEventListener('click', () => {
    state.driveMode = !state.driveMode;
    driveBtn.textContent = state.driveMode ? 'Car Mode' : 'Creative Mode';
    driveBtn.classList.toggle('active', !state.driveMode);
    creativeSpeedSection.classList.toggle('visible', !state.driveMode);
    if (state.driveMode) resetCarPhysics();
  });

  // Canvas click (raycasting)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (e) => {
    if (state.mode === 'explore') {
      renderer.domElement.requestPointerLock();
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check blocks first
    const blockMeshes = state.blocks.map(b => b.mesh);
    const blockHits = raycaster.intersectObjects(blockMeshes);
    if (blockHits.length > 0) {
      selectBlock(blockHits[0].object.userData.blockIndex);
      return;
    }

    // Check ground
    const ground = getGround();
    const groundHits = raycaster.intersectObject(ground);
    if (groundHits.length > 0) {
      const pt = groundHits[0].point;
      const w = parseFloat((document.getElementById('defWidth') as HTMLInputElement).value) || 5;
      const h = parseFloat((document.getElementById('defHeight') as HTMLInputElement).value) || 8;
      const d = parseFloat((document.getElementById('defDepth') as HTMLInputElement).value) || 5;
      const c = (document.getElementById('defColor') as HTMLInputElement).value;
      const idx = addBlock(Math.round(pt.x * 2) / 2, Math.round(pt.z * 2) / 2, w, h, d, c);
      selectBlock(idx);
    }
  });

  // Map settings
  document.getElementById('mapWidth')!.addEventListener('input', (e) => {
    state.mapSettings.width = parseFloat((e.target as HTMLInputElement).value) || 100;
    createGround();
  });
  document.getElementById('mapDepth')!.addEventListener('input', (e) => {
    state.mapSettings.depth = parseFloat((e.target as HTMLInputElement).value) || 100;
    createGround();
  });
  document.getElementById('mapColor')!.addEventListener('input', (e) => {
    state.mapSettings.color = (e.target as HTMLInputElement).value;
    createGround();
  });
  document.getElementById('skyColor')!.addEventListener('input', (e) => {
    state.mapSettings.skyColor = (e.target as HTMLInputElement).value;
    scene.background = new THREE.Color(state.mapSettings.skyColor);
  });

  // Selected block editing
  function onSelectedInput(): void {
    if (state.selectedBlockIndex < 0) return;
    updateBlock(state.selectedBlockIndex, {
      x: parseFloat((document.getElementById('selX') as HTMLInputElement).value) || 0,
      z: parseFloat((document.getElementById('selZ') as HTMLInputElement).value) || 0,
      width: parseFloat((document.getElementById('selW') as HTMLInputElement).value) || 1,
      height: parseFloat((document.getElementById('selH') as HTMLInputElement).value) || 1,
      depth: parseFloat((document.getElementById('selD') as HTMLInputElement).value) || 1,
      color: (document.getElementById('selColor') as HTMLInputElement).value,
    });
  }

  ['selX', 'selZ', 'selW', 'selH', 'selD', 'selColor'].forEach(id => {
    document.getElementById(id)!.addEventListener('input', onSelectedInput);
  });

  document.getElementById('deleteBtn')!.addEventListener('click', () => {
    if (state.selectedBlockIndex >= 0) deleteBlock(state.selectedBlockIndex);
  });
}
