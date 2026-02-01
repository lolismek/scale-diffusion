# Scale Diffusion - Frontend

Real-time AI-powered city visualization using Three.js with diffusion model overlays.

## Architecture

### Core Components
- **App.jsx** - Main app with terminal onboarding, wallet input, TV frame UI
- **GameCanvas.jsx** - Three.js city renderer with Decart AI integration
- **ShapeBlur.jsx** - Visual effects layer (TV static effect)
- **GradualBlur.jsx** - UI blur effects

### App Flow
1. Terminal UI with fastfetch-style splash
2. User enters Solana wallet address
3. Terminal morphs into TV frame
4. Game loads with spinner (black screen)
5. First AI frame received → fade in game
6. Click to fullscreen (only after loaded)
7. WASD movement works anywhere, mouse look needs pointer lock

### Real-Time Diffusion Integration

**Primary: StreamDiffusion v2** (in development by friend)
- Will be the main diffusion backend
- Local GPU-based processing

**Fallback: Decart Mirage (Trial)**
- Free trial endpoint (rate limited by IP)
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

**Rate Limits:**
- ~5-10 seconds per session on trial
- Limited by IP address
- VPN resets the limit
- Incognito/different browser may help

## Tech Stack
- React + Vite
- Three.js (city rendering)
- WebRTC (streaming to Decart)
- @decartai/sdk (installed but using raw WebSocket for trial)

## Data Collection Pipeline

```
Browser (capture) --> API/Lambda --> S3 (raw)
                                        |
                                   SQS trigger
                                        v
                                  LangGraph Pipeline
                                  - Quality check
                                  - Consistency check
                                  - Hallucination check
                                        |
                                        v
                                    S3 (clean)
                                        |
                                        v
                                     Payout
                              (only for clean data)
```

Users capture frames from the AI-rendered city view. Pipeline filters out:
- Blurry frames
- Glitched captures
- Bad angles
- Heavy diffusion artifacts

Only validated clean data triggers payout.

## TODO
- [ ] S3 buckets (raw + clean)
- [ ] Lambda upload endpoint
- [ ] SQS trigger setup
- [ ] LangGraph validation pipeline
- [ ] Payout tracking DB
- [ ] StreamDiffusion v2 integration when ready
- [ ] Production Decart API key (if needed as backup)
