import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';

let selectionOutline: THREE.BoxHelper | null = null;
let onSelectionChanged = (): void => {};

export function setOnSelectionChanged(cb: () => void): void {
  onSelectionChanged = cb;
}

export function selectBlock(index: number): void {
  state.selectedBlockIndex = index;
  const block = state.blocks[index];
  if (!block) return;

  (document.getElementById('selX') as HTMLInputElement).value = String(block.x);
  (document.getElementById('selZ') as HTMLInputElement).value = String(block.z);
  (document.getElementById('selW') as HTMLInputElement).value = String(block.width);
  (document.getElementById('selH') as HTMLInputElement).value = String(block.height);
  (document.getElementById('selD') as HTMLInputElement).value = String(block.depth);
  (document.getElementById('selColor') as HTMLInputElement).value = block.color;
  document.getElementById('selectedSection')!.classList.add('visible');

  updateSelectionOutline();
  onSelectionChanged();
}

export function deselectBlock(): void {
  state.selectedBlockIndex = -1;
  if (selectionOutline) {
    scene.remove(selectionOutline);
    selectionOutline.dispose();
    selectionOutline = null;
  }
  document.getElementById('selectedSection')!.classList.remove('visible');
  onSelectionChanged();
}

export function updateSelectionOutline(): void {
  if (selectionOutline) {
    scene.remove(selectionOutline);
    selectionOutline.dispose();
    selectionOutline = null;
  }
  if (state.selectedBlockIndex >= 0 && state.blocks[state.selectedBlockIndex]) {
    selectionOutline = new THREE.BoxHelper(state.blocks[state.selectedBlockIndex].mesh, 0xffff00);
    scene.add(selectionOutline);
  }
}

export function updateOutline(): void {
  if (selectionOutline) selectionOutline.update();
}
