#!/usr/bin/env python3
"""
Update street corridor interrupts to exclude building footprints.
This makes dashed lines only appear on actual street surface.
"""

import json
import sys
from pathlib import Path
from typing import List, Tuple
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from shapely.geometry import Polygon, box, MultiPolygon, GeometryCollection, LineString
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
        return box(center - half_w, start, center + half_w, end)
    else:
        return box(start, center - half_w, end, center + half_w)


def building_to_polygon(building: dict) -> Polygon:
    """Convert building vertices to a Shapely polygon."""
    vertices = building['vertices']
    return Polygon(vertices)


def get_interrupt_ranges(street: dict, buildings_union) -> List[List[float]]:
    """
    Find ranges along street axis where buildings block the street.
    Returns list of [start, end] pairs to add to interrupts.
    """
    axis = street['axis']
    center = street['center']
    width = street['width']
    start = street['start']
    end = street['end']
    half_w = width / 2

    # Create the street polygon
    street_poly = street_to_polygon(street)

    # Find intersection with buildings
    intersection = street_poly.intersection(buildings_union)

    if intersection.is_empty:
        return []

    # Extract all polygons from intersection
    def extract_polys(geom):
        if geom.is_empty:
            return []
        if isinstance(geom, Polygon):
            return [geom]
        elif isinstance(geom, (MultiPolygon, GeometryCollection)):
            result = []
            for g in geom.geoms:
                result.extend(extract_polys(g))
            return result
        return []

    polys = extract_polys(intersection)

    # For each intersection polygon, find its extent along the street axis
    interrupts = []
    for poly in polys:
        if poly.is_empty or poly.area < 0.1:
            continue
        bounds = poly.bounds  # (minx, miny, maxx, maxy)

        if axis == 'z':
            # Street runs along Z, so interrupt range is in Z
            int_start = bounds[1]  # miny
            int_end = bounds[3]    # maxy
        else:
            # Street runs along X, so interrupt range is in X
            int_start = bounds[0]  # minx
            int_end = bounds[2]    # maxx

        # Clamp to street bounds
        int_start = max(int_start, start)
        int_end = min(int_end, end)

        if int_end > int_start:
            interrupts.append([int_start, int_end])

    return interrupts


def merge_interrupts(interrupts: List[List[float]]) -> List[List[float]]:
    """Merge overlapping interrupt ranges."""
    if not interrupts:
        return []

    # Sort by start
    sorted_ints = sorted(interrupts, key=lambda x: x[0])

    merged = [sorted_ints[0]]
    for curr in sorted_ints[1:]:
        last = merged[-1]
        if curr[0] <= last[1] + 0.1:  # Small tolerance for merging
            last[1] = max(last[1], curr[1])
        else:
            merged.append(curr)

    return merged


def clean_streets(scene_path: str, output_json: str, output_image: str):
    """Update street interrupts to exclude building footprints."""
    scene = load_scene(scene_path)

    buildings = scene.get('buildings', [])
    streets = scene.get('streets', [])
    map_settings = scene.get('map', {})

    if not streets:
        print("No streets found in scene.")
        return

    # Determine bounds
    width = map_settings.get('width', 2280)
    depth = map_settings.get('depth', 2280)
    half_w = width / 2
    half_d = depth / 2
    bounds = (-half_w, -half_d, half_w, half_d)

    print(f"Map bounds: {bounds}")
    print(f"Number of streets: {len(streets)}")
    print(f"Number of buildings: {len(buildings)}")

    # Create building footprints union
    building_polygons = []
    for b in buildings:
        poly = building_to_polygon(b)
        if poly.is_valid:
            building_polygons.append(poly)
        else:
            fixed = poly.buffer(0)
            if fixed.is_valid and not fixed.is_empty:
                building_polygons.append(fixed)

    buildings_union = unary_union(building_polygons)
    print(f"Buildings union created")

    # Update each street's interrupts
    cleaned_streets = []
    total_new_interrupts = 0

    for street in streets:
        # Get new interrupts from building intersections
        new_interrupts = get_interrupt_ranges(street, buildings_union)

        # Combine with existing interrupts
        all_interrupts = list(street.get('interrupts', [])) + new_interrupts
        merged_interrupts = merge_interrupts(all_interrupts)

        total_new_interrupts += len(new_interrupts)

        cleaned_street = {
            'axis': street['axis'],
            'center': street['center'],
            'width': street['width'],
            'start': street['start'],
            'end': street['end'],
            'interrupts': merged_interrupts,
        }
        cleaned_streets.append(cleaned_street)

    print(f"Added {total_new_interrupts} new interrupt ranges from building intersections")

    # Create output scene
    output_scene = {
        "map": scene.get('map', {}),
        "buildings": scene.get('buildings', []),
        "streets": cleaned_streets,
    }

    # Preserve tiling info if present
    if scene.get('tileWidth'):
        output_scene['tileWidth'] = scene['tileWidth']
    if scene.get('tileDepth'):
        output_scene['tileDepth'] = scene['tileDepth']

    with open(output_json, 'w') as f:
        json.dump(output_scene, f)
    print(f"\nCleaned scene saved to: {output_json}")

    # Create visualization
    print("\nGenerating visualization...")
    fig, ax = plt.subplots(1, 1, figsize=(16, 16))

    def plot_geometry(geom, ax, **kwargs):
        if geom.is_empty:
            return
        if isinstance(geom, Polygon):
            x, y = geom.exterior.xy
            ax.fill(x, y, **kwargs)
        elif isinstance(geom, (MultiPolygon, GeometryCollection)):
            for g in geom.geoms:
                plot_geometry(g, ax, **kwargs)

    # Plot buildings (red)
    plot_geometry(buildings_union, ax, alpha=0.7, fc='red', ec='darkred', linewidth=0.3)

    # Plot street center lines where dashes will appear (yellow)
    # This shows the "clear" segments between interrupts
    for street in cleaned_streets:
        axis = street['axis']
        center = street['center']
        start = street['start']
        end = street['end']
        interrupts = street['interrupts']

        # Find clear segments
        clear_segs = []
        cursor = start
        for int_start, int_end in sorted(interrupts, key=lambda x: x[0]):
            if int_start > cursor:
                clear_segs.append((cursor, int_start))
            cursor = max(cursor, int_end)
        if cursor < end:
            clear_segs.append((cursor, end))

        # Draw clear segments as lines
        for seg_start, seg_end in clear_segs:
            if axis == 'z':
                ax.plot([center, center], [seg_start, seg_end],
                       color='yellow', linewidth=2, alpha=0.8)
            else:
                ax.plot([seg_start, seg_end], [center, center],
                       color='yellow', linewidth=2, alpha=0.8)

    ax.set_xlim(bounds[0], bounds[2])
    ax.set_ylim(bounds[1], bounds[3])
    ax.set_aspect('equal')
    ax.set_xlabel('X')
    ax.set_ylabel('Z')
    ax.set_title('Cleaned Street Dashes (yellow lines show where dashes will appear)')

    legend_elements = [
        mpatches.Patch(facecolor='red', alpha=0.7, label='Buildings'),
        mpatches.Patch(facecolor='yellow', alpha=0.8, label='Dash locations'),
    ]
    ax.legend(handles=legend_elements, loc='upper right')

    plt.tight_layout()
    plt.savefig(output_image, dpi=150, bbox_inches='tight')
    print(f"Visualization saved to: {output_image}")
    plt.close()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        scene_path = Path(__file__).parent.parent / 'builds' / 'manhattan_rect_color.json'
    else:
        scene_path = sys.argv[1]

    output_json = sys.argv[2] if len(sys.argv) > 2 else "cleaned_streets.json"
    output_image = sys.argv[3] if len(sys.argv) > 3 else "dash_preview.png"

    clean_streets(str(scene_path), output_json, output_image)
