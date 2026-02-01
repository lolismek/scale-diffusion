# Scale Diffusion - Context

## Overview
Webapp to crowdsource game data/movements for AI training. Users play diffusion-based generated games, and we log frame pairs (x, x+t) + inputs (keystrokes, mouse deltas) for training data. Users earn Solana token rewards for contributing useful data.

## Architecture

```
User Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Terminal UI    │ --> │  Wallet Input   │ --> │   Game View     │
│  (fastfetch)    │     │  (validation)   │     │  (3D + AI)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘

Backend Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Three.js       │ --> │  Decart API     │ --> │  AI-Textured    │
│  Canvas Stream  │     │  (WebSocket)    │     │  Video Output   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Tech Stack
- **Frontend**: React 19 + Vite
- **3D Engine**: Three.js with post-processing (bloom)
- **AI Texturing**: Decart Mirage (realtime WebRTC streaming)
- **Blockchain**: Solana (wallet-first flow for rewards)
- **Styling**: CSS with IBM Plex Mono font

## Directory Structure

```
frontend/
├── app/                    # Main React application
│   ├── public/
│   │   ├── city.json       # NYC building data (vertices, heights, colors)
│   │   ├── ascii-video.mp4 # Background video for ASCII effect
│   │   └── ribbons/        # Ribbon simulation iframe
│   ├── src/
│   │   ├── App.jsx         # Main app component
│   │   ├── App.css         # All styling
│   │   └── components/
│   │       ├── GameCanvas.jsx  # Three.js + Decart integration
│   │       └── ShapeBlur.jsx   # WebGL shader effect (react-bits)
│   └── .env                # VITE_DECART_API_KEY
└── game/                   # Original game (TypeScript, reference)
    └── src/                # Block builder with Decart integration
```

## Key Components

### App.jsx
Main application with two states:
1. **Terminal State** (`!isConnected`): Fastfetch-style splash with ASCII logo, system info, color palettes, and wallet input
2. **Game State** (`isConnected`): 480x480 game frame with Three.js city and ShapeBlur effect

**State Variables:**
- `walletAddress` - User's Solana wallet
- `isConnected` - Whether wallet is connected
- `isTransitioning` - Terminal morph animation in progress
- `aiPrompt` - Prompt sent to Decart for AI texturing

**Transition Flow:**
1. User enters wallet address
2. Terminal content fades out
3. Terminal morphs from fullscreen to 480x480 centered square
4. Game frame appears with border glow animation
5. ShapeBlur fades in behind

### GameCanvas.jsx
Three.js scene with Decart AI texturing overlay.

**Three.js Setup:**
- PerspectiveCamera at (0, 5, 50)
- Sky blue background (#87CEEB) with fog
- Hemisphere + directional lighting
- Post-processing: EffectComposer with UnrealBloomPass
- Ground plane (10000x10000)
- Buildings loaded from `/city.json` using ExtrudeGeometry

**Controls:**
- Click to lock pointer
- WASD for car-style movement (acceleration, steering)
- Mouse for camera rotation

**Decart Integration (WebSocket):**
```javascript
// Connection flow:
1. Capture canvas stream at 30fps
2. Connect to wss://api3.decart.ai/v1/stream-trial?model=mirage
3. Create RTCPeerConnection with STUN server
4. Add canvas tracks to peer connection
5. Create/send SDP offer
6. Receive SDP answer, set remote description
7. Receive ICE candidates, add to peer connection
8. On remote track received, set video.srcObject
9. Video element overlays canvas with AI-transformed stream
```

**Video Overlay:**
- Positioned absolute over canvas
- z-index: 100
- opacity: 0 when disconnected, 1 when connected
- Black background as fallback

### ShapeBlur.jsx
WebGL shader effect from react-bits. Creates a blurred square shape that responds to mouse movement. Renders behind the game frame for a futuristic floating effect.

**Props:**
- `variation`: 0 (rounded rectangle)
- `shapeSize`: 1.3
- `roundness`: 0
- `borderSize`: 0.01
- `circleSize`: 0.02
- `circleEdge`: 1.7

## Animations

### Terminal Morph
```css
@keyframes morphToSquare {
  0% { top: 0; left: 0; width: 100vw; height: 100vh; }
  100% { top: 50%; left: 50%; width: 482px; height: 482px; transform: translate(-50%, -50%); }
}
```
- Duration: 0.8s
- White border appears during morph
- Content fades out (0.4s)

### Game Frame Glow
```css
/* Static glow on ::after */
box-shadow: 0 0 60px rgba(255,255,255,0.2);
animation: glowOut 1.5s ease-out forwards;

/* Push-out effect on ::before */
background: rgba(255,255,255,0.08);
filter: blur(30px) -> blur(50px);
scale: 1 -> 1.6;
z-index: -1 (behind frame)
```

### ShapeBlur Fade
```css
animation: fadeIn 1s ease-out forwards;
```

## City Data Format (city.json)

```json
{
  "map": {
    "width": 1200,
    "depth": 1200,
    "color": "#3a3a3a",
    "skyColor": "#87CEEB"
  },
  "buildings": [
    {
      "vertices": [[x1, z1], [x2, z2], ...],  // 2D polygon outline
      "height": 209.6,
      "color": "#8AAEC0"
    }
  ]
}
```

Buildings are rendered using Three.js ExtrudeGeometry - the 2D vertices are extruded upward by the height value.

## Decart API Notes

**Trial Endpoint:**
- URL: `wss://api3.decart.ai/v1/stream-trial?model=mirage`
- No API key required
- Short session duration (disconnects after ~10-30 seconds)
- Good for testing

**Authenticated Endpoint:**
- URL: `wss://api3.decart.ai/v1/stream?model=mirage&api_key=KEY`
- Requires valid API key
- Longer sessions

**Message Types:**
- `offer` - SDP offer from client
- `answer` - SDP answer from server
- `ice` - ICE candidates
- `session_id` - Session identifier
- `generation_started` - AI generation has begun
- `prompt` - Update the AI prompt mid-session

## Environment Variables

```
VITE_DECART_API_KEY=hello_xxx...  # Decart API key (optional, trial works without)
```

## Future Work

- **Data Logging**: Capture frame pairs (x, x+t) + user inputs
- **Session Storage**: Save to AWS S3 tied to wallet address
- **Token Rewards**: Solana airdrops for useful training data
- **Game Modes**: Preset prompts (driving, walking, building) that qualify for rewards
- **Custom Prompts**: Allow user prompts but no rewards for consistency
