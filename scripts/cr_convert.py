"""
Convert CommonRoad scenario XMLs to a TypeScript scenario file.
Outputs frontend/game/src/scenarios/commonroadScenarios.ts
"""

import os
import glob
import json
import math
import numpy as np
from commonroad.common.file_reader import CommonRoadFileReader

XML_DIR = os.path.join(os.path.dirname(__file__), "commonroad_xml")
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "frontend",
    "game",
    "src",
    "scenarios",
    "commonroadScenarios.ts",
)

# Game coordinate targets (Manhattan road)
ROAD_CENTER_X = -1102.9
ROAD_CENTER_Z = -900.0

# Max trajectory points per entity (downsample if more)
MAX_TRAJ_POINTS = 60

# Entity colors by type
VEHICLE_COLORS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#5e35b1", "#00bcd4", "#795548"]
TRUCK_COLORS = ["#6d4c41", "#546e7a", "#4e342e"]
PEDESTRIAN_COLORS = ["#ffeb3b", "#ffc107", "#ff9800"]
BICYCLE_COLORS = ["#66bb6a", "#26a69a"]

# Height estimates by type
HEIGHT_MAP = {
    "vehicle": 1.5,
    "truck": 2.5,
    "bus": 3.0,
    "pedestrian": 1.8,
    "bicycle": 1.6,
    "obstacle": 1.0,
}


def classify_obstacle(obs_type_str: str) -> str:
    """Map CommonRoad obstacle type to our game entity type."""
    t = obs_type_str.lower()
    if any(k in t for k in ["car", "truck", "bus", "priority", "taxi"]):
        return "vehicle"
    if "pedestrian" in t:
        return "pedestrian"
    if "bicycle" in t:
        return "bicycle"
    return "obstacle"


def get_color(entity_type: str, index: int) -> str:
    """Get a color for an entity based on type and index."""
    if entity_type == "vehicle":
        return VEHICLE_COLORS[index % len(VEHICLE_COLORS)]
    if entity_type == "pedestrian":
        return PEDESTRIAN_COLORS[index % len(PEDESTRIAN_COLORS)]
    if entity_type == "bicycle":
        return BICYCLE_COLORS[index % len(BICYCLE_COLORS)]
    return "#ff5722"


def get_height(obs_type_str: str) -> float:
    """Estimate entity height from CommonRoad type."""
    t = obs_type_str.lower()
    if "truck" in t or "bus" in t:
        return 2.5
    if "pedestrian" in t:
        return 1.8
    if "bicycle" in t:
        return 1.6
    return 1.5


def find_main_road_angle(scenario) -> float:
    """Find the primary road direction angle by analyzing the longest lanelet chain."""
    lanelets = scenario.lanelet_network.lanelets
    if not lanelets:
        return 0.0

    # Find longest lanelet by center_vertices path length
    best_angle = 0.0
    best_length = 0.0

    for ll in lanelets:
        verts = ll.center_vertices
        if len(verts) < 2:
            continue
        length = float(np.sum(np.linalg.norm(np.diff(verts, axis=0), axis=1)))
        if length > best_length:
            best_length = length
            dx = verts[-1][0] - verts[0][0]
            dy = verts[-1][1] - verts[0][1]
            best_angle = math.atan2(dy, dx)

    return best_angle


def compute_centroid(scenario) -> tuple[float, float]:
    """Compute the centroid of all obstacle trajectories and lanelet centers."""
    all_x, all_y = [], []

    for obs in scenario.dynamic_obstacles:
        if hasattr(obs, "prediction") and obs.prediction:
            for st in obs.prediction.trajectory.state_list:
                all_x.append(st.position[0])
                all_y.append(st.position[1])

    # Include initial states
    for obs in scenario.dynamic_obstacles:
        if hasattr(obs, "initial_state") and obs.initial_state:
            all_x.append(obs.initial_state.position[0])
            all_y.append(obs.initial_state.position[1])

    if not all_x:
        # Fallback to lanelet centers
        for ll in scenario.lanelet_network.lanelets:
            for v in ll.center_vertices:
                all_x.append(v[0])
                all_y.append(v[1])

    if not all_x:
        return 0.0, 0.0

    return float(np.mean(all_x)), float(np.mean(all_y))


def transform_position(
    x_cr: float, y_cr: float, angle: float, cx: float, cy: float
) -> tuple[float, float]:
    """Transform CommonRoad coordinates to game coordinates."""
    # Center on scenario centroid
    dx = x_cr - cx
    dy = y_cr - cy
    # Rotate to align road with Z-axis (subtract angle to align with north-south)
    cos_a = math.cos(-angle + math.pi / 2)
    sin_a = math.sin(-angle + math.pi / 2)
    x_rot = dx * cos_a - dy * sin_a
    z_rot = dx * sin_a + dy * cos_a
    # Translate to Manhattan position
    x_game = x_rot + ROAD_CENTER_X
    z_game = z_rot + ROAD_CENTER_Z
    return round(x_game, 1), round(z_game, 1)


def transform_orientation(cr_orientation: float, road_angle: float) -> float:
    """Transform CommonRoad orientation to Three.js rotation.

    CommonRoad: angle from +x axis, CCW positive
    Three.js: rotation around Y axis, 0 = facing -Z (south), PI = facing +Z (north)
    """
    # Adjust for road rotation, then convert to Three.js convention
    relative = cr_orientation - road_angle
    # In Three.js: 0 = south (-Z), PI = north (+Z), PI/2 = west (-X)
    # CommonRoad relative 0 = along road, PI/2 = left of road
    game_rot = -relative + math.pi
    # Normalize to [-PI, PI]
    game_rot = (game_rot + math.pi) % (2 * math.pi) - math.pi
    return round(game_rot, 3)


def downsample_trajectory(points: list, max_points: int) -> list:
    """Downsample trajectory to at most max_points, keeping first and last."""
    if len(points) <= max_points:
        return points
    # Always keep first and last
    indices = [0]
    step = (len(points) - 1) / (max_points - 1)
    for i in range(1, max_points - 1):
        indices.append(int(round(i * step)))
    indices.append(len(points) - 1)
    # Remove duplicates while preserving order
    seen = set()
    unique = []
    for idx in indices:
        if idx not in seen:
            seen.add(idx)
            unique.append(idx)
    return [points[i] for i in unique]


def make_scenario_id(filename: str) -> str:
    """Generate a kebab-case scenario ID from filename."""
    name = filename.replace(".xml", "")
    # Replace underscores and dots with hyphens, lowercase
    return "cr-" + name.lower().replace("_", "-").replace(".", "-")


def make_scenario_name(filename: str) -> str:
    """Generate a human-readable scenario name."""
    name = filename.replace(".xml", "")
    parts = name.split("_")

    # Parse the standard CommonRoad naming: Country_Road-Section_Variant_T-Version
    if len(parts) >= 2:
        country = parts[0]
        road = parts[1]

        # Build readable name
        road_name = road.replace("-", " ")

        if "Tjunction" in name:
            return f"T-Junction ({road_name})"
        if "US101" in name:
            return f"Highway US-101 ({road_name})"
        if "A9" in name or "A99" in name:
            return f"Autobahn {road_name}"
        if "Muc" in name:
            return f"Munich Urban ({road_name})"
        if "B471" in name:
            return f"Urban B471 ({road_name})"
        if "Flensburg" in name:
            return f"Flensburg ({road_name})"

        return f"{country} {road_name}"

    return name


def make_description(filename: str, num_obstacles: int, tags: list) -> str:
    """Generate a scenario description."""
    parts = []
    if "Tjunction" in filename:
        parts.append("T-junction intersection scenario")
    elif "US101" in filename:
        parts.append("Highway driving scenario")
    elif "A9" in filename or "A99" in filename:
        parts.append("Autobahn scenario")
    elif "Muc" in filename:
        parts.append("Munich urban driving scenario")
    elif "B471" in filename:
        parts.append("Urban road scenario")
    elif "Flensburg" in filename:
        parts.append("Urban scenario with SUMO simulation")
    else:
        parts.append("Driving scenario")

    parts.append(f"with {num_obstacles} {'vehicle' if num_obstacles == 1 else 'vehicles'}")

    tag_str = ", ".join(str(t) for t in tags) if tags else ""
    if tag_str:
        parts.append(f"({tag_str})")

    return " ".join(parts)


def convert_scenario(filepath: str) -> dict | None:
    """Convert a single CommonRoad scenario to our format."""
    filename = os.path.basename(filepath)

    try:
        scenario, planning_problem_set = CommonRoadFileReader(filepath).open()
    except Exception as e:
        print(f"  [error] {filename}: {e}")
        return None

    if not scenario.dynamic_obstacles:
        print(f"  [skip] {filename}: no dynamic obstacles")
        return None

    # Find road angle and centroid
    road_angle = find_main_road_angle(scenario)
    cx, cy = compute_centroid(scenario)
    dt = scenario.dt

    # Tags
    tags = []
    if hasattr(scenario, "tags") and scenario.tags:
        tags = list(scenario.tags)

    # Convert entities
    entities = []
    color_counters = {"vehicle": 0, "pedestrian": 0, "bicycle": 0, "obstacle": 0}

    for obs in scenario.dynamic_obstacles:
        obs_type_str = str(obs.obstacle_type)
        entity_type = classify_obstacle(obs_type_str)
        color_idx = color_counters[entity_type]
        color_counters[entity_type] += 1

        # Dimensions
        shape = obs.obstacle_shape
        width = 2.0
        depth = 4.0
        if hasattr(shape, "width"):
            width = float(shape.width)
        if hasattr(shape, "length"):
            depth = float(shape.length)

        height = get_height(obs_type_str)

        # Build trajectory
        traj_points = []

        # Include initial state
        init = obs.initial_state
        ix, iz = transform_position(init.position[0], init.position[1], road_angle, cx, cy)
        init_orient = float(init.orientation) if hasattr(init, "orientation") and init.orientation is not None else 0.0
        init_vel = float(init.velocity) if hasattr(init, "velocity") and init.velocity is not None else 0.0
        i_rot = transform_orientation(init_orient, road_angle)
        traj_points.append({
            "time": round(init.time_step * dt, 2),
            "x": ix,
            "z": iz,
            "rotation": i_rot,
            "speed": round(init_vel, 2),
        })

        # Prediction trajectory
        if hasattr(obs, "prediction") and obs.prediction and obs.prediction.trajectory:
            for st in obs.prediction.trajectory.state_list:
                t = round(st.time_step * dt, 2)
                px, pz = transform_position(st.position[0], st.position[1], road_angle, cx, cy)
                orient = float(st.orientation) if hasattr(st, "orientation") and st.orientation is not None else init_orient
                vel = float(st.velocity) if hasattr(st, "velocity") and st.velocity is not None else init_vel
                rot = transform_orientation(orient, road_angle)
                traj_points.append({
                    "time": t,
                    "x": px,
                    "z": pz,
                    "rotation": rot,
                    "speed": round(vel, 2),
                })

        # Downsample
        traj_points = downsample_trajectory(traj_points, MAX_TRAJ_POINTS)

        # Remove speed if all zero
        if all(p.get("speed", 0) == 0 for p in traj_points):
            for p in traj_points:
                p.pop("speed", None)

        entities.append({
            "id": f"obs-{obs.obstacle_id}",
            "type": entity_type,
            "color": get_color(entity_type, color_idx),
            "dimensions": {
                "width": round(width, 1),
                "height": round(height, 1),
                "depth": round(depth, 1),
            },
            "trajectory": traj_points,
        })

    if not entities:
        print(f"  [skip] {filename}: no valid entities")
        return None

    # Duration
    max_time = 0
    for e in entities:
        if e["trajectory"]:
            max_time = max(max_time, e["trajectory"][-1]["time"])
    duration = max(max_time + 2, 10)  # Add buffer, minimum 10s

    # Player spawn
    player_x, player_z, player_rot, player_speed = ROAD_CENTER_X - 4, ROAD_CENTER_Z - 50, math.pi, 0.15

    if planning_problem_set and planning_problem_set.planning_problem_dict:
        pp = list(planning_problem_set.planning_problem_dict.values())[0]
        init = pp.initial_state
        px, pz = transform_position(init.position[0], init.position[1], road_angle, cx, cy)
        orient = float(init.orientation) if hasattr(init, "orientation") and init.orientation is not None else 0.0
        player_rot = transform_orientation(orient, road_angle)
        player_x = px
        player_z = pz
        vel = float(init.velocity) if hasattr(init, "velocity") and init.velocity is not None else 0.0
        # Scale CR velocity to game speed (cap at 0.3)
        player_speed = min(vel / 40.0, 0.3)
    else:
        # Place behind the first entity
        first_traj = entities[0]["trajectory"]
        if first_traj:
            player_x = first_traj[0]["x"]
            # Place 50 units behind (in -Z direction since facing +Z/north)
            player_z = first_traj[0]["z"] - 50

    # Success condition
    success_condition = {"type": "no_collision"}

    if planning_problem_set and planning_problem_set.planning_problem_dict:
        pp = list(planning_problem_set.planning_problem_dict.values())[0]
        if pp.goal and hasattr(pp.goal, "state_list") and pp.goal.state_list:
            goal_state = pp.goal.state_list[0]
            if hasattr(goal_state, "position") and goal_state.position is not None:
                # Try to extract goal position
                try:
                    if hasattr(goal_state.position, "center"):
                        gx, gz = transform_position(
                            goal_state.position.center[0],
                            goal_state.position.center[1],
                            road_angle, cx, cy,
                        )
                        success_condition = {
                            "type": "reach_position",
                            "target": {"x": gx, "z": gz, "radius": 15},
                        }
                except Exception:
                    pass

    return {
        "id": make_scenario_id(filename),
        "name": make_scenario_name(filename),
        "description": make_description(filename, len(entities), tags),
        "duration": round(duration, 1),
        "playerSpawn": {
            "x": round(player_x, 1),
            "z": round(player_z, 1),
            "rotation": round(player_rot, 3),
            "initialSpeed": round(player_speed, 2),
        },
        "entities": entities,
        "successCondition": success_condition,
    }


def generate_typescript(scenarios: list[dict]) -> str:
    """Generate TypeScript source code for all scenarios."""
    lines = [
        "// Auto-generated from CommonRoad scenarios — do not edit manually",
        "import type { Scenario } from './types';",
        "",
        "export const commonroadScenarios: Scenario[] = ",
    ]

    # Serialize with proper formatting
    json_str = json.dumps(scenarios, indent=2)

    # Fix JSON → TypeScript: remove quotes from keys where safe, convert to proper format
    # Actually, JSON is valid TS, so we just append it
    lines.append(json_str + ";")

    return "\n".join(lines) + "\n"


def main():
    xml_files = sorted(glob.glob(os.path.join(XML_DIR, "*.xml")))
    if not xml_files:
        print(f"No XML files found in {XML_DIR}/")
        print("Run cr_download.py first.")
        return

    print(f"Converting {len(xml_files)} scenarios...\n")

    scenarios = []
    for f in xml_files:
        filename = os.path.basename(f)
        result = convert_scenario(f)
        if result:
            scenarios.append(result)
            print(f"  [ok] {filename} -> {result['id']} ({len(result['entities'])} entities)")

    if not scenarios:
        print("\nNo scenarios converted successfully.")
        return

    # Generate TypeScript
    ts_code = generate_typescript(scenarios)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        f.write(ts_code)

    print(f"\nGenerated {OUTPUT_PATH}")
    print(f"  {len(scenarios)} scenarios, {sum(len(s['entities']) for s in scenarios)} total entities")


if __name__ == "__main__":
    main()
