"""
Analyze and rank downloaded CommonRoad scenarios.
Outputs a summary table and a manifest JSON.
"""

import os
import json
import glob
import numpy as np
from commonroad.common.file_reader import CommonRoadFileReader

XML_DIR = os.path.join(os.path.dirname(__file__), "commonroad_xml")
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "cr_manifest.json")


def analyze_scenario(filepath: str) -> dict:
    """Analyze a single CommonRoad XML file."""
    try:
        scenario, planning_problem_set = CommonRoadFileReader(filepath).open()
    except Exception as e:
        return {"file": os.path.basename(filepath), "error": str(e)}

    info = {
        "file": os.path.basename(filepath),
        "scenario_id": str(scenario.scenario_id),
        "dt": scenario.dt,
    }

    # Tags
    tags = []
    if hasattr(scenario, "tags") and scenario.tags:
        tags = [str(t) for t in scenario.tags]
    info["tags"] = tags

    # Lanelets
    lanelets = scenario.lanelet_network.lanelets
    info["lanelet_count"] = len(lanelets)

    # Estimate lane count from lanelet adjacency (with cycle detection)
    lane_counts = set()
    for ll in lanelets:
        count = 1
        visited = {ll.lanelet_id}
        cur = ll
        while cur.adj_left is not None and cur.adj_left not in visited:
            count += 1
            visited.add(cur.adj_left)
            adj = scenario.lanelet_network.find_lanelet_by_id(cur.adj_left)
            if adj is None:
                break
            cur = adj
        lane_counts.add(count)
    info["max_lanes"] = max(lane_counts) if lane_counts else 0

    # Dynamic obstacles
    obstacles = scenario.dynamic_obstacles
    info["obstacle_count"] = len(obstacles)
    info["obstacle_types"] = list(set(str(o.obstacle_type) for o in obstacles))

    # Duration
    max_time = 0
    for obs in obstacles:
        if hasattr(obs, "prediction") and obs.prediction:
            traj = obs.prediction.trajectory
            if traj and traj.state_list:
                t = traj.state_list[-1].time_step
                max_time = max(max_time, t)
    info["max_timestep"] = max_time
    info["duration_s"] = round(max_time * scenario.dt, 1)

    # Coordinate range
    all_x, all_y = [], []
    for obs in obstacles:
        if hasattr(obs, "prediction") and obs.prediction:
            for st in obs.prediction.trajectory.state_list:
                all_x.append(st.position[0])
                all_y.append(st.position[1])
    # Also include lanelet vertices
    for ll in lanelets:
        for v in ll.center_vertices:
            all_x.append(v[0])
            all_y.append(v[1])

    if all_x:
        info["x_range"] = [round(min(all_x), 1), round(max(all_x), 1)]
        info["y_range"] = [round(min(all_y), 1), round(max(all_y), 1)]
        info["x_span"] = round(max(all_x) - min(all_x), 1)
        info["y_span"] = round(max(all_y) - min(all_y), 1)
    else:
        info["x_range"] = info["y_range"] = [0, 0]
        info["x_span"] = info["y_span"] = 0

    # Road direction (primary angle of longest lanelet chain)
    if lanelets:
        longest = max(lanelets, key=lambda ll: np.sum(np.linalg.norm(np.diff(ll.center_vertices, axis=0), axis=1)))
        verts = longest.center_vertices
        dx = verts[-1][0] - verts[0][0]
        dy = verts[-1][1] - verts[0][1]
        info["primary_angle_deg"] = round(np.degrees(np.arctan2(dy, dx)), 1)
    else:
        info["primary_angle_deg"] = 0

    # Planning problem
    if planning_problem_set and planning_problem_set.planning_problem_dict:
        pp = list(planning_problem_set.planning_problem_dict.values())[0]
        info["has_planning_problem"] = True
        init = pp.initial_state
        info["initial_position"] = [round(init.position[0], 2), round(init.position[1], 2)]
        info["initial_velocity"] = round(init.velocity, 2) if hasattr(init, "velocity") and init.velocity is not None else None
    else:
        info["has_planning_problem"] = False

    # Compatibility score (higher = better fit for our 2-lane urban road)
    score = 50  # base
    if info["max_lanes"] <= 2:
        score += 30
    elif info["max_lanes"] <= 3:
        score += 15
    if info["obstacle_count"] <= 4:
        score += 10
    elif info["obstacle_count"] <= 7:
        score += 5
    if "urban" in " ".join(tags).lower():
        score += 10
    if "intersection" in " ".join(tags).lower() or "junction" in info["file"].lower():
        score += 5
    if info["x_span"] < 200 and info["y_span"] < 200:
        score += 10
    info["compatibility_score"] = score

    return info


def main():
    xml_files = sorted(glob.glob(os.path.join(XML_DIR, "*.xml")))
    if not xml_files:
        print(f"No XML files found in {XML_DIR}/")
        print("Run cr_download.py first.")
        return

    print(f"Analyzing {len(xml_files)} scenarios...\n")

    results = []
    for f in xml_files:
        info = analyze_scenario(f)
        results.append(info)

    # Sort by compatibility score
    results.sort(key=lambda x: x.get("compatibility_score", 0), reverse=True)

    # Print summary table
    header = f"{'File':<40} {'Obs':>3} {'Lanes':>5} {'Dur(s)':>6} {'Span':>12} {'Score':>5}"
    print(header)
    print("-" * len(header))
    for r in results:
        if "error" in r:
            print(f"{r['file']:<40} ERROR: {r['error']}")
            continue
        span = f"{r['x_span']:.0f}x{r['y_span']:.0f}"
        print(
            f"{r['file']:<40} {r['obstacle_count']:>3} {r['max_lanes']:>5} "
            f"{r['duration_s']:>6} {span:>12} {r['compatibility_score']:>5}"
        )

    # Write manifest
    with open(MANIFEST_PATH, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nManifest written to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
