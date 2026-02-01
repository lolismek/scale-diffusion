#!/usr/bin/env python3
"""
Compare CILRS models - generates separate figures.
"""

import json
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

OUTPUT_DIR = Path("comparison_figures")
OUTPUT_DIR.mkdir(exist_ok=True)

# Results paths
RESULTS = {
    "Synthetic Data": "eval_results_cilrs/cilrs_fixed/model_best/result_20260201_083130.json",
    "Autopilot Data": "eval_results_cilrs/cilrs_autopilot/model_best/result_20260201_091918.json",
}

TRAIN_DATA = {
    "Synthetic": "cilrs_dataset_v2",
    "Autopilot": "cilrs_dataset_autopilot",
}


def load_result(path):
    with open(path) as f:
        return json.load(f)


def extract_metrics(result):
    metrics = {
        "route_completion": 0.0,
        "driving_score": 0.0,
        "collisions_vehicle": 0,
        "collisions_layout": 0,
        "stop_infraction": 0,
        "vehicle_blocked": 0,
    }
    
    records = result.get("_checkpoint", {}).get("records", [])
    if records:
        rec = records[0]
        scores = rec.get("scores", {})
        infractions = rec.get("infractions", {})
        
        metrics["route_completion"] = scores.get("score_route", 0.0)
        metrics["driving_score"] = scores.get("score_composed", 0.0)
        metrics["collisions_vehicle"] = len(infractions.get("collisions_vehicle", []))
        metrics["collisions_layout"] = len(infractions.get("collisions_layout", []))
        metrics["stop_infraction"] = len(infractions.get("stop_infraction", []))
        metrics["vehicle_blocked"] = len(infractions.get("vehicle_blocked", []))
    
    return metrics


def load_training_stats(data_dir):
    data_path = Path(data_dir)
    if not data_path.exists():
        return None
    
    all_measurements = []
    for route in data_path.glob("route_*/measurements.json"):
        with open(route) as f:
            all_measurements.extend(json.load(f))
    
    if not all_measurements:
        return None
    
    return {
        "count": len(all_measurements),
        "steers": [m["steer"] for m in all_measurements],
        "throttles": [m["throttle"] for m in all_measurements],
        "speeds": [m["speed"] for m in all_measurements],
    }


def main():
    plt.style.use('seaborn-v0_8-whitegrid')
    
    # Load data
    results = {}
    for name, path in RESULTS.items():
        try:
            results[name] = extract_metrics(load_result(path))
        except:
            results[name] = extract_metrics({})
    
    train_stats = {}
    for name, path in TRAIN_DATA.items():
        stats = load_training_stats(path)
        if stats:
            train_stats[name] = stats
    
    models = list(results.keys())
    
    # ===== Figure 1: Route Completion =====
    fig1, ax1 = plt.subplots(figsize=(8, 6))
    route_comp = [results[m]["route_completion"] for m in models]
    colors = ['#3498db', '#e74c3c']
    bars = ax1.bar(models, route_comp, color=colors, edgecolor='black', linewidth=1.5)
    ax1.set_ylabel('Route Completion (%)', fontsize=12)
    ax1.set_title('Route Completion Comparison', fontsize=14, fontweight='bold')
    ax1.set_ylim(0, 100)
    for bar, val in zip(bars, route_comp):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 2, 
                f'{val:.1f}%', ha='center', va='bottom', fontsize=14, fontweight='bold')
    plt.tight_layout()
    fig1.savefig(OUTPUT_DIR / "1_route_completion.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/1_route_completion.png")
    plt.close()
    
    # ===== Figure 2: Driving Score =====
    fig2, ax2 = plt.subplots(figsize=(8, 6))
    drive_score = [results[m]["driving_score"] for m in models]
    bars = ax2.bar(models, drive_score, color=colors, edgecolor='black', linewidth=1.5)
    ax2.set_ylabel('Driving Score', fontsize=12)
    ax2.set_title('Driving Score Comparison', fontsize=14, fontweight='bold')
    ax2.set_ylim(0, max(drive_score) * 1.3 + 1)
    for bar, val in zip(bars, drive_score):
        ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, 
                f'{val:.2f}', ha='center', va='bottom', fontsize=14, fontweight='bold')
    plt.tight_layout()
    fig2.savefig(OUTPUT_DIR / "2_driving_score.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/2_driving_score.png")
    plt.close()
    
    # ===== Figure 3: Infractions =====
    fig3, ax3 = plt.subplots(figsize=(10, 6))
    infraction_types = ['collisions_vehicle', 'collisions_layout', 'stop_infraction', 'vehicle_blocked']
    labels = ['Vehicle\nCollisions', 'Layout\nCollisions', 'Stop Sign\nViolations', 'Got\nBlocked']
    
    x = np.arange(len(infraction_types))
    width = 0.35
    
    for i, model in enumerate(models):
        vals = [results[model][inf] for inf in infraction_types]
        ax3.bar(x + i*width - width/2, vals, width, label=model, color=colors[i], edgecolor='black')
    
    ax3.set_ylabel('Count', fontsize=12)
    ax3.set_title('Infractions Comparison', fontsize=14, fontweight='bold')
    ax3.set_xticks(x)
    ax3.set_xticklabels(labels, fontsize=11)
    ax3.legend(fontsize=11)
    plt.tight_layout()
    fig3.savefig(OUTPUT_DIR / "3_infractions.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/3_infractions.png")
    plt.close()
    
    # ===== Figure 4: Steering Distribution =====
    fig4, ax4 = plt.subplots(figsize=(10, 6))
    for name, stats in train_stats.items():
        nonzero_pct = 100 * np.mean([abs(s) > 0.01 for s in stats["steers"]])
        ax4.hist(stats["steers"], bins=50, alpha=0.6, label=f'{name} ({nonzero_pct:.1f}% non-zero)', density=True)
    ax4.set_xlabel('Steering Value', fontsize=12)
    ax4.set_ylabel('Density', fontsize=12)
    ax4.set_title('Training Data: Steering Distribution', fontsize=14, fontweight='bold')
    ax4.legend(fontsize=11)
    ax4.set_xlim(-1, 1)
    plt.tight_layout()
    fig4.savefig(OUTPUT_DIR / "4_steering_distribution.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/4_steering_distribution.png")
    plt.close()
    
    # ===== Figure 5: Throttle Distribution =====
    fig5, ax5 = plt.subplots(figsize=(10, 6))
    for name, stats in train_stats.items():
        ax5.hist(stats["throttles"], bins=50, alpha=0.6, label=name, density=True)
    ax5.set_xlabel('Throttle Value', fontsize=12)
    ax5.set_ylabel('Density', fontsize=12)
    ax5.set_title('Training Data: Throttle Distribution', fontsize=14, fontweight='bold')
    ax5.legend(fontsize=11)
    ax5.set_xlim(0, 1)
    plt.tight_layout()
    fig5.savefig(OUTPUT_DIR / "5_throttle_distribution.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/5_throttle_distribution.png")
    plt.close()
    
    # ===== Figure 6: Speed Distribution =====
    fig6, ax6 = plt.subplots(figsize=(10, 6))
    for name, stats in train_stats.items():
        ax6.hist(stats["speeds"], bins=50, alpha=0.6, label=name, density=True)
    ax6.set_xlabel('Speed (m/s)', fontsize=12)
    ax6.set_ylabel('Density', fontsize=12)
    ax6.set_title('Training Data: Speed Distribution', fontsize=14, fontweight='bold')
    ax6.legend(fontsize=11)
    plt.tight_layout()
    fig6.savefig(OUTPUT_DIR / "6_speed_distribution.png", dpi=150)
    print(f"Saved: {OUTPUT_DIR}/6_speed_distribution.png")
    plt.close()
    
    print(f"\nAll figures saved to: {OUTPUT_DIR}/")


if __name__ == '__main__':
    main()
