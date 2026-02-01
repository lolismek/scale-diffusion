#!/usr/bin/env python3
"""
Visualize lanes and intersections for the scenario engine.
Shows street corridors divided into lanes, spawn points, and trajectory paths.
"""

import json
import sys
from pathlib import Path
from typing import List, Tuple, Dict, Any
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.collections import PatchCollection, LineCollection
from shapely.geometry import Polygon, box, MultiPolygon, GeometryCollection, LineString, Point
from shapely.ops import unary_union
import numpy as np

# ══════════════════════════════════════════════════════════════════════════════
# SCENARIO CONSTANTS (from sampleScenarios.ts)
# ══════════════════════════════════════════════════════════════════════════════

MAIN_ROAD_CENTER = -1102.9   # Z-axis street center X coordinate
ROAD_WIDTH = 16
LANE_OFFSET = 4              # Distance from center to lane center

# Lane positions (X coordinates for the main N-S road)
RIGHT_LANE = MAIN_ROAD_CENTER - LANE_OFFSET  # ~-1107 (northbound)
LEFT_LANE = MAIN_ROAD_CENTER + LANE_OFFSET   # ~-1099 (southbound/oncoming)

# Cross street Z positions
CROSS_STREETS = {
    'CROSS_STREET_1': -1096,
    'CROSS_STREET_2': -880,
    'CROSS_STREET_3': -726,
}

# Sample scenarios spawn points and entity start positions
SAMPLE_SCENARIOS = [
    {
        'id': 'oncoming-traffic',
        'name': 'Oncoming Traffic',
        'spawn': {'x': RIGHT_LANE, 'z': -950, 'rotation': 3.14159},
        'entities': [
            {'id': 'car-1', 'start': {'x': LEFT_LANE, 'z': -750}, 'end': {'x': LEFT_LANE, 'z': -1050}, 'color': '#e53935'},
        ],
    },
    {
        'id': 'cut-in',
        'name': 'Highway Cut-In',
        'spawn': {'x': RIGHT_LANE, 'z': -950, 'rotation': 3.14159},
        'entities': [
            {'id': 'car-1', 'start': {'x': LEFT_LANE, 'z': -900}, 'end': {'x': RIGHT_LANE, 'z': -760}, 'color': '#1e88e5'},
        ],
    },
    {
        'id': 'intersection',
        'name': 'Busy Intersection',
        'spawn': {'x': RIGHT_LANE, 'z': -950, 'rotation': 3.14159},
        'entities': [
            {'id': 'car-1', 'start': {'x': -1200, 'z': -880}, 'end': {'x': -1000, 'z': -880}, 'color': '#43a047'},
            {'id': 'car-2', 'start': {'x': -1000, 'z': -876}, 'end': {'x': -1200, 'z': -876}, 'color': '#fb8c00'},
            {'id': 'ped-1', 'start': {'x': -1115, 'z': -890}, 'end': {'x': -1090, 'z': -890}, 'color': '#ffeb3b'},
        ],
    },
    {
        'id': 'obstacle-course',
        'name': 'Road Debris',
        'spawn': {'x': RIGHT_LANE, 'z': -1000, 'rotation': 3.14159},
        'entities': [
            {'id': 'obstacle-1', 'start': {'x': RIGHT_LANE - 1, 'z': -950}, 'end': None, 'color': '#ff5722'},
            {'id': 'obstacle-2', 'start': {'x': RIGHT_LANE + 1, 'z': -900}, 'end': None, 'color': '#ff5722'},
            {'id': 'obstacle-3', 'start': {'x': RIGHT_LANE, 'z': -850}, 'end': None, 'color': '#ff5722'},
            {'id': 'obstacle-4', 'start': {'x': RIGHT_LANE - 2, 'z': -800}, 'end': None, 'color': '#ff5722'},
        ],
    },
    {
        'id': 'follow-traffic',
        'name': 'Lead Vehicle Braking',
        'spawn': {'x': RIGHT_LANE, 'z': -950, 'rotation': 3.14159},
        'entities': [
            {'id': 'lead-car', 'start': {'x': RIGHT_LANE, 'z': -920}, 'end': {'x': RIGHT_LANE, 'z': -780}, 'color': '#5e35b1'},
        ],
    },
    {
        'id': 'heavy-traffic',
        'name': 'Heavy Traffic',
        'spawn': {'x': RIGHT_LANE, 'z': -1000, 'rotation': 3.14159},
        'entities': [
            {'id': 'slow-car', 'start': {'x': RIGHT_LANE, 'z': -950}, 'end': {'x': RIGHT_LANE, 'z': -850}, 'color': '#795548'},
            {'id': 'fast-car', 'start': {'x': LEFT_LANE, 'z': -980}, 'end': {'x': LEFT_LANE, 'z': -700}, 'color': '#00bcd4'},
            {'id': 'oncoming-car', 'start': {'x': MAIN_ROAD_CENTER - LANE_OFFSET - 4, 'z': -750},
             'end': {'x': MAIN_ROAD_CENTER - LANE_OFFSET - 4, 'z': -1050}, 'color': '#e91e63'},
        ],
    },
]

# ══════════════════════════════════════════════════════════════════════════════
# LANE COLORS
# ══════════════════════════════════════════════════════════════════════════════

# Distinct colors for lanes (colorblind-friendly palette)
LANE_COLORS = [
    '#2196F3',  # Blue
    '#4CAF50',  # Green
    '#FF9800',  # Orange
    '#9C27B0',  # Purple
    '#00BCD4',  # Cyan
    '#FFEB3B',  # Yellow
    '#E91E63',  # Pink
    '#795548',  # Brown
]

INTERSECTION_COLOR = '#F44336'  # Red
SPAWN_COLOR = '#FFFFFF'         # White
SPAWN_EDGE = '#000000'          # Black
TRAJECTORY_ALPHA = 0.8

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════


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


def derive_lanes(street: dict, lane_width: float = 4.0) -> List[dict]:
    """
    Divide a street corridor into lanes.
    Returns list of lane dicts with polygon and metadata.
    """
    axis = street['axis']
    center = street['center']
    width = street['width']
    start = street['start']
    end = street['end']

    num_lanes = max(1, int(width / lane_width))
    actual_lane_width = width / num_lanes

    lanes = []
    for i in range(num_lanes):
        # Calculate lane boundaries
        if axis == 'z':
            # Street runs N-S along Z axis
            lane_start_x = center - width / 2 + i * actual_lane_width
            lane_end_x = lane_start_x + actual_lane_width
            lane_center_x = (lane_start_x + lane_end_x) / 2
            poly = box(lane_start_x, start, lane_end_x, end)
            lane_info = {
                'index': i,
                'axis': axis,
                'polygon': poly,
                'center_line': LineString([(lane_center_x, start), (lane_center_x, end)]),
                'center_coord': lane_center_x,
                'direction': 'northbound' if i >= num_lanes // 2 else 'southbound',
            }
        else:
            # Street runs E-W along X axis
            lane_start_z = center - width / 2 + i * actual_lane_width
            lane_end_z = lane_start_z + actual_lane_width
            lane_center_z = (lane_start_z + lane_end_z) / 2
            poly = box(start, lane_start_z, end, lane_end_z)
            lane_info = {
                'index': i,
                'axis': axis,
                'polygon': poly,
                'center_line': LineString([(start, lane_center_z), (end, lane_center_z)]),
                'center_coord': lane_center_z,
                'direction': 'eastbound' if i >= num_lanes // 2 else 'westbound',
            }

        lanes.append(lane_info)

    return lanes


def find_intersections(streets: List[dict]) -> List[Polygon]:
    """Find intersection areas where streets cross."""
    intersections = []

    z_streets = [s for s in streets if s['axis'] == 'z']
    x_streets = [s for s in streets if s['axis'] == 'x']

    for z_street in z_streets:
        z_poly = street_to_polygon(z_street)
        for x_street in x_streets:
            x_poly = street_to_polygon(x_street)
            intersection = z_poly.intersection(x_poly)
            if not intersection.is_empty and intersection.area > 1:
                intersections.append(intersection)

    return intersections


def plot_geometry(geom, ax, **kwargs):
    """Plot any Shapely geometry."""
    if geom.is_empty:
        return
    if isinstance(geom, Polygon):
        x, y = geom.exterior.xy
        ax.fill(x, y, **kwargs)
    elif isinstance(geom, (MultiPolygon, GeometryCollection)):
        for g in geom.geoms:
            plot_geometry(g, ax, **kwargs)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN VISUALIZATION
# ══════════════════════════════════════════════════════════════════════════════


def visualize_lanes(scene_path: str, output_image: str = "lane_diagram.png",
                    focus_area: Tuple[float, float, float, float] = None):
    """Generate lane and intersection visualization."""
    scene = load_scene(scene_path)

    streets = scene.get('streets', [])
    buildings = scene.get('buildings', [])
    map_settings = scene.get('map', {})

    if not streets:
        print("No streets found in scene.")
        return

    # Determine bounds
    width = map_settings.get('width', 2280)
    depth = map_settings.get('depth', 2280)
    half_w = width / 2
    half_d = depth / 2
    full_bounds = (-half_w, -half_d, half_w, half_d)

    # Focus on scenario area if not specified
    if focus_area is None:
        # Default: focus on the main scenario area around the main road
        focus_area = (-1200, -1100, -1000, -650)

    print(f"Full map bounds: {full_bounds}")
    print(f"Focus area: {focus_area}")
    print(f"Number of streets: {len(streets)}")

    # Create figure with two subplots: overview and detail
    fig, axes = plt.subplots(1, 2, figsize=(20, 10))
    ax_overview, ax_detail = axes

    # ══════════════════════════════════════════════════════════════════════════
    # PROCESS STREETS AND LANES
    # ══════════════════════════════════════════════════════════════════════════

    all_lanes = []
    for street in streets:
        lanes = derive_lanes(street, lane_width=4.0)
        all_lanes.extend(lanes)

    print(f"Total lanes derived: {len(all_lanes)}")

    # Find intersections
    intersections = find_intersections(streets)
    print(f"Intersections found: {len(intersections)}")

    # ══════════════════════════════════════════════════════════════════════════
    # PLOT FUNCTION FOR BOTH VIEWS
    # ══════════════════════════════════════════════════════════════════════════

    def plot_lanes_and_scenarios(ax, bounds, show_labels=False):
        # Plot lanes with colors
        for lane in all_lanes:
            poly = lane['polygon']
            # Check if lane is in bounds
            if not poly.intersects(box(*bounds)):
                continue

            color_idx = lane['index'] % len(LANE_COLORS)
            plot_geometry(poly, ax, alpha=0.4, fc=LANE_COLORS[color_idx],
                         ec='white', linewidth=0.5)

            # Draw center line
            cx, cy = lane['center_line'].xy
            ax.plot(cx, cy, color=LANE_COLORS[color_idx], linewidth=1,
                   linestyle='--', alpha=0.7)

        # Plot intersections
        for isect in intersections:
            if not isect.intersects(box(*bounds)):
                continue
            plot_geometry(isect, ax, alpha=0.6, fc=INTERSECTION_COLOR,
                         ec='darkred', linewidth=1)

        # ══════════════════════════════════════════════════════════════════════
        # OVERLAY SCENARIO CONSTANTS
        # ══════════════════════════════════════════════════════════════════════

        # Draw main road reference lines
        ax.axvline(x=MAIN_ROAD_CENTER, color='white', linewidth=2,
                   linestyle='-', alpha=0.8, label='Road Center')
        ax.axvline(x=RIGHT_LANE, color='#00FF00', linewidth=2,
                   linestyle='--', alpha=0.9, label=f'Right Lane ({RIGHT_LANE:.1f})')
        ax.axvline(x=LEFT_LANE, color='#FF00FF', linewidth=2,
                   linestyle='--', alpha=0.9, label=f'Left Lane ({LEFT_LANE:.1f})')

        # Draw cross streets
        for name, z_pos in CROSS_STREETS.items():
            if bounds[1] <= z_pos <= bounds[3]:
                ax.axhline(y=z_pos, color='#FFFF00', linewidth=1.5,
                          linestyle=':', alpha=0.7)
                if show_labels:
                    ax.text(bounds[0] + 5, z_pos + 5, name,
                           fontsize=8, color='yellow', fontweight='bold')

        # ══════════════════════════════════════════════════════════════════════
        # PLOT SPAWN POINTS AND TRAJECTORIES
        # ══════════════════════════════════════════════════════════════════════

        for scenario in SAMPLE_SCENARIOS:
            spawn = scenario['spawn']

            # Check if in bounds
            if not (bounds[0] <= spawn['x'] <= bounds[2] and
                    bounds[1] <= spawn['z'] <= bounds[3]):
                continue

            # Draw spawn point
            ax.scatter(spawn['x'], spawn['z'], s=150, c=SPAWN_COLOR,
                      edgecolors=SPAWN_EDGE, linewidth=2, zorder=10,
                      marker='o')

            # Draw spawn direction arrow
            arrow_len = 15
            dx = np.sin(spawn['rotation']) * arrow_len
            dz = np.cos(spawn['rotation']) * arrow_len
            ax.arrow(spawn['x'], spawn['z'], dx, dz,
                    head_width=5, head_length=3, fc='lime', ec='black',
                    linewidth=1, zorder=11)

            if show_labels:
                ax.text(spawn['x'] + 10, spawn['z'], scenario['name'],
                       fontsize=7, color='white', fontweight='bold',
                       bbox=dict(boxstyle='round', facecolor='black', alpha=0.7))

            # Draw entity trajectories
            for entity in scenario['entities']:
                start = entity['start']
                end = entity.get('end')
                color = entity['color']

                # Draw start position
                ax.scatter(start['x'], start['z'], s=80, c=color,
                          edgecolors='white', linewidth=1.5, zorder=9,
                          marker='s')

                # Draw trajectory line if has end
                if end:
                    ax.plot([start['x'], end['x']], [start['z'], end['z']],
                           color=color, linewidth=2, alpha=TRAJECTORY_ALPHA,
                           linestyle='-', zorder=8)
                    ax.scatter(end['x'], end['z'], s=60, c=color,
                              edgecolors='white', linewidth=1, zorder=9,
                              marker='^')

        # Set bounds and style
        ax.set_xlim(bounds[0], bounds[2])
        ax.set_ylim(bounds[1], bounds[3])
        ax.set_aspect('equal')
        ax.set_facecolor('#1a1a1a')
        ax.grid(True, alpha=0.2, color='gray')

    # ══════════════════════════════════════════════════════════════════════════
    # RENDER BOTH VIEWS
    # ══════════════════════════════════════════════════════════════════════════

    # Overview (zoomed out to show all scenario area)
    overview_bounds = (-1250, -1150, -950, -600)
    plot_lanes_and_scenarios(ax_overview, overview_bounds, show_labels=True)
    ax_overview.set_xlabel('X (meters)', fontsize=10)
    ax_overview.set_ylabel('Z (meters)', fontsize=10)
    ax_overview.set_title('Scenario Lanes & Intersections - Overview', fontsize=12, fontweight='bold')

    # Detail view (focused on main intersection area)
    detail_bounds = (-1150, -950, -1050, -800)
    plot_lanes_and_scenarios(ax_detail, detail_bounds, show_labels=True)
    ax_detail.set_xlabel('X (meters)', fontsize=10)
    ax_detail.set_ylabel('Z (meters)', fontsize=10)
    ax_detail.set_title('Detail View - Main Intersection Area', fontsize=12, fontweight='bold')

    # ══════════════════════════════════════════════════════════════════════════
    # LEGEND
    # ══════════════════════════════════════════════════════════════════════════

    legend_elements = [
        mpatches.Patch(facecolor=LANE_COLORS[0], alpha=0.4, label='Lane 0 (outer left)'),
        mpatches.Patch(facecolor=LANE_COLORS[1], alpha=0.4, label='Lane 1'),
        mpatches.Patch(facecolor=LANE_COLORS[2], alpha=0.4, label='Lane 2'),
        mpatches.Patch(facecolor=LANE_COLORS[3], alpha=0.4, label='Lane 3 (outer right)'),
        mpatches.Patch(facecolor=INTERSECTION_COLOR, alpha=0.6, label='Intersection'),
        plt.Line2D([0], [0], color='white', linewidth=2, label=f'Road Center ({MAIN_ROAD_CENTER})'),
        plt.Line2D([0], [0], color='#00FF00', linewidth=2, linestyle='--',
                   label=f'RIGHT_LANE ({RIGHT_LANE:.1f})'),
        plt.Line2D([0], [0], color='#FF00FF', linewidth=2, linestyle='--',
                   label=f'LEFT_LANE ({LEFT_LANE:.1f})'),
        plt.Line2D([0], [0], color='#FFFF00', linewidth=1.5, linestyle=':',
                   label='Cross Streets'),
        plt.scatter([], [], s=150, c=SPAWN_COLOR, edgecolors=SPAWN_EDGE,
                   linewidth=2, marker='o', label='Player Spawn'),
        plt.scatter([], [], s=80, c='gray', edgecolors='white', marker='s',
                   label='Entity Start'),
        plt.scatter([], [], s=60, c='gray', edgecolors='white', marker='^',
                   label='Entity End'),
    ]

    fig.legend(handles=legend_elements, loc='lower center', ncol=4,
              fontsize=9, framealpha=0.9)

    plt.tight_layout()
    plt.subplots_adjust(bottom=0.15)
    plt.savefig(output_image, dpi=150, bbox_inches='tight', facecolor='#2d2d2d')
    print(f"\nVisualization saved to: {output_image}")
    plt.close()

    # ══════════════════════════════════════════════════════════════════════════
    # PRINT LANE SUMMARY
    # ══════════════════════════════════════════════════════════════════════════

    print("\n" + "═" * 60)
    print("SCENARIO CONSTANTS REFERENCE")
    print("═" * 60)
    print(f"MAIN_ROAD_CENTER = {MAIN_ROAD_CENTER}")
    print(f"ROAD_WIDTH = {ROAD_WIDTH}")
    print(f"LANE_OFFSET = {LANE_OFFSET}")
    print(f"RIGHT_LANE = {RIGHT_LANE:.1f}")
    print(f"LEFT_LANE = {LEFT_LANE:.1f}")
    print()
    print("Cross Streets (Z positions):")
    for name, z in CROSS_STREETS.items():
        print(f"  {name} = {z}")
    print()
    print("Spawn Points:")
    for s in SAMPLE_SCENARIOS:
        spawn = s['spawn']
        print(f"  {s['name']}: ({spawn['x']:.1f}, {spawn['z']:.1f})")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        scene_path = Path(__file__).parent.parent / 'builds' / 'manhattan_clean_dashes.json'
    else:
        scene_path = sys.argv[1]

    output_image = sys.argv[2] if len(sys.argv) > 2 else str(
        Path(__file__).parent / "lane_diagram.png"
    )

    visualize_lanes(str(scene_path), output_image)
