import type { Block, Building, MapSettings, StreetPolygon } from './types';

export const state = {
  blocks: [] as Block[],
  buildings: [] as Building[],
  streetPolygons: [] as StreetPolygon[],
  mapSettings: {
    width: 100,
    depth: 100,
    color: '#333333',
    skyColor: '#000000',
  } as MapSettings,
  selectedBlockIndex: -1,
  mode: 'explore' as 'explore' | 'build',
  keys: {} as Record<string, boolean>,
  driveMode: true,
  carSpeed: 0,
  creativeSpeed: 0.1,
  yaw: 0,
  pitch: 0,
};
