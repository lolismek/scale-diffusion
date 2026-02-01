import './style.css';
import { composer } from './engine';
import { updateTiles } from './tiling';
import { state } from './state';
import { createGround } from './ground';
import { initBlocks } from './blocks';
import { setOnSelectionChanged, deselectBlock, updateSelectionOutline, updateOutline } from './selection';
import { initControls, updateMovement } from './controls';
import { initUI, refreshBlockList, initScenarioUI } from './ui';
import { initIO, loadScene } from './io';
import { initAI } from './ai';
import { updateScenario } from './scenarios';
import { camera } from './engine';

// Initialize ground
createGround();

// Wire up block callbacks
initBlocks({
  onChanged: refreshBlockList,
  onUpdated: (index) => {
    if (state.selectedBlockIndex === index) updateSelectionOutline();
  },
  onDeleted: (index) => {
    if (state.selectedBlockIndex === index) {
      deselectBlock();
    } else if (state.selectedBlockIndex > index) {
      state.selectedBlockIndex--;
    }
    refreshBlockList();
  },
});

// Wire up selection callback
setOnSelectionChanged(refreshBlockList);

// Initialize subsystems
initControls();
initUI();
initScenarioUI();
initIO();
initAI();

// Load default map (manhattan)
async function loadDefaultMap() {
  try {
    const response = await fetch('/builds/manhattan_clean_dashes.json');
    const data = await response.json();
    loadScene(data);
    // Position camera on a road (Z-axis street with center at X=-1102.9)
    camera.position.set(-204.7, 1.6, -407.8);
    state.yaw = Math.PI / 2; // Face west toward the street
  } catch (e) {
    console.warn('Could not load default map:', e);
  }
}
loadDefaultMap();

// Coordinates overlay
const coordsOverlay = document.getElementById('coordsOverlay')!;

// Animation loop
function animate(): void {
  requestAnimationFrame(animate);
  updateScenario();  // Update entity positions BEFORE movement collision check
  updateMovement();
  updateTiles();
  updateOutline();
  composer.render();
  coordsOverlay.textContent = `X: ${camera.position.x.toFixed(1)}  Y: ${camera.position.y.toFixed(1)}  Z: ${camera.position.z.toFixed(1)}`;
}
animate();
