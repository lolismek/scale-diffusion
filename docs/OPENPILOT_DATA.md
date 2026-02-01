# OpenPilot Driving Model - Data Format

This document describes the input/output format of the OpenPilot driving model.

## Architecture Overview

The driving model is a **two-stage architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   [Main Camera]──┐                                                          │
│                  ├──► VISION MODEL ──► [512-dim latent] ──┐                │
│   [Wide Camera]──┘                                        │                │
│                                                           ▼                │
│   [Desire Pulse]────────────────────────────────────► POLICY    ──► Plan   │
│   [Traffic Convention]──────────────────────────────► MODEL     ──► Lanes  │
│   [Prev Curvatures]─────────────────────────────────►           ──► Leads  │
│   [Features Buffer (5s history)]────────────────────►           ──► Meta   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Inputs

### Vision Inputs

#### Camera Frames

| Input | Shape | Description |
|-------|-------|-------------|
| Main Camera | `(2, 6, 128, 256)` | Two consecutive frames in YUV420 |
| Wide Camera | `(2, 6, 128, 256)` | Two consecutive frames in YUV420 |

**Total vision input size**: 799,906 float32 values

Each camera captures two consecutive frames at 20 Hz (256×512 RGB, downsampled to 128×256).

**YUV420 encoding (6 channels)**:
- Channels 0-3: Full-resolution Y (luminance), subsampled as `Y[::2, ::2]`, `Y[::2, 1::2]`, `Y[1::2, ::2]`, `Y[1::2, 1::2]`
- Channel 4: Half-resolution U (chrominance)
- Channel 5: Half-resolution V (chrominance)

---

### Policy Inputs (Temporal Context)

All policy inputs use a **sliding window** of the past 5 seconds at 20 fps = 100 frames.

#### Desire Pulse

| Shape | `(100, 8)` |
|-------|------------|
| Type | One-hot encoded |
| Source | Driver blinker input |

The 8 desire values:

| Index | Desire | Description |
|-------|--------|-------------|
| 0 | `none` | No specific desire |
| 1 | `turnLeft` | Turn left at intersection |
| 2 | `turnRight` | Turn right at intersection |
| 3 | `laneChangeLeft` | Change to left lane |
| 4 | `laneChangeRight` | Change to right lane |
| 5 | `keepLeft` | Stay in left portion of lane |
| 6 | `keepRight` | Stay in right portion of lane |
| 7 | (unused) | Padding for one-hot encoding |

**Note**: Desire is a **command from the driver** (via blinker), not model-generated. The model receives intent and executes it.

```python
# Example: Driver signals lane change left 2 seconds ago
desire_pulse[0:60] = [0,0,0,0,0,0,0,0]   # No desire (older frames)
desire_pulse[60:100] = [0,0,0,1,0,0,0,0] # laneChangeLeft active (recent frames)
```

---

#### Traffic Convention

| Shape | `(2,)` |
|-------|--------|
| Type | One-hot encoded |
| Source | Driver monitoring (is_RHD) |

| Value | Meaning |
|-------|---------|
| `[1, 0]` | Left-hand traffic (drive on left, e.g., UK, Japan) |
| `[0, 1]` | Right-hand traffic (drive on right, e.g., USA, EU) |

---

#### Previous Desired Curvatures

| Shape | `(100, 1)` |
|-------|------------|
| Type | Float32 |
| Source | Model's own previous predictions |
| Units | 1/meters (curvature = 1/radius) |

This is the **model's own output** from previous timesteps fed back as input. Higher curvature = sharper turn.

```python
# Example: Gradual left turn
prev_curvatures = [0.001, 0.002, 0.003, ..., 0.01]  # Increasing left curvature
```

---

#### Features Buffer

| Shape | `(100, 512)` |
|-------|--------------|
| Type | Float32 |
| Source | Vision model hidden state |

This is the **latent representation** from the vision model. Each frame, the vision model outputs a 512-dimensional feature vector that encodes the visual scene. These are stored in a sliding window buffer.

```python
# Each inference step:
vision_features = vision_model(camera_frames)  # (512,)
features_buffer.push(vision_features)          # FIFO queue
# Model sees 5 seconds of visual context
```

This allows the policy model to understand:
- Motion and dynamics (how things are moving)
- Scene changes over time
- Temporal consistency

---

#### Lateral Control Params

| Shape | `(2,)` |
|-------|--------|
| Type | Float32 |

| Index | Value |
|-------|-------|
| 0 | Current vehicle speed |
| 1 | Steering actuator delay |

---

## Outputs

### Plan (Trajectory Prediction)

| Shape | `(33, 15)` |
|-------|------------|
| Type | Float32 |
| Horizon | 0 to 10 seconds ahead |

The model predicts the **future trajectory of the ego vehicle** in ego-centric coordinates.

#### Time Indices (33 points, non-uniform)

```python
T_IDXS = [0.0, 0.01, 0.04, 0.09, 0.16, 0.25, ..., 10.0]  # Quadratic spacing
```

More points near-term (precise control), fewer far-term (rough planning).

#### Plan Components (15 values per time point)

| Slice | Values | Description |
|-------|--------|-------------|
| 0:3 | Position (x, y, z) | Relative position in meters |
| 3:6 | Velocity (x, y, z) | Velocity in m/s |
| 6:9 | Acceleration (x, y, z) | Acceleration in m/s² |
| 9:12 | Orientation (euler) | Rotation from current heading |
| 12:15 | Orientation rate | Angular velocity |

**Coordinate system** (ego-centric):
- `x` = forward (positive = ahead)
- `y` = lateral (positive = right, negative = left)
- `z` = vertical (positive = up)

```python
# Example: Driving straight at 15 m/s, slight curve right
plan[0] = {
    'position': [0, 0, 0],           # Now: at origin
    'velocity': [15, 0, 0],          # Moving forward at 15 m/s
    'acceleration': [0, 0.1, 0],     # Slight rightward accel
}
plan[10] = {
    'position': [30, 0.5, 0],        # 2 seconds later: 30m ahead, 0.5m right
    'velocity': [15, 0.2, 0],        # Still ~15 m/s, drifting right
    ...
}
```

---

### Lane Lines

| Shape | `(4, 33, 2)` |
|-------|--------------|
| Type | Float32 |
| Additional | `lane_line_probs (4,)`, `lane_line_stds (4,)` |

Predicts the position of lane boundaries at 33 distance points.

#### The 4 Lane Lines

```
    Lane 0 (far left edge)
    ─────────────────────────────────
    
    Lane 1 (left boundary) ← YOUR LANE
    ═════════════════════════════════
    
              🚗 YOU
    
    Lane 2 (right boundary) ← YOUR LANE  
    ═════════════════════════════════
    
    Lane 3 (far right edge)
    ─────────────────────────────────
```

#### Distance Points (33 points)

```python
X_IDXS = [0, 0.2, 0.8, 1.8, 3.2, 5.0, ..., 192.0]  # Quadratic spacing, meters ahead
```

#### Values (2 per point)

| Index | Value | Description |
|-------|-------|-------------|
| 0 | y | Lateral distance from car center (meters) |
| 1 | z | Height (meters, for hills/bridges) |

**Sign convention**:
- Negative y = left of car
- Positive y = right of car

```python
# Example: Standard 3.6m lane, slight right curve ahead
lane_lines[1].y = [-1.8, -1.85, -1.9, -2.0, ...]  # Left line moving further left
lane_lines[2].y = [+1.8, +1.75, +1.7, +1.6, ...]  # Right line moving closer
# Interpretation: Road curves to the right
```

---

### Road Edges

| Shape | `(2, 33, 2)` |
|-------|--------------|
| Type | Float32 |

Similar to lane lines, but for **road boundaries** (where pavement ends):
- Index 0: Left road edge
- Index 1: Right road edge

Useful when lane markings are absent or unclear.

---

### Lead Vehicles

| Shape | `(3, 6, 4)` |
|-------|-------------|
| Type | Float32 |
| Additional | `lead_probs (3,)` |

Predicts trajectory of up to 3 vehicles ahead.

#### Dimensions

| Dim | Size | Description |
|-----|------|-------------|
| 0 | 3 | Number of leads (closest, 2nd, 3rd) |
| 1 | 6 | Time points: [0, 2, 4, 6, 8, 10] seconds |
| 2 | 4 | Values: (x, y, v, a) |

#### Values

| Index | Value | Units | Description |
|-------|-------|-------|-------------|
| 0 | x | meters | Distance ahead |
| 1 | y | meters | Lateral offset |
| 2 | v | m/s | Velocity |
| 3 | a | m/s² | Acceleration |

```python
# Example: Car 30m ahead, slowing down
leads[0] = {
    't=0s': {'x': 30, 'y': 0, 'v': 12, 'a': -1.0},   # 30m ahead, 12 m/s, braking
    't=2s': {'x': 50, 'y': 0, 'v': 10, 'a': -1.0},   # Now 50m ahead (we're faster)
    ...
}
lead_probs[0] = 0.95  # High confidence this car exists
```

---

### Meta (Driver Behavior Predictions)

Various probabilities for safety and engagement:

#### Engagement

| Output | Description |
|--------|-------------|
| `engaged` | Is autopilot currently engaged? |

#### Disengage Predictions (at 2, 4, 6, 8, 10 seconds)

| Output | Description |
|--------|-------------|
| `gas_disengage` | Will driver press gas? |
| `brake_disengage` | Will driver press brake? |
| `steer_override` | Will driver override steering? |

#### Hard Brake Predictions

| Output | Description |
|--------|-------------|
| `hard_brake_3` | Emergency brake (3 m/s²) |
| `hard_brake_4` | Emergency brake (4 m/s²) |
| `hard_brake_5` | Emergency brake (5 m/s²) |

#### Other

| Output | Description |
|--------|-------------|
| `gas_press` | Probability driver will press gas |
| `brake_press` | Probability driver will press brake |
| `left_blinker` | Probability left blinker will activate |
| `right_blinker` | Probability right blinker will activate |

---

### Desire State (Output)

| Shape | `(8,)` |
|-------|--------|
| Type | Softmax probabilities |

The model's prediction of the **current desire state** (what maneuver is happening now).

### Desire Prediction (Output)

| Shape | `(4, 8)` |
|-------|---------|
| Type | Softmax probabilities |

Predicted desire state at 4 future time points.

---

### Pose (Ego-motion)

| Shape | `(6,)` |
|-------|--------|
| Type | Float32 |

Camera ego-motion estimation:
- Indices 0-2: Translation (x, y, z)
- Indices 3-5: Rotation (roll, pitch, yaw)

---

## Control Flow

The model outputs are **not direct control commands**. The control stack converts them:

```
Model Output                    Control Stack                  Actuators
─────────────────────────────────────────────────────────────────────────
plan.position      ──►  MPC (Model Predictive Control)  ──►  Steering angle
plan.velocity      ──►  Longitudinal planner            ──►  Throttle/Brake
lane_lines         ──►  Lane centering                  ──►  Steering adjust
leads              ──►  Adaptive cruise control         ──►  Speed control
```

The key insight: **the model predicts where the car should go** (trajectory), and the control stack figures out **how to get there** (actuator commands).

---

## Training Data Source

Training data comes from driving logs containing:
- Camera recordings (`.hevc` files)
- CAN bus data (steering angle, speed, pedal positions)
- GPS/IMU data
- Driver actions (for labels)

The model learns to predict future trajectories by observing how human drivers navigate roads.

---

## Key Constants

```python
class ModelConstants:
    MODEL_RUN_FREQ = 20        # Inference rate (Hz)
    N_FRAMES = 2               # Frames per camera input
    
    IDX_N = 33                 # Number of time/distance points
    FEATURE_LEN = 512          # Vision latent dimension
    DESIRE_LEN = 8             # Desire one-hot size
    
    NUM_LANE_LINES = 4         # Lane boundaries
    NUM_ROAD_EDGES = 2         # Road edges
    
    PLAN_WIDTH = 15            # Values per plan point
    LEAD_TRAJ_LEN = 6          # Lead prediction time points
    LEAD_WIDTH = 4             # Values per lead (x, y, v, a)
```

---

## References

- `openpilot/selfdrive/modeld/models/README.md` - Model architecture docs
- `openpilot/selfdrive/modeld/constants.py` - Constants and slices
- `openpilot/selfdrive/modeld/parse_model_outputs.py` - Output parsing
- `openpilot/selfdrive/modeld/modeld.py` - Main inference code
- `openpilot/cereal/log.capnp` - Message schemas
