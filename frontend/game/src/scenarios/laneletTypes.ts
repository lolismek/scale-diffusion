/**
 * TypeScript interfaces for CommonRoad lanelet network data.
 * Used for procedural road generation from scenario geometry.
 */

// 2D point in CommonRoad coordinates (X-Y plane)
export interface Point2D {
  x: number;
  y: number; // Note: becomes Z in Three.js (negated)
}

// Adjacent lanelet reference
export interface AdjacentLanelet {
  id: number;
  sameDirection: boolean; // true = same driving direction, false = opposite
}

// A single lanelet (lane segment)
export interface Lanelet {
  id: number;
  leftBound: Point2D[];      // Polyline defining left edge
  rightBound: Point2D[];     // Polyline defining right edge
  centerline: Point2D[];     // Computed from left/right bounds
  successors: number[];      // IDs of lanelets this flows into
  predecessors: number[];    // IDs of lanelets that flow into this
  adjacentLeft?: AdjacentLanelet;
  adjacentRight?: AdjacentLanelet;
  width: number;             // Average width in meters
}

// Complete lanelet network
export interface LaneletNetwork {
  lanelets: Map<number, Lanelet>;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// Raw lanelet data from JSON (before parsing into Map)
export interface RawLanelet {
  id: number;
  leftBound: number[][];     // [[x, y], ...]
  rightBound: number[][];
  successors: number[];
  predecessors: number[];
  adjacentLeft?: { id: number; sameDirection: boolean };
  adjacentRight?: { id: number; sameDirection: boolean };
}

export interface RawLaneletNetwork {
  lanelets: RawLanelet[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// Road geometry data embedded in scenario
export interface RoadGeometry {
  network: RawLaneletNetwork;
  centroid: [number, number]; // [x, y] center point for coordinate transform
}

// Lane marking types
export interface LaneMarking {
  points: Point2D[];
  type: 'dashed' | 'solid' | 'double';
  side: 'left' | 'right' | 'center';
}

// Road surface polygon
export interface RoadSurface {
  vertices: Point2D[];
  type: 'road' | 'intersection';
}

// Placement zone for buildings
export interface PlacementZone {
  innerEdge: Point2D[];   // Road-side edge
  outerEdge: Point2D[];   // Far edge
  normal: Point2D;        // Outward-facing direction
}
