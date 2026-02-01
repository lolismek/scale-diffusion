import * as THREE from 'three';
import { scene } from './engine';
import { state } from './state';
import { addBlock, clearBlocks } from './blocks';
import { addBuilding, clearBuildings } from './buildings';
import { addStreets, clearStreets } from './streets';
import { addStreetPolygon, clearStreetPolygons } from './streetPolygons';
import { setTileTemplate, clearTiles } from './tiling';
import { deselectBlock } from './selection';
import { createGround } from './ground';
import { refreshBlockList } from './ui';
import type { SceneData } from './types';

export function loadScene(data: SceneData): void {
  clearBlocks();
  deselectBlock();
  clearBuildings();
  clearStreets();
  clearStreetPolygons();
  clearTiles();

  if (data.map) {
    state.mapSettings.width = data.map.width ?? 100;
    state.mapSettings.depth = data.map.depth ?? 100;
    state.mapSettings.color = data.map.color ?? '#333333';
    state.mapSettings.skyColor = data.map.skyColor ?? '#000000';
    (document.getElementById('mapWidth') as HTMLInputElement).value = String(state.mapSettings.width);
    (document.getElementById('mapDepth') as HTMLInputElement).value = String(state.mapSettings.depth);
    (document.getElementById('mapColor') as HTMLInputElement).value = state.mapSettings.color;
    (document.getElementById('skyColor') as HTMLInputElement).value = state.mapSettings.skyColor;
    scene.background = new THREE.Color(state.mapSettings.skyColor);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(state.mapSettings.skyColor);
    }
    createGround();
  }

  if (data.blocks) {
    data.blocks.forEach(b => {
      addBlock(b.x, b.z, b.width, b.height, b.depth, b.color);
    });
  }

  if (data.tileWidth && data.tileDepth) {
    // Tiling mode: chunk manager handles buildings + streets per tile
    setTileTemplate(data);
  } else {
    if (data.buildings) {
      data.buildings.forEach(b => {
        addBuilding(b.vertices, b.height, b.color);
      });
    }
    if (data.streets) {
      addStreets(data.streets);
    }
    if (data.cleanedStreets) {
      data.cleanedStreets.forEach(s => {
        addStreetPolygon(s.vertices, s.color);
      });
    }
  }

  refreshBlockList();
}

export function initIO(): void {
  // Export
  document.getElementById('exportBtn')!.addEventListener('click', () => {
    const data: SceneData = {
      map: { ...state.mapSettings },
      blocks: state.blocks.map(b => ({
        x: b.x, z: b.z, width: b.width, height: b.height, depth: b.depth, color: b.color
      })),
      buildings: state.buildings.map(b => ({
        vertices: b.vertices, height: b.height, color: b.color
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  const importFile = document.getElementById('importFile') as HTMLInputElement;
  document.getElementById('importBtn')!.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string) as SceneData;
        loadScene(data);
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });
}
