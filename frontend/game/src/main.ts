import './style.css';
import { renderer, scene, camera } from './engine';
import { state } from './state';
import { createGround } from './ground';
import { initBlocks, addBlock } from './blocks';
import { setOnSelectionChanged, deselectBlock, updateSelectionOutline, updateOutline } from './selection';
import { initControls, updateMovement } from './controls';
import { initUI, refreshBlockList } from './ui';
import { initIO } from './io';
import { initAI } from './ai';

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
initIO();
initAI();

// Initial blocks
addBlock(10, 10, 5, 8, 5, '#888888');
addBlock(-10, 5, 3, 12, 3, '#888888');
addBlock(0, -15, 6, 6, 6, '#888888');

// Animation loop
function animate(): void {
  requestAnimationFrame(animate);
  updateMovement();
  updateOutline();
  renderer.render(scene, camera);
}
animate();
