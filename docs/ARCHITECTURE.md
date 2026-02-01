# Scale Diffusion - Data Pipeline Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Browser)                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐                 │
│   │   Three.js   │ ──▶  │    Decart    │ ──▶  │   AI Video   │                 │
│   │   3D Scene   │      │   WebRTC     │      │   Output     │                 │
│   └──────────────┘      └──────────────┘      └──────────────┘                 │
│          │                                           │                          │
│          ▼                                           ▼                          │
│   ┌──────────────┐                          ┌──────────────┐                   │
│   │    Inputs    │                          │ MediaRecorder│                   │
│   │  WASD/Mouse  │                          │   .webm      │                   │
│   └──────────────┘                          └──────────────┘                   │
│          │                                           │                          │
│          ▼                                           ▼                          │
│   ┌─────────────────────────────────────────────────────────────────┐          │
│   │                     Session Bundle                               │          │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │          │
│   │  │ .webm   │ │ inputs  │ │ camera  │ │ latency │ │  meta   │   │          │
│   │  │ video   │ │ .json   │ │ .json   │ │ .json   │ │ .json   │   │          │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │          │
│   └─────────────────────────────────────────────────────────────────┘          │
│                                    │                                            │
└────────────────────────────────────│────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS BACKEND                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                    Lambda: UploadApi                             │           │
│   │                    (Presigned URL Generator)                     │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                 S3: Raw Uploads Bucket                           │           │
│   │                                                                  │           │
│   │   {wallet}/                                                      │           │
│   │     ├── {session_id}.webm           (2-15MB, AI video)          │           │
│   │     ├── {session_id}_inputs.json    (2-10KB, WASD+mouse)        │           │
│   │     ├── {session_id}_camera.json    (10-25KB, 3D positions)     │           │
│   │     ├── {session_id}_latency.json   (0.5KB, RTT samples)        │           │
│   │     └── {session_id}_meta.json      (0.5KB, prompt+timing)      │           │
│   │                                                                  │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                    │                                             │
│                                    ▼  S3 Event Trigger                          │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                 SQS: Process Queue                               │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │             LangGraph Pipeline (TypeScript)                      │           │
│   │                                                                  │           │
│   │   ┌─────────┐     ┌─────────┐     ┌─────────┐                   │           │
│   │   │  ALIGN  │ ──▶ │ SPLICE  │ ──▶ │  CLEAN  │                   │           │
│   │   └─────────┘     └─────────┘     └─────────┘                   │           │
│   │        │               │               │                         │           │
│   │        ▼               ▼               ▼                         │           │
│   │   Match inputs    Cut into 5s     Quality filter:               │           │
│   │   to frames       training        - Blur detection              │           │
│   │   using RTT       segments        - Artifact check              │           │
│   │   offset                          - Valid actions               │           │
│   │                                                                  │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                 S3: Clean Data Bucket                            │           │
│   │                                                                  │           │
│   │   {wallet}/                                                      │           │
│   │     └── {session_id}/                                           │           │
│   │           ├── segment_001/                                       │           │
│   │           │     ├── frames/          (extracted frames)         │           │
│   │           │     ├── aligned.json     (frame → action mapping)   │           │
│   │           │     └── quality.json     (scores, pass/fail)        │           │
│   │           ├── segment_002/                                       │           │
│   │           └── ...                                                │           │
│   │                                                                  │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                    │                                             │
│                                    ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────┐           │
│   │                 Payout Tracking DB                               │           │
│   │                                                                  │           │
│   │   wallet_address │ valid_segments │ total_frames │ payout_sol   │           │
│   │   ─────────────────────────────────────────────────────────────  │           │
│   │   Dzse3t...yLyR  │      12        │    3600      │   0.05       │           │
│   │                                                                  │           │
│   └─────────────────────────────────────────────────────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Stored Per Session

### 1. Video (.webm)
- **Size**: 2-15MB (1 minute @ 30fps)
- **Format**: VP8 codec, variable bitrate
- **Content**: AI-diffused output from Decart
- **Resolution**: 1280x720

### 2. Inputs (_inputs.json)
```json
[
  {"t": 86647.2, "type": "keydown", "key": "w"},
  {"t": 86703.0, "type": "keydown", "key": "a"},
  {"t": 86901.4, "type": "mouse", "dx": -2, "dy": 0},
  {"t": 87062.5, "type": "keyup", "key": "a"}
]
```
- **t**: `performance.now()` timestamp in ms
- **type**: `keydown` | `keyup` | `mouse`
- **key**: WASD keys
- **dx/dy**: Mouse delta (pointer lock)

### 3. Camera (_camera.json)
```json
[
  {"t": 86097.2, "pos": [93.8, 5, -56.9], "yaw": -2.98, "speed": 0},
  {"t": 86265.3, "pos": [93.9, 5, -56.6], "yaw": -2.97, "speed": 0.06}
]
```
- **t**: Timestamp
- **pos**: [x, y, z] 3D position
- **yaw**: Rotation in radians
- **speed**: Current movement speed (0-0.8)
- **Sampling**: Every 10th frame (~6fps)

### 4. Latency (_latency.json)
```json
{
  "initialLatency": 468.8,
  "avgRtt": 342.9,
  "rttSamples": [
    {"t": 73445, "rtt": 343},
    {"t": 75444, "rtt": 342}
  ]
}
```
- **initialLatency**: Time from stream start → first AI frame (ms)
- **avgRtt**: Average WebRTC round-trip time (ms)
- **rttSamples**: RTT measurements every 2 seconds

### 5. Meta (_meta.json)
```json
{
  "sessionId": "session_1769925785747_z9mm6j",
  "walletAddress": "Dzse3t...yLyR",
  "prompt": "New York City realistic buildings...",
  "duration": 12526,
  "eventCount": 308,
  "startTime": 1769925851385,
  "endTime": 1769925863911,
  "latencySummary": {"initialLatency": 468.8, "avgRtt": 342.9},
  "uploadedAt": "2026-02-01T06:04:40.266Z"
}
```

## Alignment Formula

```
For an input event at time T:
  video_frame_time = T + avgRtt
  frame_index = round((video_frame_time / 1000) * fps)
```

## LangGraph Pipeline Nodes

### ALIGN Node
- Load video, inputs, camera, latency files
- Apply RTT offset to input timestamps
- Map each input event to corresponding video frame
- Output: `aligned.json` with frame↔action mappings

### SPLICE Node
- Cut video into fixed-length segments (e.g., 5 seconds)
- Ensure each segment has meaningful actions
- Skip idle segments (no inputs for extended periods)
- Output: Video segments + per-segment action files

### CLEAN Node
- Run quality checks on each segment:
  - Blur detection (Laplacian variance)
  - Artifact detection (histogram analysis)
  - Action validity (no spam/impossible inputs)
- Score each segment
- Move passing segments to clean bucket
- Output: Cleaned segments + quality scores

## Tracing

All pipeline runs are traced to LangSmith:
- Project: `scale-diffusion`
- Metrics: Run count, token usage, error rate
- Debug: Full execution trace per session
