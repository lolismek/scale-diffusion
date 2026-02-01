#!/usr/bin/env python3
"""
CILRS Training Data Extraction Script

Extracts frames from session webm videos and formats them for CILRS training
using the autonomousvision/carla_garage framework.

Output format matches carla_garage DataAgent specification:
    route_<session_id>/
    ├── rgb_front/
    │   ├── 0000.jpg
    │   ├── 0001.jpg
    │   └── ...
    └── measurements.json

Usage:
    cd carla_garage
    uv run extract_diffusion_frames.py [--input diffusion_finetune_data] [--output cilrs_dataset]
"""

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path


# Default configuration
DEFAULT_SKIP_SECONDS = 5  # Skip first 5 seconds of simulation
DEFAULT_VIDEO_FPS = 5  # Video captures every 5 frames from 30fps source = ~5fps
# CILRS standard image size
DEFAULT_OUTPUT_WIDTH = 256
DEFAULT_OUTPUT_HEIGHT = 256


def find_sessions(input_dir: Path) -> dict[str, dict[str, Path]]:
    """
    Find all unique sessions and their associated files.
    
    Returns dict of session_id -> {video, camera, meta, inputs, latency}
    """
    sessions = defaultdict(dict)
    
    for file_path in input_dir.iterdir():
        if not file_path.is_file():
            continue
            
        name = file_path.name
        
        # Extract session ID from filename
        # Format: {timestamp}_session_{session_id}.webm or {timestamp}_session_{session_id}_{type}.json
        if "_session_" not in name:
            continue
            
        # Parse the session ID
        parts = name.split("_session_")
        if len(parts) != 2:
            continue
            
        remainder = parts[1]
        
        if remainder.endswith(".webm"):
            session_id = remainder[:-5]  # Remove .webm
            sessions[session_id]["video"] = file_path
        elif remainder.endswith("_camera.json"):
            session_id = remainder[:-12]  # Remove _camera.json
            sessions[session_id]["camera"] = file_path
        elif remainder.endswith("_meta.json"):
            session_id = remainder[:-10]  # Remove _meta.json
            sessions[session_id]["meta"] = file_path
        elif remainder.endswith("_inputs.json"):
            session_id = remainder[:-12]  # Remove _inputs.json
            sessions[session_id]["inputs"] = file_path
        elif remainder.endswith("_latency.json"):
            session_id = remainder[:-13]  # Remove _latency.json
            sessions[session_id]["latency"] = file_path
    
    return dict(sessions)


def get_video_frame_count(video_path: Path) -> int:
    """Get video frame count using ffprobe (for webm files without duration metadata)."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-count_frames",
        "-select_streams", "v:0",
        "-show_entries", "stream=nb_read_frames",
        "-of", "csv=p=0",
        str(video_path)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    
    try:
        return int(result.stdout.strip())
    except ValueError:
        raise RuntimeError(f"Could not parse frame count: {result.stdout}")


def extract_frames(
    video_path: Path,
    output_dir: Path,
    session_id: str,
    skip_frames: int = 0,
    width: int = DEFAULT_OUTPUT_WIDTH,
    height: int = DEFAULT_OUTPUT_HEIGHT,
) -> int:
    """
    Extract JPEG frames from video to rgb_front/ subfolder.
    
    Output format: route_<session_id>/rgb_front/0000.jpg, 0001.jpg, ...
    
    Returns the number of frames extracted.
    """
    # Create CILRS directory structure: route_<session_id>/rgb_front/
    route_dir = output_dir / f"route_{session_id}"
    rgb_dir = route_dir / "rgb_front"
    rgb_dir.mkdir(parents=True, exist_ok=True)
    
    # Output pattern: 0000.jpg, 0001.jpg, etc.
    output_pattern = rgb_dir / "%04d.jpg"
    
    # Build ffmpeg command
    # Use select filter to skip first N frames
    # select='gte(n,SKIP)' keeps frames where frame number >= SKIP
    # setpts resets timestamps after filtering
    if skip_frames > 0:
        vf = f"select='gte(n\\,{skip_frames})',setpts=N/FRAME_RATE/TB,scale={width}:{height}"
    else:
        vf = f"scale={width}:{height}"
    
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", vf,
        "-vsync", "vfr",  # Variable frame rate (needed with select filter)
        "-q:v", "2",  # High quality JPEG
        "-start_number", "0",  # Start frame numbering at 0
        "-y",  # Overwrite output files
        str(output_pattern),
    ]
    
    print(f"  Extracting frames to rgb_front/ (skipping first {skip_frames})...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"  ffmpeg stderr: {result.stderr}")
        raise RuntimeError(f"ffmpeg failed with code {result.returncode}")
    
    # Count extracted frames
    frame_count = len(list(rgb_dir.glob("*.jpg")))
    return frame_count


def load_meta(meta_path: Path) -> dict:
    """Load session metadata."""
    with open(meta_path) as f:
        return json.load(f)


def load_camera_data(camera_path: Path, skip_ms: float) -> list[dict]:
    """
    Load camera data, filtering out events before skip_ms.
    
    Returns list of camera events with adjusted timestamps.
    """
    with open(camera_path) as f:
        data = json.load(f)
    
    # Filter to camera events only
    camera_events = [e for e in data if e.get("type") == "camera"]
    
    if not camera_events:
        return []
    
    # Get the first event timestamp as baseline
    first_t = camera_events[0]["t"]
    skip_threshold = first_t + skip_ms
    
    # Filter events after skip threshold and adjust timestamps
    filtered_events = []
    for event in camera_events:
        if event["t"] >= skip_threshold:
            adjusted_event = event.copy()
            adjusted_event["t"] = event["t"] - skip_threshold  # Rebase to 0
            filtered_events.append(adjusted_event)
    
    return filtered_events


def compute_controls_from_physics(
    measurements: list[dict],
    dt: float = 0.2,  # Time between frames in seconds
    friction: float = 0.1,  # Speed lost per second due to friction
    max_accel: float = 5.0,  # Max acceleration in m/s^2
    max_steer_rate: float = 0.5,  # Max yaw change per second in radians
    target_speed: float = 8.0,  # Target cruising speed in m/s
) -> list[dict]:
    """
    Compute throttle, brake, and steer from observed speed/yaw changes.
    
    The recorded throttle/brake/steer from keyboard state is often 0 even when
    the car is moving (due to scenarios with initial momentum, or coasting).
    This function infers the "expert" controls from the physics.
    
    Key insight: throttle should be proportional to (target_speed - current_speed)
    to teach the model to accelerate when slow and maintain when at target.
    """
    import math
    
    if len(measurements) < 2:
        return measurements
    
    result = []
    for i, m in enumerate(measurements):
        m = m.copy()
        current_speed = m["speed"]
        
        # Compute target throttle based on speed deficit
        # When speed is low, we need HIGH throttle to accelerate
        # When speed is at target, we need LOW throttle to maintain
        speed_deficit = target_speed - current_speed
        
        if i == 0:
            # First frame: compute throttle from speed deficit
            if speed_deficit > 0:
                # Below target speed - need throttle proportional to deficit
                m["throttle"] = min(1.0, max(0.3, speed_deficit / target_speed))
            else:
                m["throttle"] = 0.1  # Slight throttle to maintain
            m["brake"] = 0.0
            result.append(m)
            continue
        
        prev = measurements[i - 1]
        
        # Compute speed change
        speed_change = m["speed"] - prev["speed"]
        
        # Compute yaw change (steering)
        yaw_change = m["theta"] - prev["theta"]
        # Normalize to [-pi, pi]
        while yaw_change > math.pi:
            yaw_change -= 2 * math.pi
        while yaw_change < -math.pi:
            yaw_change += 2 * math.pi
        
        # Determine if we're braking (significant deceleration)
        is_braking = speed_change < -1.0
        
        if is_braking:
            # Car decelerated significantly -> brake
            m["brake"] = min(1.0, abs(speed_change) / (max_accel * dt))
            m["throttle"] = 0.0
        elif speed_deficit > 0:
            # Below target speed - throttle based on deficit
            # More deficit = more throttle
            # At speed=0, deficit=8, throttle should be high (0.8-1.0)
            # At speed=6, deficit=2, throttle should be lower (0.3-0.4)
            base_throttle = speed_deficit / target_speed  # 0-1 range
            
            # Boost for very low speeds (need more throttle to overcome inertia)
            if current_speed < 2.0:
                m["throttle"] = min(1.0, max(0.6, base_throttle + 0.3))
            else:
                m["throttle"] = min(1.0, max(0.2, base_throttle))
            m["brake"] = 0.0
        else:
            # At or above target speed - minimal throttle
            m["throttle"] = 0.1
            m["brake"] = 0.0
        
        # Infer steering from yaw change
        steer_value = yaw_change / (max_steer_rate * dt)
        m["steer"] = max(-1.0, min(1.0, steer_value))
        
        result.append(m)
    
    return result


def align_camera_to_frames(
    camera_events: list[dict],
    frame_count: int,
    fps: float = DEFAULT_VIDEO_FPS,
) -> list[dict]:
    """
    Align camera events to extracted frames.
    
    Returns list of measurements in CILRS format:
    - x, y: Global position (THREE.js pos[0] -> x, -pos[2] -> y for left-handed)
    - theta: Yaw orientation (radians)
    - speed: Vehicle speed (m/s)
    - command: Navigation command (1=Left, 2=Right, 3=Straight, 4=Follow Lane)
    - steer, throttle, brake: Expert actions (computed from physics)
    """
    if not camera_events or frame_count == 0:
        return []
    
    frame_duration_ms = 1000.0 / fps
    measurements = []
    
    for frame_idx in range(frame_count):
        target_time = frame_idx * frame_duration_ms
        
        # Find closest camera event
        closest_event = min(camera_events, key=lambda e: abs(e["t"] - target_time))
        
        pos = closest_event.get("pos", [0, 0, 0])
        
        # Coordinate mapping:
        # THREE.js pos[0] (x) -> CILRS x (forward)
        # THREE.js pos[2] (z) -> CILRS y (negate for left-handed coord system)
        measurement = {
            "frame": frame_idx,
            "x": round(pos[0], 4),
            "y": round(-pos[2], 4),  # Negate z for CARLA coordinate system
            "theta": round(closest_event.get("yaw", 0), 6),
            "speed": round(closest_event.get("speed", 0), 4),
            "command": closest_event.get("command", 4),  # 1-4: Left, Right, Straight, Follow
            # Store raw keyboard values temporarily - will be overwritten
            "steer": round(closest_event.get("steer", 0), 6),
            "throttle": round(float(closest_event.get("throttle", 0)), 4),
            "brake": round(float(closest_event.get("brake", 0)), 4),
        }
        
        measurements.append(measurement)
    
    # Compute controls from observed physics instead of keyboard state
    dt = 1.0 / fps
    measurements = compute_controls_from_physics(measurements, dt=dt)
    
    # Round the computed values
    for m in measurements:
        m["steer"] = round(m["steer"], 6)
        m["throttle"] = round(m["throttle"], 4)
        m["brake"] = round(m["brake"], 4)
    
    return measurements


def balance_data(
    measurements: list[dict],
    rgb_dir: Path,
    max_zero_throttle_ratio: float = 0.5,
    keep_every_n_stationary: int = 3,
) -> tuple[list[dict], list[int]]:
    """
    Balance the dataset by reducing frames where throttle=0 and car is stationary.
    
    Returns:
        - Balanced measurements list
        - List of frame indices to keep
    """
    if not measurements:
        return measurements, []
    
    # Separate frames into "driving" (throttle > 0 or steering) and "stationary"
    driving_indices = []
    stationary_indices = []
    
    for i, m in enumerate(measurements):
        throttle = m.get("throttle", 0)
        steer = abs(m.get("steer", 0))
        speed = m.get("speed", 0)
        brake = m.get("brake", 0)
        
        # Frame is "active" if:
        # - Has throttle > 0.1
        # - OR significant steering (|steer| > 0.1)
        # - OR braking
        # - OR car is moving (speed > 1 m/s)
        is_active = throttle > 0.1 or steer > 0.1 or brake > 0.1 or speed > 1.0
        
        if is_active:
            driving_indices.append(i)
        else:
            stationary_indices.append(i)
    
    print(f"    Active frames: {len(driving_indices)}, Stationary frames: {len(stationary_indices)}")
    
    # Calculate how many stationary frames to keep
    # Target: stationary frames should be at most max_zero_throttle_ratio of total
    if len(driving_indices) == 0:
        # No driving frames - keep some stationary frames
        keep_stationary = stationary_indices[::keep_every_n_stationary]
    else:
        # Calculate target number of stationary frames
        target_stationary = int(len(driving_indices) * max_zero_throttle_ratio / (1 - max_zero_throttle_ratio))
        
        if len(stationary_indices) <= target_stationary:
            # Keep all stationary frames
            keep_stationary = stationary_indices
        else:
            # Subsample stationary frames evenly
            step = max(1, len(stationary_indices) // target_stationary)
            keep_stationary = stationary_indices[::step][:target_stationary]
    
    # Combine and sort
    keep_indices = sorted(driving_indices + keep_stationary)
    
    print(f"    Keeping {len(keep_indices)} frames ({len(driving_indices)} active + {len(keep_stationary)} stationary)")
    
    # Create balanced measurements with renumbered frames
    balanced_measurements = []
    for new_idx, old_idx in enumerate(keep_indices):
        m = measurements[old_idx].copy()
        m["frame"] = new_idx
        m["original_frame"] = old_idx
        balanced_measurements.append(m)
    
    return balanced_measurements, keep_indices


def reorganize_frames(rgb_dir: Path, keep_indices: list[int]) -> int:
    """
    Reorganize frames to only keep balanced subset.
    Renumbers frames to be sequential (0000.jpg, 0001.jpg, ...).
    
    Returns number of frames kept.
    """
    import shutil
    import tempfile
    
    # Create temp directory for reorganization
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        
        # Move kept frames to temp with new numbering
        for new_idx, old_idx in enumerate(keep_indices):
            old_file = rgb_dir / f"{old_idx:04d}.jpg"
            if old_file.exists():
                tmp_file = tmp_path / f"{new_idx:04d}.jpg"
                shutil.copy2(old_file, tmp_file)
        
        # Clear original directory
        for f in rgb_dir.glob("*.jpg"):
            f.unlink()
        
        # Move back from temp
        for f in tmp_path.glob("*.jpg"):
            shutil.copy2(f, rgb_dir / f.name)
    
    return len(keep_indices)


def write_session_data(
    output_dir: Path,
    session_id: str,
    meta: dict,
    frame_count: int,
    measurements: list[dict],
    skip_seconds: float,
    output_width: int,
    output_height: int,
    balance: bool = True,
) -> int:
    """
    Write CILRS-formatted dataset files.
    
    Creates:
    - route_<session_id>/measurements.json (CILRS format)
    - route_<session_id>/metadata.json (session info for reference)
    
    Returns:
        Final frame count after balancing
    """
    route_dir = output_dir / f"route_{session_id}"
    rgb_dir = route_dir / "rgb_front"
    route_dir.mkdir(parents=True, exist_ok=True)
    
    final_frame_count = frame_count
    final_measurements = measurements
    
    # Balance data if requested
    if balance and measurements:
        print(f"  Balancing data...")
        balanced_measurements, keep_indices = balance_data(measurements, rgb_dir)
        
        if keep_indices and len(keep_indices) < frame_count:
            # Reorganize frames to match balanced measurements
            final_frame_count = reorganize_frames(rgb_dir, keep_indices)
            final_measurements = balanced_measurements
            print(f"  Balanced: {frame_count} -> {final_frame_count} frames")
    
    # Write measurements.json in CILRS format
    # This is the main file used by carla_garage DataAgent
    measurements_path = route_dir / "measurements.json"
    with open(measurements_path, "w") as f:
        json.dump(final_measurements, f, indent=2)
    
    # Write metadata.json for reference (not used by CILRS but helpful)
    metadata = {
        "session_id": session_id,
        "prompt": meta.get("prompt", ""),
        "original_duration_ms": meta.get("duration", 0),
        "scenario": meta.get("scenario", {}),
        "frame_count": final_frame_count,
        "original_frame_count": frame_count,
        "skipped_seconds": skip_seconds,
        "image_size": [output_width, output_height],
        "balanced": balance,
    }
    
    metadata_path = route_dir / "metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    
    return final_frame_count


def write_global_manifest(
    output_dir: Path,
    session_summaries: list[dict],
    skip_seconds: float,
    output_width: int,
    output_height: int,
):
    """Write a global manifest listing all extracted sessions."""
    manifest = {
        "total_sessions": len(session_summaries),
        "total_frames": sum(s["frame_count"] for s in session_summaries),
        "skipped_seconds": skip_seconds,
        "output_size": [output_width, output_height],
        "sessions": session_summaries,
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)


def process_session(
    session_id: str,
    files: dict[str, Path],
    output_dir: Path,
    skip_seconds: float,
    output_width: int,
    output_height: int,
    balance: bool = True,
) -> dict | None:
    """
    Process a single session: extract frames and create metadata.
    
    Returns session summary dict or None if failed.
    """
    print(f"\nProcessing session: {session_id}")
    
    # Check required files
    if "video" not in files:
        print(f"  Skipping: No video file found")
        return None
    
    video_path = files["video"]
    
    # Load metadata first to get duration
    meta = {}
    if "meta" in files:
        try:
            meta = load_meta(files["meta"])
        except Exception as e:
            print(f"  Warning: Could not load meta: {e}")
    
    # Get duration from meta (in ms) or fallback
    duration_ms = meta.get("duration", 0)
    duration_s = duration_ms / 1000.0 if duration_ms > 0 else 0
    
    # Get frame count from video
    try:
        total_frames = get_video_frame_count(video_path)
        print(f"  Video: {total_frames} frames, {duration_s:.1f}s from meta")
    except Exception as e:
        print(f"  Error getting frame count: {e}")
        return None
    
    if total_frames == 0:
        print(f"  Skipping: No frames in video")
        return None
    
    # Calculate fps from duration and frame count
    if duration_s > 0:
        fps = total_frames / duration_s
    else:
        fps = DEFAULT_VIDEO_FPS
    print(f"  Calculated fps: {fps:.1f}")
    
    # Calculate frames to skip
    skip_frames = int(skip_seconds * fps)
    
    # Check if video has enough frames
    if total_frames <= skip_frames:
        print(f"  Skipping: Not enough frames ({total_frames} <= {skip_frames} skip)")
        return None
    
    # Extract frames
    try:
        frame_count = extract_frames(
            video_path=video_path,
            output_dir=output_dir,
            session_id=session_id,
            skip_frames=skip_frames,
            width=output_width,
            height=output_height,
        )
        print(f"  Extracted {frame_count} frames (skipped {skip_frames})")
    except Exception as e:
        print(f"  Error extracting frames: {e}")
        return None
    
    if frame_count == 0:
        print(f"  Skipping: No frames extracted")
        return None
    
    # Load and align camera data to create CILRS measurements
    measurements = []
    if "camera" in files:
        try:
            skip_ms = skip_seconds * 1000
            camera_events = load_camera_data(files["camera"], skip_ms)
            measurements = align_camera_to_frames(camera_events, frame_count, fps)
            print(f"  Created {len(measurements)} CILRS measurements")
        except Exception as e:
            print(f"  Warning: Could not process camera data: {e}")
    
    # Write CILRS dataset files (with optional balancing)
    final_frame_count = write_session_data(
        output_dir, session_id, meta, frame_count, measurements,
        skip_seconds, output_width, output_height, balance=balance
    )
    
    return {
        "session_id": session_id,
        "prompt": meta.get("prompt", ""),
        "frame_count": final_frame_count,
        "original_frame_count": frame_count,
        "original_duration": duration_ms,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Extract CILRS training data from session videos"
    )
    parser.add_argument(
        "--input", "-i",
        default="diffusion_finetune_data",
        help="Input directory with session data (default: diffusion_finetune_data)"
    )
    parser.add_argument(
        "--output", "-o",
        default="cilrs_dataset",
        help="Output directory for CILRS dataset (default: cilrs_dataset)"
    )
    parser.add_argument(
        "--skip-seconds",
        type=float,
        default=DEFAULT_SKIP_SECONDS,
        help=f"Seconds to skip at start of each video (default: {DEFAULT_SKIP_SECONDS})"
    )
    parser.add_argument(
        "--width",
        type=int,
        default=DEFAULT_OUTPUT_WIDTH,
        help=f"Output frame width (default: {DEFAULT_OUTPUT_WIDTH})"
    )
    parser.add_argument(
        "--height",
        type=int,
        default=DEFAULT_OUTPUT_HEIGHT,
        help=f"Output frame height (default: {DEFAULT_OUTPUT_HEIGHT})"
    )
    parser.add_argument(
        "--session",
        help="Process only a specific session ID"
    )
    parser.add_argument(
        "--no-balance",
        action="store_true",
        help="Disable data balancing (keep all frames)"
    )
    parser.add_argument(
        "--balance-ratio",
        type=float,
        default=0.5,
        help="Max ratio of stationary frames after balancing (default: 0.5)"
    )
    
    args = parser.parse_args()
    
    # Config from args
    skip_seconds = args.skip_seconds
    output_width = args.width
    output_height = args.height
    balance = not args.no_balance
    
    # Resolve paths
    script_dir = Path(__file__).parent
    input_dir = Path(args.input)
    if not input_dir.is_absolute():
        input_dir = script_dir / input_dir
    
    output_dir = Path(args.output)
    if not output_dir.is_absolute():
        output_dir = script_dir / output_dir
    
    if not input_dir.exists():
        print(f"Error: Input directory not found: {input_dir}")
        return 1
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("CILRS Training Data Extraction")
    print("=" * 60)
    print(f"Input:   {input_dir}")
    print(f"Output:  {output_dir}")
    print(f"Skip:    {skip_seconds}s (~{int(skip_seconds * DEFAULT_VIDEO_FPS)} frames @ ~{DEFAULT_VIDEO_FPS}fps)")
    print(f"Size:    {output_width}x{output_height}")
    print(f"Balance: {'Yes (reduce stationary frames)' if balance else 'No'}")
    print(f"Format:  route_<session>/rgb_front/*.jpg + measurements.json")
    print("=" * 60)
    
    # Find all sessions
    sessions = find_sessions(input_dir)
    print(f"\nFound {len(sessions)} sessions")
    
    if args.session:
        if args.session not in sessions:
            print(f"Error: Session '{args.session}' not found")
            return 1
        sessions = {args.session: sessions[args.session]}
    
    # Process each session
    session_summaries = []
    for session_id, files in sorted(sessions.items()):
        summary = process_session(
            session_id, files, output_dir,
            skip_seconds, output_width, output_height,
            balance=balance
        )
        if summary:
            session_summaries.append(summary)
    
    # Write global manifest
    write_global_manifest(output_dir, session_summaries, skip_seconds, output_width, output_height)
    
    # Summary
    print("\n" + "=" * 60)
    print("Extraction Complete")
    print("=" * 60)
    print(f"Sessions processed: {len(session_summaries)} / {len(sessions)}")
    print(f"Total frames: {sum(s['frame_count'] for s in session_summaries)}")
    print(f"Output: {output_dir}")
    
    # List unique prompts
    prompts = set(s["prompt"] for s in session_summaries if s["prompt"])
    if prompts:
        print(f"\nPrompts ({len(prompts)}):")
        for prompt in prompts:
            print(f"  - {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
