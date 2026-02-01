import * as THREE from 'three';
import { camera, renderer } from './engine';
import { state } from './state';
import { createGround, getGround } from './ground';
import { addBlock, updateBlock, deleteBlock } from './blocks';
import { selectBlock, deselectBlock } from './selection';
import { resetCarPhysics } from './controls';
import { scene } from './engine';
import {
  sampleScenarios,
  allScenarios,
  commonroadScenarios,
  startScenario,
  stopScenario,
  togglePause,
  restartScenario,
  getScenarioInfo,
  setOnScenarioStateChange,
} from './scenarios';

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

/**
 * Initialize scenario UI
 */
export function initScenarioUI(): void {
  const scenarioSelect = document.getElementById('scenarioSelect') as HTMLSelectElement;
  const startBtn = document.getElementById('scenarioStartBtn')!;
  const stopBtn = document.getElementById('scenarioStopBtn')!;
  const pauseBtn = document.getElementById('scenarioPauseBtn')!;
  const restartBtn = document.getElementById('scenarioRestartBtn')!;
  const statusDiv = document.getElementById('scenarioStatus')!;
  const timerDiv = document.getElementById('scenarioTimer')!;
  const collisionsDiv = document.getElementById('scenarioCollisions')!;
  const controlsDiv = document.getElementById('scenarioControls')!;

  // Populate scenario dropdown with optgroups
  const handcraftedGroup = document.createElement('optgroup');
  handcraftedGroup.label = 'Hand-crafted';
  sampleScenarios.forEach(scenario => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.name;
    handcraftedGroup.appendChild(option);
  });
  scenarioSelect.appendChild(handcraftedGroup);

  if (commonroadScenarios.length > 0) {
    const crGroup = document.createElement('optgroup');
    crGroup.label = 'CommonRoad';
    commonroadScenarios.forEach(scenario => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.name;
      crGroup.appendChild(option);
    });
    scenarioSelect.appendChild(crGroup);
  }

  // Update description when selection changes
  scenarioSelect.addEventListener('change', () => {
    const scenario = allScenarios.find(s => s.id === scenarioSelect.value);
    const descEl = document.getElementById('scenarioDesc')!;
    if (scenario) {
      descEl.textContent = scenario.description;
    } else {
      descEl.textContent = 'Select a scenario to begin';
    }
  });

  // Start scenario
  startBtn.addEventListener('click', () => {
    const scenario = allScenarios.find(s => s.id === scenarioSelect.value);
    if (scenario) {
      // Switch to explore mode and drive mode
      state.mode = 'explore';
      state.driveMode = true;
      document.getElementById('modeBtn')!.textContent = 'Mode: Explore';
      document.getElementById('modeIndicator')!.textContent = 'Scenario Mode — Complete the objective';
      resetCarPhysics();

      // Request pointer lock
      renderer.domElement.requestPointerLock();

      startScenario(scenario);
    }
  });

  // Stop scenario
  stopBtn.addEventListener('click', () => {
    stopScenario();
  });

  // Pause/resume
  pauseBtn.addEventListener('click', () => {
    togglePause();
  });

  // Restart
  restartBtn.addEventListener('click', () => {
    restartScenario();
    renderer.domElement.requestPointerLock();
  });

  // HUD elements
  const hudDiv = document.getElementById('scenarioHUD')!;
  const hudTimer = document.getElementById('hudTimer')!;
  const hudStatus = document.getElementById('hudStatus')!;

  // Update UI on state change
  function updateScenarioUI(): void {
    const info = getScenarioInfo();

    if (!info) {
      statusDiv.textContent = 'No active scenario';
      statusDiv.className = 'scenario-status';
      timerDiv.textContent = '--:--';
      collisionsDiv.textContent = '0';
      controlsDiv.classList.remove('visible');
      startBtn.classList.remove('hidden');
      hudDiv.classList.remove('visible');
      return;
    }

    controlsDiv.classList.add('visible');
    startBtn.classList.add('hidden');
    hudDiv.classList.add('visible');

    // Update timer
    const mins = Math.floor(info.timeRemaining / 60);
    const secs = Math.floor(info.timeRemaining % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    timerDiv.textContent = timeStr;
    hudTimer.textContent = timeStr;

    // Update collisions
    collisionsDiv.textContent = info.collisions.toString();

    // Update status
    statusDiv.className = 'scenario-status';
    hudStatus.className = 'hud-status';
    switch (info.status) {
      case 'playing':
        statusDiv.textContent = `Playing: ${info.name}`;
        statusDiv.classList.add('playing');
        hudStatus.textContent = info.name;
        hudStatus.classList.add('playing');
        pauseBtn.textContent = 'Pause';
        break;
      case 'paused':
        statusDiv.textContent = 'Paused';
        statusDiv.classList.add('paused');
        hudStatus.textContent = 'PAUSED';
        hudStatus.classList.add('paused');
        pauseBtn.textContent = 'Resume';
        break;
      case 'won':
        statusDiv.textContent = 'Scenario Complete!';
        statusDiv.classList.add('won');
        hudStatus.textContent = 'COMPLETE!';
        hudStatus.classList.add('won');
        break;
      case 'lost':
        statusDiv.textContent = 'Scenario Failed';
        statusDiv.classList.add('lost');
        hudStatus.textContent = 'FAILED';
        hudStatus.classList.add('lost');
        break;
      default:
        statusDiv.textContent = info.name;
        hudStatus.textContent = info.name;
    }
  }

  // Subscribe to state changes
  setOnScenarioStateChange(updateScenarioUI);

  // Also update periodically for timer
  setInterval(() => {
    const info = getScenarioInfo();
    if (info && info.status === 'playing') {
      updateScenarioUI();
    }
  }, 100);
}
