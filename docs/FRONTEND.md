# Scale Diffusion - Frontend

Real-time AI-powered city visualization using Three.js with diffusion model overlays.

## Architecture

### Core Components
- **App.jsx** - Main app with terminal onboarding, wallet input, TV frame UI
- **GameCanvas.jsx** - Three.js city renderer with Decart AI integration + session recording
- **ShapeBlur.jsx** - Visual effects layer (TV static effect)
- **Spinner.jsx** - Loading spinner component
- **utils/upload.js** - S3 presigned URL upload helper

### App Flow
1. Terminal UI with fastfetch-style splash
2. User enters Solana wallet address
3. Terminal morphs into TV frame
4. Game loads with spinner (black screen)
5. First AI frame received → fade in game, start 1-min recording
6. Click to fullscreen (only after loaded)
7. WASD movement works anywhere, mouse look needs pointer lock
8. Session ends after 1 minute → upload to S3

### Status States
Shown in status box next to wallet address:
- `connecting` (brown) - connecting to Decart
- `collecting` (orange) - recording session, shows countdown timer
- `uploading` - uploading session to S3
- `thankyou` - upload complete
- `connected` (blue) - AI layer active, between sessions
- `disconnected` (gray) - not connected

## Session Recording (Working)

Each 1-minute session uploads 5 files to S3:

### 1. Video (.webm)
- **Size**: 2-15MB
- **Format**: VP8 codec @ 2.5Mbps
- **Content**: AI-diffused output from Decart
- **Resolution**: 1280x720 @ 30fps

### 2. Inputs (_inputs.json)
```json
[
  {"t": 86647.2, "type": "keydown", "key": "w"},
  {"t": 86703.0, "type": "keydown", "key": "a"},
  {"t": 86901.4, "type": "mouse", "dx": -2, "dy": 0},
  {"t": 87062.5, "type": "keyup", "key": "a"}
]
```
- **t**: `performance.now()` timestamp (float, ms)
- **type**: `keydown` | `keyup` | `mouse`
- **key**: WASD keys
- **dx/dy**: Mouse delta (pointer lock)

### 3. Camera (_camera.json)
```json
[
  {"t": 86097.2, "pos": [93.81, 5, -56.86], "yaw": -2.98, "speed": 0},
  {"t": 86265.3, "pos": [93.85, 5, -56.61], "yaw": -2.97, "speed": 0.06}
]
```
- **t**: Timestamp (float, ms)
- **pos**: [x, y, z] Three.js camera position (floats)
- **yaw**: Rotation in radians (float)
- **speed**: Movement speed 0-0.8 (float)
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
  "duration": 60000,
  "eventCount": 308,
  "startTime": 1769925851385,
  "endTime": 1769925863911,
  "latencySummary": {"initialLatency": 468.8, "avgRtt": 342.9},
  "uploadedAt": "2026-02-01T06:04:40.266Z"
}
```

### Alignment Formula
```
For an input at time T, the corresponding video frame:
  frame_time = T + avgRtt
  frame_index = round((frame_time / 1000) * 30)
```

## Real-Time Diffusion Integration

**Primary: StreamDiffusion v2** (in development by friend)
- Will be the main diffusion backend
- Local GPU-based processing

**Fallback: Decart Mirage (Trial)**
- Free trial endpoint (rate limited by IP ~5-10 seconds)
- Use VPN to reset limits

#### Decart Trial Endpoint
```
wss://api3.decart.ai/v1/stream-trial?model=mirage
```

**Protocol:**
1. Open WebSocket
2. Create RTCPeerConnection with VP8 video
3. Send SDP offer: `{ type: 'offer', sdp: '...' }`
4. Exchange ICE candidates: `{ type: 'ice-candidate', candidate: {...} }`
5. Send prompt after answer: `{ type: 'prompt', prompt: '...', enhance_prompt: true }`

**Requirements:**
- Canvas must be **1280x720** (16:9)
- VP8 codec
- ~30fps input stream

## Tech Stack
- React + Vite
- Three.js (city rendering)
- WebRTC (streaming to Decart)
- MediaRecorder (video capture)
- Bun for package management

## Backend (AWS/SST)

Located in `/backend/`. Uses SST v3 for AWS infrastructure.

### Deployed Resources (dev stage, us-west-1)
```
uploadUrl: https://qxmu6uhtdrimcghm2xqun645qy0zthjx.lambda-url.us-west-1.on.aws/
rawBucket: scale-diffusion-dev-rawuploadsbucket-bmkszosn
cleanBucket: scale-diffusion-dev-cleandatabucket-tmckxbrm
```

### S3 Structure
```
rawBucket/
  {walletAddress}/
    ├── {timestamp}_{sessionId}.webm
    ├── {timestamp}_{sessionId}_inputs.json
    ├── {timestamp}_{sessionId}_camera.json
    ├── {timestamp}_{sessionId}_latency.json
    └── {timestamp}_{sessionId}_meta.json
```

### Deploy
```bash
cd backend
bun install
aws configure  # us-west-1
bunx sst deploy --stage dev
```

### Check Uploads
```bash
aws s3 ls s3://scale-diffusion-dev-rawuploadsbucket-bmkszosn/ --recursive
```

### Download Session
```bash
aws s3 cp "s3://scale-diffusion-dev-rawuploadsbucket-bmkszosn/{wallet}/{file}" ./
```

## Data Collection Pipeline

```
Browser (capture) --> Lambda (presigned URL) --> S3 (raw)
                                                    |
                                               SQS trigger
                                                    v
                                              LangGraph Pipeline (TS)
                                              ├── ALIGN (input→frame)
                                              ├── SPLICE (5s segments)
                                              └── CLEAN (quality filter)
                                                    |
                                                    v
                                                S3 (clean)
                                                    |
                                                    v
                                               Payout DB
```

## TODO
- [ ] Get stable diffusion backend (StreamDiffusion v2 or paid Decart)
- [ ] Build LangGraph pipeline (ALIGN → SPLICE → CLEAN)
- [ ] Payout tracking DB
- [ ] Production deployment
