/**
 * Vision Console - Overshoot + LiveKit Integration
 *
 * This component enables real-time vision analysis using Overshoot and publishes
 * vision context to the LiveKit room where the Discord agent is listening.
 *
 * Architecture:
 * - Captures video from webcam/screen via getUserMedia
 * - Streams video to Overshoot for real-time vision inference
 * - Joins the same LiveKit room as the Discord bridge
 * - Publishes vision results as LiveKit data messages
 * - Agent receives vision context and incorporates it into responses
 *
 * Data Message Contract:
 * {
 *   type: "vision_context",
 *   ts: timestamp,
 *   summary: "What the AI sees",
 *   structured: {...}, // optional structured data
 *   confidence: 0.0-1.0,
 *   latency_ms: number
 * }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import FaultyTerminal from './ui/FaultyTerminal';

// Default Overshoot configuration
const DEFAULT_OVERSHOOT_CONFIG = {
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  processing: {
    clip_length_seconds: 1.0,
    delay_seconds: 0.8,
    sampling_ratio: 0.15,
    fps: 15
  },
  inference: {
    model: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
    prompt: 'Describe what you see in 1-2 sentences. Focus on key objects, actions, and context.',
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        objects: { type: 'array', items: { type: 'string' } },
        activity: { type: 'string' }
      }
    }
  }
};

export default function VisionConsole() {
  // URL parameters
  const [roomName, setRoomName] = useState('');
  const [token, setToken] = useState('');

  // Vision state
  const [visionStatus, setVisionStatus] = useState('idle'); // idle, starting, running, error
  const [visionError, setVisionError] = useState('');
  const [videoSource, setVideoSource] = useState('camera'); // camera or screen
  const [currentPrompt, setCurrentPrompt] = useState(DEFAULT_OVERSHOOT_CONFIG.inference.prompt);
  const [promptInput, setPromptInput] = useState(DEFAULT_OVERSHOOT_CONFIG.inference.prompt);

  // Backend selection
  const [backendType, setBackendType] = useState('digitalocean'); // overshoot or digitalocean
  const [customBackendUrl, setCustomBackendUrl] = useState(
    localStorage.getItem('customBackendUrl') || 'http://localhost:8765'
  );

  // LiveKit state
  const [lkStatus, setLkStatus] = useState('disconnected'); // disconnected, connecting, connected, error

  // Stats
  const [visionResults, setVisionResults] = useState([]);
  const [lastPublished, setLastPublished] = useState(null);
  const [stats, setStats] = useState({ resultsReceived: 0, messagesSent: 0, avgLatency: 0 });

  // Refs
  const visionRef = useRef(null);
  const roomRef = useRef(null);
  const videoRef = useRef(null);
  const lastPublishTime = useRef(0);
  const latencySum = useRef(0);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const tk = params.get('token');

    if (room) setRoomName(room);
    if (tk) setToken(tk);
  }, []);

  // Connect to LiveKit room
  const connectLiveKit = useCallback(async () => {
    if (!roomName || !token) {
      alert('Missing room name or token. Use the !watch command in Discord to get a valid link.');
      return;
    }

    if (roomRef.current) {
      console.log('Already connected to LiveKit');
      return;
    }

    setLkStatus('connecting');

    try {
      const room = new Room();
      roomRef.current = room;

      // Set up event handlers
      room.on(RoomEvent.Connected, () => {
        console.log('✓ Connected to LiveKit room:', roomName);
        setLkStatus('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from LiveKit');
        setLkStatus('disconnected');
        roomRef.current = null;
      });

      room.on(RoomEvent.DataReceived, (payload, participant, kind) => {
        // Listen for vision prompt updates from agent
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'vision_set_prompt') {
            console.log('📝 Agent requested prompt change:', data.prompt);
            setCurrentPrompt(data.prompt);
            setPromptInput(data.prompt);

            // Update Overshoot prompt
            if (visionRef.current) {
              visionRef.current.updatePrompt(data.prompt);
            }
          }
        } catch (e) {
          console.error('Error parsing data message:', e);
        }
      });

      // Connect
      const lkUrl = import.meta.env.VITE_LIVEKIT_URL || 'wss://stephen-uw4i9ncb.livekit.cloud';
      await room.connect(lkUrl, token);

      console.log('✓ LiveKit connection established');

    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      setLkStatus('error');
      roomRef.current = null;
      alert(`LiveKit connection failed: ${error.message}`);
    }
  }, [roomName, token]);

  // Disconnect from LiveKit
  const disconnectLiveKit = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      setLkStatus('disconnected');
    }
  }, []);

  // Publish vision context to LiveKit
  const publishVisionContext = useCallback((result) => {
    if (!roomRef.current || lkStatus !== 'connected') {
      console.log(`⚠️ NOT publishing to LiveKit: room=${!!roomRef.current}, status=${lkStatus}`);
      return;
    }
    console.log(`✅ Publishing vision to LiveKit (status=${lkStatus})`)

    // Throttle: max 2 updates per second
    const now = Date.now();
    if (now - lastPublishTime.current < 500) {
      return;
    }
    lastPublishTime.current = now;

    // Calculate latency
    const latency = result.latency_ms || 0;
    latencySum.current += latency;

    // Build message
    const isObjectResult = typeof result === 'object' && result !== null;
    const message = {
      type: 'vision_context',
      ts: now,
      summary: typeof result === 'string'
        ? result
        : (result.summary ?? (typeof result.result === 'string' ? result.result : JSON.stringify(result))),
      structured: isObjectResult ? (result.structured ?? (result.summary || result.result ? undefined : result)) : undefined,
      confidence: isObjectResult && typeof result.confidence === 'number' ? result.confidence : 0.8,
      latency_ms: latency
    };

    // Publish to LiveKit room
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));

    roomRef.current.localParticipant.publishData(data, {
      reliable: true,
      kind: DataPacket_Kind.RELIABLE
    });

    setLastPublished(message);
    setStats(prev => ({
      ...prev,
      messagesSent: prev.messagesSent + 1,
      avgLatency: Math.round(latencySum.current / (prev.messagesSent + 1))
    }));

  }, [lkStatus]);

  // Start vision with custom backend
  const startVisionCustomBackend = useCallback(async () => {
    if (visionRef.current) {
      console.log('Vision already running');
      return;
    }

    setVisionStatus('starting');
    setVisionError('');

    try {
      console.log('🚀 Starting custom vision backend...');

      const healthResponse = await fetch(`${customBackendUrl}/`);
      if (!healthResponse.ok) {
        throw new Error(`Backend health check failed (${healthResponse.status})`);
      }
      const health = await healthResponse.json().catch(() => null);
      const configuredEntry = health && Object.entries(health).find(([key]) => key.endsWith('_configured'));
      if (configuredEntry && configuredEntry[1] === false) {
        throw new Error(`Vision backend is missing required API key (${configuredEntry[0]}=false)`);
      }

      // Create stream on backend
      const streamId = `stream_${Date.now()}`;
      const createResponse = await fetch(`${customBackendUrl}/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream_id: streamId,
          prompt: currentPrompt,
          fps: 10,
          sampling_ratio: 0.5,
          delay_seconds: 5.0
        })
      });

      if (!createResponse.ok) {
        const detail = await createResponse.text().catch(() => '');
        throw new Error(`Failed to create stream (${createResponse.status})${detail ? `: ${detail}` : ''}`);
      }

      // Get user media
      const stream = videoSource === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

      // Show preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Connect WebSocket for streaming
      const ws = new WebSocket(`${customBackendUrl.replace('http', 'ws')}/ws/${streamId}`);

      ws.onopen = () => {
        console.log('✅ Connected to custom backend');
        setVisionStatus('running');

        // Start sending frames
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Send frames every 100ms
        const frameInterval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(frameInterval);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              ws.send(blob);
            }
          }, 'image/jpeg', 0.8);
        }, 100);

        // Store for cleanup
        visionRef.current = {
          ws,
          stream,
          frameInterval,
          streamId,
          stop: async () => {
            clearInterval(frameInterval);
            ws.close();
            stream.getTracks().forEach(track => track.stop());
            video.remove();
            canvas.remove();
          }
        };
      };

      ws.onmessage = (event) => {
        const result = JSON.parse(event.data);
        console.log('📦 Received vision result:', result);

        if (result?.error_code === 'missing_api_key' || (typeof result?.result === 'string' && result.result.includes('[Mock - No API Key]'))) {
          const errorText = result?.result || 'Vision backend missing API key';
          setVisionError(errorText);
          setVisionStatus('error');
          setVisionResults(prev => [errorText, ...prev].slice(0, 10));
          setStats(prev => ({
            ...prev,
            resultsReceived: prev.resultsReceived + 1
          }));
          if (visionRef.current?.stop) {
            visionRef.current.stop().catch(() => {});
            visionRef.current = null;
          }
          return;
        }

        setVisionResults(prev => [result.result, ...prev].slice(0, 10));
        setStats(prev => ({
          ...prev,
          resultsReceived: prev.resultsReceived + 1
        }));

        // Publish to LiveKit
        const visionContext = {
          summary: result.result,
          structured: undefined,
          confidence: 0.9,
          latency_ms: result.inference_latency_ms
        };
        console.log('📤 Publishing to LiveKit:', visionContext);
        publishVisionContext(visionContext);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setVisionStatus('error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setVisionStatus('idle');
      };

    } catch (error) {
      console.error('Failed to start custom backend:', error);
      setVisionStatus('error');
      setVisionError(error.message || String(error));
      alert(`Custom backend error: ${error.message}`);
    }
  }, [videoSource, currentPrompt, customBackendUrl, publishVisionContext]);

  // Start Overshoot vision
  const startVision = useCallback(async () => {
    // Use custom backend if selected
    if (backendType === 'digitalocean') {
      return startVisionCustomBackend();
    }

    if (visionRef.current) {
      console.log('Vision already running');
      return;
    }

    setVisionStatus('starting');
    setVisionError('');

    try {
      console.log('Initializing Overshoot with config:', {
        apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
        prompt: currentPrompt,
        source: videoSource
      });

      // Initialize Overshoot with complete configuration
      const vision = new RealtimeVision({
        apiKey: 'ovs_d30c64306c87ac355f1bb73662f93fcc',
        apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
        prompt: currentPrompt,
        source: videoSource === 'camera'
          ? { type: 'camera', cameraFacing: 'user' }
          : { type: 'screen' },
        backend: 'overshoot',
        model: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
        processing: {
          fps: 10,
          sampling_ratio: 0.4,  // 10 * 0.4 * 2.0 = 8 frames (>= 3) ✓
          clip_length_seconds: 2.0,  // Longer clips for better context
          delay_seconds: 5.0  // Only update every 5 seconds
        },
        debug: true, // Enable debug logging
        onResult: (result) => {
          console.log('Vision result received:', result);

          // Extract the actual result data
          const resultData = result.result || result;

          setVisionResults(prev => [resultData, ...prev].slice(0, 10));
          setStats(prev => ({
            ...prev,
            resultsReceived: prev.resultsReceived + 1
          }));

          // Publish to LiveKit with proper structure
          const visionContext = {
            summary: typeof resultData === 'string' ? resultData : JSON.stringify(resultData),
            structured: typeof resultData === 'object' ? resultData : undefined,
            confidence: 0.8,
            latency_ms: result.total_latency_ms || 0
          };
          console.log('📤 Publishing vision context to LiveKit:', visionContext);
          publishVisionContext(visionContext);
        },
        onError: async (error) => {
          console.error('Overshoot error:', error);

          // If it's a keepalive error, try to restart automatically
          const errorMsg = error.message || String(error);
          if (errorMsg.includes('Keepalive failed') || errorMsg.includes('stream_not_found')) {
            console.warn('⚠️ Stream died, attempting auto-restart in 2 seconds...');

            // Clean up the dead stream
            if (visionRef.current) {
              try {
                await visionRef.current.stop();
              } catch (e) {
                console.warn('Error stopping dead stream:', e);
              }
              visionRef.current = null;
            }

            // Wait a bit then restart
            setTimeout(() => {
              console.log('🔄 Auto-restarting vision stream...');
              startVision();
            }, 2000);
          } else {
            // For other errors, just show the alert
            setVisionStatus('error');
            setVisionError(errorMsg);
            alert(`Overshoot error: ${errorMsg}`);
          }
        }
      });

      console.log('Starting vision stream...');
      await vision.start();
      visionRef.current = vision;

      console.log('Vision started, attempting to get video element...');

      // Get the media stream for preview
      // The SDK should have requested camera/screen access
      if (videoRef.current) {
        // Try multiple ways to get the stream
        const stream = vision.videoElement?.srcObject ||
                      vision.stream ||
                      vision._mediaStream ||
                      vision._videoElement?.srcObject;

        if (stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.warn('Video autoplay blocked:', e));
          console.log('Video preview connected');
        } else {
          // Fallback: request our own stream for preview
          try {
            const previewStream = videoSource === 'camera'
              ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
              : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

            videoRef.current.srcObject = previewStream;
            videoRef.current.play().catch(e => console.warn('Video autoplay blocked:', e));
            console.log('Video preview connected via fallback stream');
          } catch (e) {
            console.warn('Could not create preview stream:', e);
          }
        }
      }

      setVisionStatus('running');
      setVisionError('');
      console.log('✓ Overshoot vision fully started');

    } catch (error) {
      console.error('Failed to start vision:', error);
      setVisionStatus('error');
      setVisionError(error.message || String(error));
      alert(`Vision start failed: ${error.message || error}`);
    }
  }, [videoSource, currentPrompt, publishVisionContext]);

  // Stop vision (works for both backends)
  const stopVision = useCallback(async () => {
    if (visionRef.current) {
      // Check if it's our custom backend or Overshoot
      if (visionRef.current.stop) {
        await visionRef.current.stop();
      }
      visionRef.current = null;

      // Stop video stream
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      setVisionStatus('idle');
      setVisionError('');
      console.log('✓ Vision stopped');
    }
  }, []);

  // Update Overshoot prompt
  const updatePrompt = useCallback(() => {
    if (visionRef.current) {
      visionRef.current.updatePrompt(promptInput);
      setCurrentPrompt(promptInput);
      console.log('✓ Prompt updated');

      // Send status to LiveKit
      if (roomRef.current && lkStatus === 'connected') {
        const message = {
          type: 'vision_status',
          state: 'running',
          detail: `Prompt updated: ${promptInput.slice(0, 50)}...`
        };
        const data = new TextEncoder().encode(JSON.stringify(message));
        roomRef.current.localParticipant.publishData(data, {
          reliable: true,
          kind: DataPacket_Kind.RELIABLE
        });
      }
    }
  }, [promptInput, lkStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVision();
      disconnectLiveKit();
    };
  }, [stopVision, disconnectLiveKit]);

  return (
    <>
      <FaultyTerminal
        scale={1}
        gridMul={[2, 1]}
        digitSize={1.5}
        timeScale={0.3}
        pause={false}
        scanlineIntensity={0.3}
        glitchAmount={1}
        flickerAmount={1}
        noiseAmp={0}
        chromaticAberration={0}
        dither={0}
        curvature={0.2}
        tint="#FF8C00"
        mouseReact={true}
        mouseStrength={0.2}
        pageLoadAnimation={true}
        brightness={1}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }

        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px rgba(255, 140, 0, 0.5); }
          50% { box-shadow: 0 0 20px rgba(255, 140, 0, 0.8), 0 0 30px rgba(255, 140, 0, 0.4); }
        }

        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }

        .section:hover {
          border-color: rgba(255, 140, 0, 0.4) !important;
          box-shadow: 0 0 60px rgba(255, 140, 0, 0.1), inset 0 0 30px rgba(255, 140, 0, 0.03), 0 4px 15px rgba(0, 0, 0, 0.7) !important;
        }

        button:hover {
          background-color: #FF8C00 !important;
          color: #000 !important;
          box-shadow: 0 0 20px rgba(255, 140, 0, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2) !important;
          transform: translateY(-2px);
        }

        button:active {
          transform: translateY(0);
        }

        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: #FF8C00 !important;
          box-shadow: 0 0 15px rgba(255, 140, 0, 0.4), inset 0 0 5px rgba(255, 140, 0, 0.1) !important;
          background-color: rgba(255, 140, 0, 0.03) !important;
        }

        .terminal-scanline {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(to bottom, transparent, rgba(255, 140, 0, 0.2), transparent);
          animation: scan 8s linear infinite;
          pointer-events: none;
          z-index: 100;
        }
      `}</style>
      <div className="terminal-scanline"></div>
      <div style={{
        ...styles.container,
        gridTemplateAreas: visionStatus === 'running'
          ? (lastPublished 
            ? `
              "header header header header header header header header header header header header"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "stats stats stats output output output output output output history history history"
              "stats stats stats output output output output output output history history history"
            `
            : `
              "header header header header header header header header header header header header"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "connection connection controls controls controls controls video video video video video video"
              "stats stats stats history history history history history history history history history"
              "stats stats stats history history history history history history history history history"
            `)
          : (lastPublished 
            ? `
              "header header header header header header header header header header header header"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "stats stats stats output output output output output output history history history"
              "stats stats stats output output output output output output history history history"
            `
            : `
              "header header header header header header header header header header header header"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "connection connection connection controls controls controls controls controls controls video video video"
              "stats stats stats history history history history history history history history history"
              "stats stats stats history history history history history history history history history"
            `)
      }}>
        {/* Terminal Header */}
        <div style={styles.terminalFrame}>
          <div style={styles.terminalHeader}>
            <div style={styles.terminalButtons}>
              <span style={{...styles.terminalButton, backgroundColor: '#ff5f56'}}></span>
              <span style={{...styles.terminalButton, backgroundColor: '#ffbd2e'}}></span>
              <span style={{...styles.terminalButton, backgroundColor: '#27c93f'}}></span>
            </div>
            <div style={styles.terminalTitle}>OPAL://VISION.CONSOLE</div>
            <div style={styles.terminalTime}>{new Date().toLocaleTimeString('en-US', { hour12: false })}</div>
          </div>
          <div style={styles.asciiHeader}>
            <pre style={styles.asciiArt}>
{`┌─────────────────────────────────────────────────────────────────────┐
│  ██████  ██████   █████  ██      ██    ██ ██ ███████ ██  ██████  ███╗   ██╗│
│ ██    ██ ██   ██ ██   ██ ██      ██    ██ ██ ██      ██ ██    ██ ████╗  ██║│
│ ██    ██ ██████  ███████ ██      ██    ██ ██ ███████ ██ ██    ██ ██╔██╗ ██║│
│ ██    ██ ██      ██   ██ ██       ██  ██  ██      ██ ██ ██    ██ ██║╚██╗██║│
│  ██████  ██      ██   ██ ███████   ████   ██ ███████ ██  ██████  ██║ ╚████║│
└─────────────────────────────────────────────────────────────────────┘`}
            </pre>
            <div style={styles.statusLine}>
              <span style={styles.statusIndicator}>[SYSTEM READY]</span>
              <span style={styles.statusIndicator}>[NEURAL NET: ACTIVE]</span>
              <span style={styles.statusIndicator}>[LATENCY: {Math.floor(Math.random() * 50 + 10)}ms]</span>
            </div>
          </div>
        </div>

      {/* Connection Status - Top Left */}
      <div style={{gridArea: 'connection', ...styles.section}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>connection</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        <div style={styles.statusRow}>
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>LiveKit:</span>
            <div style={styles.statusBadge}>
              <span style={{
                ...styles.statusDot,
                backgroundColor: lkStatus === 'connected' ? '#10b981' : lkStatus === 'connecting' ? '#f59e0b' : '#ef4444',
                boxShadow: `0 0 10px ${lkStatus === 'connected' ? '#10b981' : lkStatus === 'connecting' ? '#f59e0b' : '#ef4444'}`
              }}></span>
              <span style={{color: lkStatus === 'connected' ? '#10b981' : lkStatus === 'connecting' ? '#f59e0b' : '#ef4444'}}>
                {lkStatus}
              </span>
            </div>
          </div>
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>Vision:</span>
            <div style={styles.statusBadge}>
              <span style={{
                ...styles.statusDot,
                backgroundColor: visionStatus === 'running' ? '#10b981' : visionStatus === 'starting' ? '#f59e0b' : '#6b7280',
                boxShadow: `0 0 10px ${visionStatus === 'running' ? '#10b981' : visionStatus === 'starting' ? '#f59e0b' : '#6b7280'}`
              }}></span>
              <span style={{color: visionStatus === 'running' ? '#10b981' : visionStatus === 'starting' ? '#f59e0b' : '#9ca3af'}}>
                {visionStatus}
              </span>
            </div>
          </div>
        </div>
        {visionError && (
          <div style={{...styles.errorBanner, fontSize: '0.75rem', padding: '8px'}}>
            {visionError}
          </div>
        )}
        <div style={styles.buttonRow}>
          {lkStatus !== 'connected' ? (
            <button onClick={connectLiveKit} style={styles.button} disabled={!roomName || !token}>
              Connect
            </button>
          ) : (
            <button onClick={disconnectLiveKit} style={{...styles.button, ...styles.buttonDanger}}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Vision Controls - Top Middle */}
      <div style={{gridArea: 'controls', ...styles.section}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>controls</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        
        <div style={styles.controlRow}>
          <div style={{display: 'flex', gap: '16px'}}>
            <div style={{flex: 1}}>
              <label style={{...styles.label, marginBottom: '6px'}}>Backend:</label>
              <div style={styles.segmentedControl}>
                <button
                  style={{...styles.segmentBtn, ...(backendType === 'overshoot' ? styles.segmentBtnActive : {})}}
                  onClick={() => visionStatus !== 'running' && setBackendType('overshoot')}
                  disabled={visionStatus === 'running'}
                >
                  Overshoot
                </button>
                <button
                  style={{...styles.segmentBtn, ...(backendType === 'digitalocean' ? styles.segmentBtnActive : {})}}
                  onClick={() => visionStatus !== 'running' && setBackendType('digitalocean')}
                  disabled={visionStatus === 'running'}
                >
                  DigitalOcean
                </button>
              </div>
            </div>
            
            <div style={{flex: 1}}>
              <label style={{...styles.label, marginBottom: '6px'}}>Source:</label>
              <div style={styles.segmentedControl}>
                <button
                  style={{...styles.segmentBtn, ...(videoSource === 'camera' ? styles.segmentBtnActive : {})}}
                  onClick={() => visionStatus !== 'running' && setVideoSource('camera')}
                  disabled={visionStatus === 'running'}
                >
                  Camera
                </button>
                <button
                  style={{...styles.segmentBtn, ...(videoSource === 'screen' ? styles.segmentBtnActive : {})}}
                  onClick={() => visionStatus !== 'running' && setVideoSource('screen')}
                  disabled={visionStatus === 'running'}
                >
                  Screen
                </button>
              </div>
            </div>
          </div>
        </div>

        {backendType === 'digitalocean' && (
          <div style={styles.controlRow}>
            <label style={styles.label}>
              Custom URL:
              <input
                type="text"
                value={customBackendUrl}
                onChange={(e) => {
                  setCustomBackendUrl(e.target.value);
                  localStorage.setItem('customBackendUrl', e.target.value);
                }}
                style={styles.input}
                placeholder="http://localhost:8000"
                disabled={visionStatus === 'running'}
              />
            </label>
          </div>
        )}

        <div style={{...styles.controlRow, flex: 1, display: 'flex', flexDirection: 'column'}}>
          <label style={styles.label}>
            Prompt:
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              style={styles.textarea}
              placeholder="Describe what you see..."
            />
          </label>
          <div style={styles.buttonRow}>
            <button onClick={updatePrompt} style={styles.buttonSmall} disabled={visionStatus !== 'running'}>
              Update Prompt
            </button>
            <div style={{flex: 1}}></div>
            {visionStatus !== 'running' ? (
              <button onClick={startVision} style={{...styles.button, backgroundColor: 'rgba(255, 140, 0, 0.1)'}} disabled={lkStatus !== 'connected'}>
                Start Vision
              </button>
            ) : (
              <button onClick={stopVision} style={{...styles.button, ...styles.buttonDanger}}>
                Stop Vision
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Video Preview - Top Right */}
      <div style={{gridArea: 'video', ...styles.section}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>video</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{...styles.video, height: '100%', maxHeight: 'none'}}
        />
      </div>

      {/* Stats - Bottom Left */}
      <div style={{gridArea: 'stats', ...styles.section}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>stats</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.resultsReceived}</div>
            <div style={styles.statLabel}>Results</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.messagesSent}</div>
            <div style={styles.statLabel}>Sent</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.avgLatency}ms</div>
            <div style={styles.statLabel}>Latency</div>
          </div>
        </div>
      </div>

      {/* Last Published - Bottom Middle */}
      <div style={{gridArea: 'output', ...styles.section, display: lastPublished ? 'flex' : 'none'}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>output</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        {lastPublished && (
          <pre style={{...styles.code, fontSize: '0.75rem', padding: '8px', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {lastPublished.summary}
          </pre>
        )}
      </div>

      {/* Recent Results - Bottom Right */}
      <div style={{gridArea: 'history', ...styles.section}} className="section">
        <h2 style={styles.sectionTitle}>
          <span style={{color: '#666', marginRight: '8px'}}>~/opal/</span>
          <span style={{color: '#FF8C00'}}>history</span>
          <span style={{color: '#666', marginLeft: '8px'}}>$</span>
        </h2>
        <div style={styles.resultsList}>
          {visionResults.length === 0 ? (
            <p style={styles.emptyState}>No results</p>
          ) : (
            visionResults.slice(0, 4).map((result, i) => (
              <div key={i} style={styles.resultCard} className="result-card">
                <div style={styles.resultHeader}>
                  <span style={styles.resultIndex}>#{stats.resultsReceived - i}</span>
                </div>
                <pre style={{...styles.resultCode, fontSize: '0.7rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {typeof result === 'string' ? result.slice(0, 80) + (result.length > 80 ? '...' : '') : JSON.stringify(result).slice(0, 80) + '...'}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// Styles - Cyberpunk Terminal Experience
const styles = {
  container: {
    maxWidth: '100%',
    margin: '0',
    padding: '12px',
    fontFamily: '"Courier New", "Courier", monospace',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    background: 'radial-gradient(ellipse at center, rgba(255, 140, 0, 0.03) 0%, rgba(0, 0, 0, 0.97) 100%)',
    color: '#FF8C00',
    height: '100vh',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gridTemplateRows: 'auto repeat(8, 1fr)',
    gap: '12px',
    gridTemplateAreas: `
      "header header header header header header header header header header header header"
      "connection connection connection controls controls controls controls controls controls video video video"
      "connection connection connection controls controls controls controls controls controls video video video"
      "connection connection connection controls controls controls controls controls controls video video video"
      "connection connection connection controls controls controls controls controls controls video video video"
      "connection connection connection controls controls controls controls controls controls video video video"
      "stats stats stats output output output output output output history history history"
      "stats stats stats output output output output output output history history history"
      "stats stats stats output output output output output output history history history"
    `
  },
  terminalFrame: {
    gridArea: 'header',
    maxWidth: '100%',
    margin: '0 0 12px 0',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    border: '1px solid rgba(255, 140, 0, 0.3)',
    boxShadow: `
      0 0 100px rgba(255, 140, 0, 0.1),
      inset 0 0 50px rgba(255, 140, 0, 0.05),
      0 10px 40px rgba(0, 0, 0, 0.8)
    `,
    borderRadius: '8px',
    overflow: 'hidden'
  },
  terminalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    backgroundColor: 'rgba(255, 140, 0, 0.05)',
    borderBottom: '1px solid rgba(255, 140, 0, 0.2)'
  },
  terminalButtons: {
    display: 'flex',
    gap: '8px'
  },
  terminalButton: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'block'
  },
  terminalTitle: {
    fontSize: '0.85rem',
    color: '#FF8C00',
    letterSpacing: '0.15em',
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.9
  },
  terminalTime: {
    fontSize: '0.8rem',
    color: '#FF8C00',
    opacity: 0.6,
    fontFamily: '"Courier New", monospace'
  },
  asciiHeader: {
    padding: '10px 15px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderBottom: '1px solid rgba(255, 140, 0, 0.1)'
  },
  asciiArt: {
    color: '#FF8C00',
    fontSize: '0.8rem',
    lineHeight: '1',
    margin: '0 0 20px 0',
    textAlign: 'center',
    fontFamily: '"Courier New", monospace',
    textShadow: '0 0 15px rgba(255,140,0,0.6)',
    opacity: 0.9
  },
  statusLine: {
    display: 'flex',
    justifyContent: 'center',
    gap: '30px',
    fontSize: '0.75rem',
    color: '#FF8C00',
    opacity: 0.7
  },
  statusIndicator: {
    padding: '2px 8px',
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    border: '1px solid rgba(255, 140, 0, 0.3)',
    borderRadius: '2px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    animation: 'flicker 3s infinite'
  },
  section: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(10px)',
    borderRadius: '4px',
    padding: '12px',
    border: '1px solid rgba(255, 140, 0, 0.2)',
    boxShadow: `
      0 0 40px rgba(255, 140, 0, 0.05),
      inset 0 0 30px rgba(255, 140, 0, 0.02),
      0 4px 15px rgba(0, 0, 0, 0.5)
    `,
    position: 'relative',
    transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: '600',
    marginTop: 0,
    marginBottom: '8px',
    color: '#FF8C00',
    letterSpacing: '0.05em',
    fontFamily: '"Courier New", monospace',
    textTransform: 'none',
    borderBottom: '1px solid rgba(255, 140, 0, 0.3)',
    paddingBottom: '4px',
    opacity: 0.95,
    flexShrink: 0
  },
  statusRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
    flexShrink: 0
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 140, 0, 0.03)',
    borderRadius: '4px',
    border: '1px solid rgba(255, 140, 0, 0.1)'
  },
  statusLabel: {
    fontSize: '0.85rem',
    color: '#FF8C00',
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: '0.02em',
    fontFamily: '"Courier New", monospace',
    opacity: 0.8
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.85rem',
    fontWeight: '600',
    fontFamily: '"Courier New", monospace',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    boxShadow: '0 0 8px currentColor'
  },
  statusValue: {
    fontFamily: '"Courier New", monospace',
    color: '#FF8C00',
    fontSize: '0.95rem',
    fontWeight: '600',
    opacity: 0.9
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 'auto',
    flexShrink: 0
  },
  button: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#FF8C00',
    border: '1px solid #FF8C00',
    borderRadius: '2px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: '"Courier New", monospace',
    position: 'relative',
    textTransform: 'none',
    letterSpacing: '0.02em',
    flex: 1,
    textAlign: 'center'
  },
  buttonDanger: {
    color: '#ff0040',
    borderColor: '#ff0040',
    boxShadow: '0 0 10px rgba(255, 0, 64, 0.2)'
  },
  buttonSmall: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#FF8C00',
    border: '1px solid #FF8C00',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'all 0.2s ease',
    fontFamily: '"Courier New", monospace',
    textTransform: 'none',
    letterSpacing: '0.02em'
  },
  controlRow: {
    marginBottom: '16px',
    flexShrink: 0
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '0.85rem',
    color: '#FF8C00',
    fontWeight: '600',
    letterSpacing: '0.02em',
    fontFamily: '"Courier New", monospace',
    textTransform: 'none',
    opacity: 0.9
  },
  segmentedControl: {
    display: 'flex',
    gap: '2px',
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    padding: '2px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 140, 0, 0.2)'
  },
  segmentBtn: {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'rgba(255, 140, 0, 0.6)',
    fontSize: '0.85rem',
    fontFamily: '"Courier New", monospace',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderRadius: '2px'
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255, 140, 0, 0.2)',
    color: '#FF8C00',
    fontWeight: '600',
    boxShadow: '0 0 10px rgba(255, 140, 0, 0.1)'
  },
  input: {
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#FF8C00',
    border: '1px solid rgba(255, 140, 0, 0.3)',
    borderRadius: '2px',
    fontSize: '0.9rem',
    width: '100%',
    transition: 'all 0.2s ease',
    fontFamily: '"Courier New", monospace',
    fontWeight: '400'
  },
  textarea: {
    padding: '10px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#FF8C00',
    border: '1px solid rgba(255, 140, 0, 0.3)',
    borderRadius: '2px',
    fontSize: '0.85rem',
    fontFamily: '"Courier New", monospace',
    resize: 'none',
    transition: 'all 0.2s ease',
    lineHeight: '1.5',
    fontWeight: '400',
    height: '80px',
    overflow: 'auto'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    padding: '8px 0'
  },
  checkboxLabel: {
    fontSize: '0.9rem',
    color: '#FF8C00',
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: '0.02em',
    opacity: 0.9
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    objectFit: 'cover',
    flex: 1,
    minHeight: 0
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px'
  },
  statCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: '12px 8px',
    borderRadius: '4px',
    textAlign: 'center',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    transition: 'all 0.2s ease'
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '4px',
    letterSpacing: '-0.02em',
    fontFamily: 'Georgia, serif'
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: '500',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  code: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    overflow: 'hidden',
    border: '1px solid rgba(255, 140, 0, 0.2)',
    color: '#FF8C00',
    fontFamily: '"Courier New", monospace',
    lineHeight: '1.4',
    fontWeight: '400',
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis'
  },
  detailsSummary: {
    cursor: 'pointer',
    color: '#FF8C00',
    marginTop: '15px',
    marginBottom: '15px',
    fontWeight: '600',
    fontSize: '0.875rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  errorBanner: {
    marginTop: '20px',
    padding: '16px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: '"Courier New", monospace',
    fontWeight: '500',
    fontSize: '0.9rem'
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    overflow: 'hidden',
    flex: 1
  },
  resultCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: '6px 8px',
    borderRadius: '0',
    border: '1px solid rgba(255, 140, 0, 0.3)',
    borderTop: 'none',
    transition: 'all 0.2s ease',
    boxShadow: 'inset 0 0 10px rgba(255,140,0,0.03)',
    flexShrink: 0,
    minHeight: 0
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
    fontSize: '0.75rem',
    color: '#FF8C00',
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: '0.03em',
    opacity: 0.75
  },
  resultIndex: {
    fontWeight: '900',
    color: '#FF8C00',
    textShadow: '0 0 10px rgba(255,140,0,0.5)'
  },
  resultTime: {
    fontFamily: '"Courier New", monospace',
    fontSize: '0.85rem'
  },
  resultCode: {
    margin: 0,
    fontSize: '0.7rem',
    color: 'rgba(255, 140, 0, 0.95)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '1.4',
    fontFamily: '"Courier New", monospace',
    fontWeight: '400',
    letterSpacing: '0.01em'
  },
  emptyState: {
    textAlign: 'center',
    color: '#FF8C00',
    padding: '20px',
    fontSize: '0.9rem',
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: '0.05em',
    opacity: 0.4
  }
};

