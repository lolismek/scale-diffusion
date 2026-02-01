#!/usr/bin/env python3
"""
Analyze overlap between street corridors and building footprints.
Outputs statistics and an overhead visualization.
"""

import json
import sys
from pathlib import Path
from typing import List, Tuple
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.collections import PatchCollection
from shapely.geometry import Polygon, box, MultiPolygon, GeometryCollection
from shapely.ops import unary_union
import numpy as np


def load_scene(path: str) -> dict:
    with open(path, 'r') as f:
        return json.load(f)


def street_to_polygon(street: dict) -> Polygon:
    """Convert a StreetCorridor to a Shapely polygon."""
    axis = street['axis']
    center = street['center']
    width = street['width']
    start = street['start']
    end = street['end']
    half_w = width / 2

    if axis == 'z':
        # Street runs along Z axis, centered at X = center
        return box(center - half_w, start, center + half_w, end)
    else:
        # Street runs along X axis, centered at Z = center
        return box(start, center - half_w, end, center + half_w)


def building_to_polygon(building: dict) -> Polygon:
    """Convert building vertices to a Shapely polygon."""
    vertices = building['vertices']
    # Vertices are [x, z] pairs
    return Polygon(vertices)


def compute_grid_internal_area(streets: List[dict], bounds: Tuple[float, float, float, float]) -> MultiPolygon:
    """
    Compute the internal area of the street grid.
    This is the area BETWEEN streets (city blocks), not the streets themselves.

    bounds: (min_x, min_z, max_x, max_z)
    """
    min_x, min_z, max_x, max_z = bounds

    # Create the full bounding box
    full_area = box(min_x, min_z, max_x, max_z)

    # Create union of all street polygons
    street_polygons = [street_to_polygon(s) for s in streets]
    streets_union = unary_union(street_polygons)

    # Internal area is the full area minus the streets
    internal = full_area.difference(streets_union)

    return internal, streets_union


def analyze_overlap(scene_path: str, output_image: str = "overlap_analysis.png"):
    """Main analysis function."""
    scene = load_scene(scene_path)

    buildings = scene.get('buildings', [])
    streets = scene.get('streets', [])
    map_settings = scene.get('map', {})

    if not streets:
        print("No streets found in scene.")
        return

    if not buildings:
        print("No buildings found in scene.")
        return

    # Determine bounds from map settings or data
    width = map_settings.get('width', 2280)
    depth = map_settings.get('depth', 2280)

    # Center the bounds around origin (typical for this data)
    half_w = width / 2
    half_d = depth / 2
    bounds = (-half_w, -half_d, half_w, half_d)

    print(f"Map bounds: {bounds}")
    print(f"Number of streets: {len(streets)}")
    print(f"Number of buildings: {len(buildings)}")

    # Compute street union and internal areas
    internal_area, streets_union = compute_grid_internal_area(streets, bounds)

    # Compute building footprints union
    building_polygons = []
    invalid_count = 0
    for b in buildings:
        poly = building_to_polygon(b)
        if poly.is_valid:
            building_polygons.append(poly)
        else:
            # Try to fix invalid polygons
            fixed = poly.buffer(0)
            if fixed.is_valid and not fixed.is_empty:
                building_polygons.append(fixed)
            else:
                invalid_count += 1

    if invalid_count > 0:
        print(f"Warning: {invalid_count} invalid building polygons skipped")

    buildings_union = unary_union(building_polygons)

    # Calculate areas
    streets_area = streets_union.area
    buildings_area = buildings_union.area
    internal_area_value = internal_area.area

    # Calculate overlap between streets and buildings
    street_building_overlap = streets_union.intersection(buildings_union)
    overlap_area = street_building_overlap.area

    # Calculate what percentage of internal area is covered by buildings
    internal_building_overlap = internal_area.intersection(buildings_union)
    internal_overlap_area = internal_building_overlap.area

    print("\n=== AREA ANALYSIS ===")
    print(f"Total street corridor area: {streets_area:,.2f} sq units")
    print(f"Total building footprint area: {buildings_area:,.2f} sq units")
    print(f"Internal grid area (between streets): {internal_area_value:,.2f} sq units")
    print(f"\nStreet-Building overlap area: {overlap_area:,.2f} sq units")
    print(f"Percentage of streets overlapping buildings: {100 * overlap_area / streets_area:.2f}%")
    print(f"\nInternal area covered by buildings: {internal_overlap_area:,.2f} sq units")
    print(f"Percentage of internal area with buildings: {100 * internal_overlap_area / internal_area_value:.2f}%")

    # Save analysis results to JSON
    results = {
        "streets_area": streets_area,
        "buildings_area": buildings_area,
        "internal_area": internal_area_value,
        "street_building_overlap_area": overlap_area,
        "street_overlap_percentage": 100 * overlap_area / streets_area,
        "internal_building_coverage": internal_overlap_area,
        "internal_coverage_percentage": 100 * internal_overlap_area / internal_area_value,
    }

    results_path = Path(output_image).with_suffix('.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {results_path}")

    # Create visualization
    print("\nGenerating overhead visualization...")
    fig, ax = plt.subplots(1, 1, figsize=(16, 16))

    # Helper to plot any geometry type
    def plot_geometry(geom, ax, **kwargs):
        if geom.is_empty:
            return
        if isinstance(geom, Polygon):
            x, y = geom.exterior.xy
            ax.fill(x, y, **kwargs)
        elif isinstance(geom, (MultiPolygon, GeometryCollection)):
            for g in geom.geoms:
                plot_geometry(g, ax, **kwargs)

    # Plot streets (blue)
    plot_geometry(streets_union, ax, alpha=0.5, fc='blue', ec='darkblue', linewidth=0.5)

    # Plot buildings (red)
    plot_geometry(buildings_union, ax, alpha=0.7, fc='red', ec='darkred', linewidth=0.3)

    # Plot overlap areas (purple)
    if not street_building_overlap.is_empty:
        plot_geometry(street_building_overlap, ax, alpha=0.8, fc='purple', ec='black', linewidth=0.5)

    ax.set_xlim(bounds[0], bounds[2])
    ax.set_ylim(bounds[1], bounds[3])
    ax.set_aspect('equal')
    ax.set_xlabel('X')
    ax.set_ylabel('Z')
    ax.set_title('Overhead View: Streets (blue) vs Buildings (red), Overlap (purple)')

    # Legend
    legend_elements = [
        mpatches.Patch(facecolor='blue', alpha=0.5, label='Streets'),
        mpatches.Patch(facecolor='red', alpha=0.7, label='Buildings'),
        mpatches.Patch(facecolor='purple', alpha=0.8, label='Overlap'),
    ]
    ax.legend(handles=legend_elements, loc='upper right')

    plt.tight_layout()
    plt.savefig(output_image, dpi=150, bbox_inches='tight')
    print(f"Visualization saved to: {output_image}")
    plt.close()

    return results


if __name__ == '__main__':
    if len(sys.argv) < 2:
        scene_path = Path(__file__).parent.parent / 'builds' / 'manhattan_rect_color.json'
    else:
        scene_path = sys.argv[1]

    output_image = sys.argv[2] if len(sys.argv) > 2 else "overlap_analysis.png"

    analyze_overlap(str(scene_path), output_image)
