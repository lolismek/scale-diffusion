#!/usr/bin/env python3
"""
Remove parts of street corridors that overlap with building footprints.
Outputs a cleaned scene JSON and visualization.
"""

import json
import sys
from pathlib import Path
from typing import List
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from shapely.geometry import Polygon, box, MultiPolygon, GeometryCollection, mapping
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


def polygon_to_vertices(poly: Polygon) -> List[List[float]]:
    """Convert a Shapely polygon to a list of [x, z] vertices."""
    coords = list(poly.exterior.coords)
    # Remove the closing duplicate point
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    return [[float(x), float(y)] for x, y in coords]


def extract_polygons(geom) -> List[Polygon]:
    """Extract all polygons from any geometry type."""
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    elif isinstance(geom, (MultiPolygon, GeometryCollection)):
        result = []
        for g in geom.geoms:
            result.extend(extract_polygons(g))
        return result
    return []


def remove_overlap(scene_path: str, output_json: str, output_image: str):
    """Remove street-building overlaps and output cleaned data."""
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

    # Create street polygons and subtract buildings
    original_street_polygons = [street_to_polygon(s) for s in streets]
    original_streets_union = unary_union(original_street_polygons)

    # Subtract buildings from streets
    cleaned_streets = original_streets_union.difference(buildings_union)
    print(f"Street-building subtraction complete")

    # Calculate areas for comparison
    original_area = original_streets_union.area
    cleaned_area = cleaned_streets.area
    removed_area = original_area - cleaned_area

    print(f"\n=== CLEANING RESULTS ===")
    print(f"Original street area: {original_area:,.2f} sq units")
    print(f"Cleaned street area: {cleaned_area:,.2f} sq units")
    print(f"Removed area: {removed_area:,.2f} sq units ({100 * removed_area / original_area:.2f}%)")

    # Extract cleaned street polygons as simplified geometry
    cleaned_polys = extract_polygons(cleaned_streets)
    print(f"Cleaned streets decomposed into {len(cleaned_polys)} polygons")

    # Convert cleaned streets to a format we can export
    # We'll export as generic polygons since they're no longer simple corridors
    cleaned_street_data = []
    for i, poly in enumerate(cleaned_polys):
        if poly.is_valid and not poly.is_empty and poly.area > 1:  # Skip tiny fragments
            cleaned_street_data.append({
                "vertices": polygon_to_vertices(poly),
                "height": 0.02,  # Thin street surface
                "color": "#444444"  # Dark gray for streets
            })

    print(f"Exported {len(cleaned_street_data)} cleaned street polygons")

    # Create output scene
    output_scene = {
        "map": scene.get('map', {}),
        "buildings": scene.get('buildings', []),
        "cleanedStreets": cleaned_street_data,  # New format (camelCase for JS)
        "tileWidth": scene.get('tileWidth'),
        "tileDepth": scene.get('tileDepth'),
    }

    # Remove None values
    output_scene = {k: v for k, v in output_scene.items() if v is not None}

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

    # Plot cleaned streets (green)
    plot_geometry(cleaned_streets, ax, alpha=0.6, fc='green', ec='darkgreen', linewidth=0.3)

    # Plot buildings (red)
    plot_geometry(buildings_union, ax, alpha=0.7, fc='red', ec='darkred', linewidth=0.3)

    ax.set_xlim(bounds[0], bounds[2])
    ax.set_ylim(bounds[1], bounds[3])
    ax.set_aspect('equal')
    ax.set_xlabel('X')
    ax.set_ylabel('Z')
    ax.set_title('Cleaned Streets (green) - Building Overlaps Removed')

    legend_elements = [
        mpatches.Patch(facecolor='green', alpha=0.6, label='Cleaned Streets'),
        mpatches.Patch(facecolor='red', alpha=0.7, label='Buildings'),
    ]
    ax.legend(handles=legend_elements, loc='upper right')

    plt.tight_layout()
    plt.savefig(output_image, dpi=150, bbox_inches='tight')
    print(f"Visualization saved to: {output_image}")
    plt.close()

    # Save summary
    summary = {
        "original_street_area": original_area,
        "cleaned_street_area": cleaned_area,
        "removed_area": removed_area,
        "removed_percentage": 100 * removed_area / original_area,
        "num_cleaned_polygons": len(cleaned_street_data),
    }
    summary_path = Path(output_image).with_suffix('.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"Summary saved to: {summary_path}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        scene_path = Path(__file__).parent.parent / 'builds' / 'manhattan_rect_color.json'
    else:
        scene_path = sys.argv[1]

    output_json = sys.argv[2] if len(sys.argv) > 2 else "cleaned_scene.json"
    output_image = sys.argv[3] if len(sys.argv) > 3 else "cleaned_streets.png"

    remove_overlap(str(scene_path), output_json, output_image)
