import type * as THREE from 'three';

export interface Block {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  mesh: THREE.Mesh;
}

export interface Building {
  vertices: number[][];
  height: number;
  color: string;
  mesh: THREE.Mesh;
}

export interface MapSettings {
  width: number;
  depth: number;
  color: string;
  skyColor: string;
}

export interface StreetCorridor {
  axis: 'x' | 'z';
  center: number;
  width: number;
  start: number;
  end: number;
  interrupts: number[][];
}

export interface SceneData {
  map?: Partial<MapSettings>;
  blocks?: Array<Omit<Block, 'mesh'>>;
  buildings?: Array<Omit<Building, 'mesh'>>;
  streets?: StreetCorridor[];
}
