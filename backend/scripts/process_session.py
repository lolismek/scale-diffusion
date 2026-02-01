#!/usr/bin/env python3
"""
CILRS Training Data Pipeline

Transforms Scale Diffusion session data into CILRS-compatible format.

Usage:
    cd backend
    uv run scripts/process_session.py <wallet_address> <session_id> [--output ./dataset]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3

# S3 bucket configuration
BUCKET_NAME = "scale-diffusion-dev-rawuploadsbucket-bmkszosn"
REGION = "us-west-1"


def download_session_files(s3_client, wallet_address: str, session_id: str, temp_dir: Path) -> dict:
    """Download session files from S3."""
    files = {}
    prefix = f"{wallet_address}/"

    # List objects to find files matching the session_id
    response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)

    if "Contents" not in response:
        raise FileNotFoundError(f"No files found for wallet {wallet_address}")

    for obj in response["Contents"]:
        key = obj["Key"]
        if session_id in key:
            filename = os.path.basename(key)
            local_path = temp_dir / filename

            print(f"Downloading: {key}")
            s3_client.download_file(BUCKET_NAME, key, str(local_path))

            if filename.endswith(".webm"):
                files["video"] = local_path
            elif filename.endswith("_camera.json"):
                files["camera"] = local_path
            elif filename.endswith("_meta.json"):
                files["meta"] = local_path

    if "video" not in files:
        raise FileNotFoundError(f"Video file not found for session {session_id}")
    if "camera" not in files:
        raise FileNotFoundError(f"Camera file not found for session {session_id}")

    return files


def extract_frames(video_path: Path, output_dir: Path) -> int:
    """Extract frames from video using ffmpeg."""
    output_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = output_dir / "%04d.jpg"

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", "scale=256:256",
        "-q:v", "2",
        "-y",
        str(output_pattern),
    ]

    print(f"Extracting frames: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ffmpeg stderr: {result.stderr}")
        raise RuntimeError(f"ffmpeg failed with code {result.returncode}")

    # Count extracted frames
    frame_count = len(list(output_dir.glob("*.jpg")))
    print(f"Extracted {frame_count} frames")
    return frame_count


def parse_camera_data(camera_path: Path) -> list[dict]:
    """Parse camera JSON and return list of camera events."""
    with open(camera_path) as f:
        data = json.load(f)

    # Filter to only camera events
    camera_events = [e for e in data if e.get("type") == "camera"]
    return camera_events


def align_camera_to_frames(camera_events: list[dict], frame_count: int) -> list[dict]:
    """
    Align camera events to video frames.

    Video is 30fps, so frame N corresponds to timestamp N * 33.33ms.
    Camera events have timestamps in ms.
    """
    if not camera_events:
        return []

    # Get the start timestamp (first camera event)
    start_time = camera_events[0]["t"]

    measurements = []

    for frame_idx in range(frame_count):
        # Target timestamp for this frame (relative to start)
        target_time = start_time + (frame_idx * 33.33)

        # Find the closest camera event
        closest_event = min(camera_events, key=lambda e: abs(e["t"] - target_time))

        # Build measurement entry
        # Coordinate mapping:
        # THREE.js pos[0] (x) -> CILRS x (forward)
        # THREE.js pos[2] (z) -> CILRS y (right, negate for left-handed)
        pos = closest_event.get("pos", [0, 0, 0])

        measurement = {
            "frame": frame_idx,
            "x": round(pos[0], 2),
            "y": round(-pos[2], 2),  # Negate z for left-handed coord system
            "theta": round(closest_event.get("yaw", 0), 4),
            "speed": round(closest_event.get("speed", 0), 2),
            "command": closest_event.get("command", 4),
            "steer": round(closest_event.get("steer", 0), 4),
            "throttle": float(closest_event.get("throttle", 0)),
            "brake": float(closest_event.get("brake", 0)),
        }

        measurements.append(measurement)

    return measurements


def write_cilrs_dataset(measurements: list[dict], frames_dir: Path, output_dir: Path, session_id: str):
    """Write CILRS-formatted dataset."""
    route_dir = output_dir / f"route_{session_id}"
    route_dir.mkdir(parents=True, exist_ok=True)

    # Copy frames to rgb_front/
    rgb_dir = route_dir / "rgb_front"
    rgb_dir.mkdir(exist_ok=True)

    for frame_path in sorted(frames_dir.glob("*.jpg")):
        # ffmpeg outputs 0001.jpg, 0002.jpg, etc. - convert to 0000.jpg, 0001.jpg
        frame_num = int(frame_path.stem) - 1  # ffmpeg starts at 1
        new_name = f"{frame_num:04d}.jpg"
        dest_path = rgb_dir / new_name

        # Copy file
        dest_path.write_bytes(frame_path.read_bytes())

    # Write measurements.json
    measurements_path = route_dir / "measurements.json"
    with open(measurements_path, "w") as f:
        json.dump(measurements, f, indent=2)

    print(f"Dataset written to: {route_dir}")
    print(f"  - {len(list(rgb_dir.glob('*.jpg')))} frames in rgb_front/")
    print(f"  - {len(measurements)} measurements")


def main():
    parser = argparse.ArgumentParser(
        description="Transform Scale Diffusion session data into CILRS format"
    )
    parser.add_argument("wallet_address", help="Wallet address of the session owner")
    parser.add_argument("session_id", help="Session ID to process")
    parser.add_argument(
        "--output",
        "-o",
        default="./dataset",
        help="Output directory (default: ./dataset)",
    )
    parser.add_argument(
        "--bucket",
        default=BUCKET_NAME,
        help=f"S3 bucket name (default: {BUCKET_NAME})",
    )

    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize S3 client
    s3_client = boto3.client("s3", region_name=REGION)

    print(f"Processing session: {args.session_id}")
    print(f"Wallet: {args.wallet_address}")
    print(f"Output: {output_dir}")
    print("-" * 40)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Step 1: Download session files
        print("\n[1/4] Downloading session files from S3...")
        files = download_session_files(s3_client, args.wallet_address, args.session_id, temp_path)

        # Step 2: Extract frames
        print("\n[2/4] Extracting frames from video...")
        frames_dir = temp_path / "frames"
        frame_count = extract_frames(files["video"], frames_dir)

        # Step 3: Parse and align camera data
        print("\n[3/4] Aligning camera data to frames...")
        camera_events = parse_camera_data(files["camera"])
        print(f"Found {len(camera_events)} camera events")
        measurements = align_camera_to_frames(camera_events, frame_count)

        # Step 4: Write CILRS dataset
        print("\n[4/4] Writing CILRS dataset...")
        write_cilrs_dataset(measurements, frames_dir, output_dir, args.session_id)

    print("\nDone!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
