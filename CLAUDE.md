# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Scale Diffusion** — a web app that crowdsources game data for AI training. Users play in a 3D city environment rendered with Three.js, with real-time AI texture overlays via Decart Mirage (WebRTC). Frame pairs + user inputs are logged as training data. Users connect a Solana wallet and earn token rewards for quality data.

## Commands

### Frontend App (React) — `frontend/app/`
```bash
cd frontend/app
npm run dev        # Vite dev server
npm run build      # Production build
npm run lint       # ESLint
npm run preview    # Preview production build
```

### Frontend Game (TypeScript) — `frontend/game/`
```bash
cd frontend/game
bun install                 # Install dependencies
bunx --bun vite             # Dev server
bunx --bun vite build       # Build
bunx --bun vite preview     # Preview
```

### StreamDiffusionV2 (Python ML Backend) — `StreamDiffusionV2/`
```bash
conda create -n stream python=3.10.0
pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
python setup.py develop

# Single GPU inference
python streamv2v/inference.py --config_path configs/wan_causal_dmd_v2v.yaml --checkpoint_folder ckpts/ --output_folder outputs/

# Multi-GPU inference
torchrun --nproc_per_node=2 streamv2v/inference_pipe.py --config_path configs/wan_causal_dmd_v2v.yaml --checkpoint_folder ckpts/ --output_folder outputs/
```

## Tooling Conventions

- **Bash**: Avoid piping output through `head`, `tail`, `less`, or `more` — causes buffering issues. Use command-specific flags instead (e.g., `git log -n 10`).
- **Python**: Use `uv` for all package management and running programs.
- **TypeScript**: Use `bun` for all package management and running programs.

## Architecture

```
frontend/
├── app/              # Main React app (user-facing)
│   └── src/
│       ├── App.jsx           # Terminal UI → Game transition, wallet input
│       ├── components/
│       │   ├── GameCanvas.jsx  # Three.js city + Decart WebRTC integration
│       │   └── ShapeBlur.jsx   # WebGL shader background effect
│       └── ribbons/            # WebGL ribbon simulation (background visuals)
├── game/             # Block Builder game (TypeScript reference implementation)
│   └── src/
│       ├── main.ts             # Entry point, animation loop
│       ├── engine.ts           # Three.js scene/camera/renderer/post-processing
│       ├── controls.ts         # WASD + mouse car-style movement
│       ├── blocks.ts           # Block creation/editing
│       ├── buildings.ts        # Building mesh from city.json
│       ├── ai.ts               # Decart AI texturing
│       ├── scenarios/          # Mission/objective system
│       └── io.ts               # Save/load scenes as JSON
StreamDiffusionV2/    # Video diffusion ML backend
├── streamv2v/        # Streaming video-to-video pipeline
├── causvid/          # Causal video diffusion models
├── configs/          # YAML configs for model variants (1.3B and 14B)
└── demo/             # Svelte web UI demo
```

### App Flow (frontend/app)

1. **Terminal state**: Fastfetch-style splash screen with ASCII logo, system info, wallet input
2. User enters Solana wallet address (validated as base58, 32-44 chars)
3. Terminal morphs (CSS animation) from fullscreen → 480x480 centered square
4. **Game state**: Three.js city renders inside the frame with ShapeBlur effect behind it
5. Decart AI texture overlay activates via WebRTC
6. Click to toggle fullscreen (only after first AI frame received)

### Decart Integration (WebRTC)

Both `GameCanvas.jsx` and `game/src/ai.ts` follow the same pattern:
1. Canvas captures at 30fps via `canvas.captureStream(30)`
2. WebSocket connects to Decart endpoint
3. RTCPeerConnection created, canvas tracks added (VP8 codec)
4. SDP offer/answer exchange + ICE candidate exchange
5. Remote track received → video element overlays canvas at z-index 100
6. Prompts can be updated mid-stream

**Canvas must be 1280x720** (Decart requirement for 16:9 aspect ratio).

- **Trial endpoint**: `wss://api3.decart.ai/v1/stream-trial?model=mirage` (no key, ~5-10s sessions, IP-limited)
- **Authenticated**: `wss://api3.decart.ai/v1/stream?model=mirage&api_key=KEY`

### Three.js Setup (GameCanvas.jsx)

- Camera: 75° FOV, 1280x720 renderer (fixed for Decart)
- Scene: Sky blue (#87CEEB), fog 100-1500, ground plane 10000x10000
- Post-processing: EffectComposer with UnrealBloomPass
- Car-style controls: acceleration/friction physics, pointer lock for mouse look
- Buildings: Loaded from `public/city.json`, rendered via ExtrudeGeometry from 2D vertex polygons

### Game (frontend/game)

Block Builder with scenario system. Loads Manhattan map from `/builds/manhattan_clean_dashes.json`. Camera starts at (-1099, 1.6, -900). Animation loop: `updateScenario → updateMovement → updateTiles → render`.

### City Data Format (city.json)

```json
{
  "map": { "width": 1200, "depth": 1200, "color": "#3a3a3a", "skyColor": "#87CEEB" },
  "buildings": [{ "vertices": [[x1, z1], ...], "height": 209.6, "color": "#8AAEC0" }]
}
```

### Data Collection Pipeline (planned)

```
Browser (capture) → API/Lambda → S3 (raw) → SQS → LangGraph validation → S3 (clean) → Payout
```

## Environment Variables

- `VITE_DECART_API_KEY` — Decart API key (in `frontend/app/.env`; trial endpoint works without it)
- `DECART_API_KEY` — Root `.env` for game/backend use

## Key Vite Config (frontend/app)

- React + GLSL shader plugins
- Path aliases: `@` → `src/`, `shaders` → `src/ribbons/shaders/`
- Events polyfill included in optimizeDeps
