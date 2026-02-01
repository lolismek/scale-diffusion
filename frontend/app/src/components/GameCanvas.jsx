import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { Spinner } from './Spinner';
import { uploadSession } from '../utils/upload';
import {
  initScenarioEngine,
  startScenario,
  updateScenario,
  scenarioState,
  sampleScenarios,
  getScenarioById,
  setOnScenarioStateChange,
} from '../game/scenarios';

const SESSION_DURATION_MS = 60 * 1000; // 1 minute
const DECART_TIMEOUT_MS = 3000; // 3 second timeout for Decart connection
const LOCAL_DIFFUSION_URL = 'ws://localhost:7860/ws'; // Local StreamDiffusion server
const LOCAL_DIFFUSION_FRAME_INTERVAL = 33; // ~30fps

const GameCanvas = forwardRef(({ className = '', apiKey = '', prompt = 'new york city realistic buildings and streets', isFullscreen = false, onLoaded = () => {}, onStatusChange = () => {}, onTimerUpdate = () => {}, onScenarioChange = () => {}, walletAddress = '' }, ref) => {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasOutputRef = useRef(null); // Canvas for displaying local diffusion output
  const rendererRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const connectingRef = useRef(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState('disconnected');
  const [loaded, setLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [debugMode, setDebugMode] = useState(false); // Press 'p' to toggle
  const [usingLocalDiffusion, setUsingLocalDiffusion] = useState(false); // Track which backend is active
  
  // Local diffusion refs
  const localWsRef = useRef(null);
  const localFrameIntervalRef = useRef(null);
  const connectionTimeoutRef = useRef(null);

  // Scenario state
  const [activeScenario, setActiveScenario] = useState(null);
  const [scenarioStatus, setScenarioStatus] = useState('idle'); // idle|playing|won|lost
  const scenarioEngineInitRef = useRef(false);
  const gameStateRef = useRef({ yaw: 0, carSpeed: 0 });

  // Logging refs
  const sessionLogRef = useRef([]);
  const cameraRef = useRef(null);

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const sessionIdRef = useRef(`session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const sessionTimerRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const timerIntervalRef = useRef(null);

  // Latency tracking
  const latencyRef = useRef({
    samples: [],
    streamStartTime: null,
    firstFrameTime: null,
    initialLatency: null,
  });

  // Scenario helpers
  const handleStartScenario = useCallback((scenarioId) => {
    const scenario = getScenarioById(scenarioId);
    if (scenario) {
      startScenario(scenario);
      setActiveScenario(scenario);
      setScenarioStatus('playing');
      onScenarioChange(scenario);
    }
  }, [onScenarioChange]);

  const handleStartRandomScenario = useCallback(() => {
    const randomScenario = sampleScenarios[Math.floor(Math.random() * sampleScenarios.length)];
    handleStartScenario(randomScenario.id);
  }, [handleStartScenario]);


  // Enable AI texture via WebSocket
  const enableAI = async () => {
    if (connectingRef.current || wsRef.current) return;
    if (!rendererRef.current) return;

    connectingRef.current = true;
    setAiStatus('connecting');
    console.log('[Decart] ========================================');
    console.log('[Decart] Connecting to Decart AI...');
    
    // Set up 3-second timeout to fallback to local StreamDiffusion
    connectionTimeoutRef.current = setTimeout(() => {
      if (aiStatus === 'connecting' && !aiEnabled) {
        console.log('[Fallback] Decart connection timeout after 3 seconds');
        console.log('[Fallback] Switching to local StreamDiffusion...');
        disableAI();
        enableLocalDiffusion();
      }
    }, DECART_TIMEOUT_MS);

    try {
      const canvas = rendererRef.current.domElement;
      console.log('[Decart] Canvas:', canvas.width, 'x', canvas.height);
      const stream = canvas.captureStream(30);
      console.log('[Decart] Stream tracks:', stream.getTracks().length);

      const ws = new WebSocket('wss://api3.decart.ai/v1/stream-trial?model=mirage');
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('[Decart] WebSocket connected');

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.onconnectionstatechange = () => {
          console.log('[Decart] Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected' && !latencyRef.current.streamStartTime) {
            latencyRef.current.streamStartTime = performance.now();
            console.log('[Decart] Stream started at:', latencyRef.current.streamStartTime.toFixed(0), 'ms');
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[Decart] ICE state:', pc.iceConnectionState);
        };

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('[Decart] Adding video track:', videoTrack.label);
          pc.addTrack(videoTrack, stream);

          // RTT sampling
          const statsInterval = setInterval(async () => {
            if (pc.connectionState !== 'connected') {
              clearInterval(statsInterval);
              return;
            }
            const stats = await pc.getStats();
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const rtt = report.currentRoundTripTime * 1000;
                if (rtt > 0) {
                  latencyRef.current.samples.push({ t: performance.now(), rtt });
                  console.log('[Decart] RTT:', rtt.toFixed(1), 'ms');
                }
              }
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                console.log('[Decart] Outbound:', report.framesSent, 'frames,', (report.bytesSent / 1024).toFixed(0), 'KB');
              }
            });
          }, 2000);
        }

        pc.ontrack = (event) => {
          console.log('[Decart] Received remote track:', event.track.kind);
          if (videoRef.current && event.streams[0]) {
            const video = videoRef.current;
            video.srcObject = event.streams[0];
            console.log('[Decart] Video srcObject set');

            video.onloadedmetadata = () => {
              console.log('[Decart] Video metadata:', video.videoWidth, 'x', video.videoHeight);
              video.play().then(() => {
                console.log('[Decart] Video playing');
                // Clear the fallback timeout - Decart connected successfully
                if (connectionTimeoutRef.current) {
                  clearTimeout(connectionTimeoutRef.current);
                  connectionTimeoutRef.current = null;
                }
                setAiEnabled(true);
                setAiStatus('connected');
                setUsingLocalDiffusion(false);
              }).catch(e => console.error('[Decart] Video play error:', e));
            };

            video.onplaying = () => {
              const now = performance.now();
              if (latencyRef.current.streamStartTime && !latencyRef.current.firstFrameTime) {
                latencyRef.current.firstFrameTime = now;
                latencyRef.current.initialLatency = now - latencyRef.current.streamStartTime;
                console.log('[Decart] ========================================');
                console.log('[Decart] First AI frame received!');
                console.log('[Decart] Initial latency:', latencyRef.current.initialLatency.toFixed(0), 'ms');
                console.log('[Decart] ========================================');
              }
              setTimeout(() => setLoaded(true), 100);
            };
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            ws.send(JSON.stringify({
              type: 'ice-candidate',
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
              }
            }));
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('[Decart] Message:', data.type);
        if (data.type === 'answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
          console.log('[Decart] Sending prompt:', prompt.slice(0, 50) + '...');
          ws.send(JSON.stringify({ type: 'prompt', prompt, enhance_prompt: true }));
        } else if (data.type === 'ice-candidate' && pcRef.current && data.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else if (data.type === 'error') {
          console.error('[Decart] Error:', data.message || data);
        }
      };

      ws.onerror = (e) => {
        console.error('[Decart] WebSocket error:', e);
        setAiStatus('error');
        connectingRef.current = false;
      };

      ws.onclose = (e) => {
        console.log('[Decart] WebSocket closed, code:', e.code, 'reason:', e.reason);
        setAiEnabled(false);
        setAiStatus('disconnected');
        connectingRef.current = false;
        if (sessionStartTimeRef.current && !sessionEndedRef.current) {
          endSession();
        }
      };

    } catch (err) {
      console.error('Connection failed:', err);
      setAiStatus('error');
      connectingRef.current = false;
    }
  };

  const disableAI = () => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setAiEnabled(false);
    setAiStatus('disconnected');
  };
  
  // Disable local diffusion
  const disableLocalDiffusion = () => {
    if (localFrameIntervalRef.current) {
      clearInterval(localFrameIntervalRef.current);
      localFrameIntervalRef.current = null;
    }
    if (localWsRef.current) {
      localWsRef.current.close();
      localWsRef.current = null;
    }
    setUsingLocalDiffusion(false);
  };

  // Enable local StreamDiffusion fallback
  const enableLocalDiffusion = async () => {
    if (localWsRef.current) return;
    if (!rendererRef.current) return;
    
    console.log('[LocalDiffusion] ========================================');
    console.log('[LocalDiffusion] Connecting to local StreamDiffusion...');
    setAiStatus('connecting');
    connectingRef.current = true;
    
    try {
      const ws = new WebSocket(LOCAL_DIFFUSION_URL);
      localWsRef.current = ws;
      
      ws.binaryType = 'arraybuffer';
      
      ws.onopen = () => {
        console.log('[LocalDiffusion] WebSocket connected');
        
        // Send initial prompt
        ws.send(JSON.stringify({ type: 'prompt', prompt }));
        
        // Start sending frames
        const canvas = rendererRef.current.domElement;
        const outputCanvas = canvasOutputRef.current;
        
        if (outputCanvas) {
          outputCanvas.width = canvas.width;
          outputCanvas.height = canvas.height;
        }
        
        localFrameIntervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          
          // Capture canvas as JPEG blob and send
          canvas.toBlob((blob) => {
            if (blob && ws.readyState === WebSocket.OPEN) {
              blob.arrayBuffer().then(buffer => {
                ws.send(buffer);
              });
            }
          }, 'image/jpeg', 0.8);
        }, LOCAL_DIFFUSION_FRAME_INTERVAL);
        
        setAiEnabled(true);
        setAiStatus('connected');
        setUsingLocalDiffusion(true);
        connectingRef.current = false;
        
        // Mark as loaded since local diffusion is now active
        setTimeout(() => setLoaded(true), 100);
      };
      
      ws.onmessage = (event) => {
        // Handle binary frame response
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const outputCanvas = canvasOutputRef.current;
            if (outputCanvas) {
              const ctx = outputCanvas.getContext('2d');
              ctx.drawImage(img, 0, 0, outputCanvas.width, outputCanvas.height);
            }
            URL.revokeObjectURL(url);
          };
          img.src = url;
        } else {
          // Handle JSON messages
          try {
            const data = JSON.parse(event.data);
            console.log('[LocalDiffusion] Message:', data.type || 'unknown');
            if (data.type === 'ready') {
              console.log('[LocalDiffusion] Server ready, model:', data.model);
            } else if (data.type === 'error') {
              console.error('[LocalDiffusion] Error:', data.message);
            }
          } catch (e) {
            // Not JSON, might be other data
          }
        }
      };
      
      ws.onerror = (e) => {
        console.error('[LocalDiffusion] WebSocket error:', e);
        setAiStatus('error');
        connectingRef.current = false;
      };
      
      ws.onclose = (e) => {
        console.log('[LocalDiffusion] WebSocket closed, code:', e.code);
        disableLocalDiffusion();
        setAiEnabled(false);
        setAiStatus('disconnected');
        connectingRef.current = false;
      };
      
    } catch (err) {
      console.error('[LocalDiffusion] Connection failed:', err);
      setAiStatus('error');
      connectingRef.current = false;
    }
  };

  const logEvent = (type, data) => {
    sessionLogRef.current.push({ t: performance.now(), type, ...data });
  };

  const startRecording = () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      console.log('[Recording] No video stream to record');
      return;
    }

    try {
      const stream = video.srcObject;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 2500000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      sessionStartTimeRef.current = Date.now();
      onStatusChange('collecting');
      console.log('[Recording] ========================================');
      console.log('[Recording] Started recording session');
      console.log('[Recording] Session ID:', sessionIdRef.current);
      console.log('[Recording] ========================================');
    } catch (err) {
      console.error('[Recording] Failed to start:', err);
    }
  };

  const endSession = async () => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setSessionEnded(true);
    console.log('[Upload] ========================================');
    console.log('[Upload] Ending session...');

    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      await new Promise(r => setTimeout(r, 500));
    }

    const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const allEvents = sessionLogRef.current;
    const inputEvents = allEvents.filter(e => e.type !== 'camera');
    const cameraEvents = allEvents.filter(e => e.type === 'camera');
    const rttSamples = latencyRef.current.samples;
    const avgRtt = rttSamples.length > 0 ? rttSamples.reduce((sum, s) => sum + s.rtt, 0) / rttSamples.length : null;

    console.log('[Upload] Video size:', (videoBlob.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('[Upload] Input events:', inputEvents.length);
    console.log('[Upload] Camera frames:', cameraEvents.length);
    console.log('[Upload] RTT samples:', rttSamples.length);
    if (avgRtt) console.log('[Upload] Avg RTT:', avgRtt.toFixed(1), 'ms');

    const bundle = {
      sessionId: sessionIdRef.current,
      walletAddress,
      prompt,
      video: videoBlob,
      inputs: inputEvents,
      camera: cameraEvents,
      latency: {
        initialLatency: latencyRef.current.initialLatency,
        avgRtt,
        rttSamples,
      },
      scenario: scenarioState.activeScenario ? {
        id: scenarioState.activeScenario.id,
        name: scenarioState.activeScenario.name,
        result: scenarioState.hasWon ? 'won' : scenarioState.hasLost ? 'lost' : 'incomplete',
        collisionCount: scenarioState.collisionCount || 0,
      } : null,
      metadata: {
        duration: Date.now() - (sessionStartTimeRef.current || Date.now()),
        eventCount: allEvents.length,
        startTime: sessionStartTimeRef.current,
        endTime: Date.now(),
      },
    };

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    onTimerUpdate(null);
    onStatusChange('uploading');
    console.log('[Upload] Uploading to S3...');

    const result = await uploadSession(bundle);
    if (result.success) {
      console.log('[Upload] ========================================');
      console.log('[Upload] SUCCESS!');
      console.log('[Upload] Keys:', result.keys);
      console.log('[Upload] ========================================');
    } else {
      console.error('[Upload] FAILED:', result.error);
    }

    onStatusChange('thankyou');
    setTimeout(() => onStatusChange('connected'), 1500);
  };

  const startNewSession = () => {
    sessionEndedRef.current = false;
    setSessionEnded(false);
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionLogRef.current = [];
    recordedChunksRef.current = [];
    latencyRef.current.samples = [];

    startRecording();

    const endTime = Date.now() + SESSION_DURATION_MS;
    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      onTimerUpdate(Math.ceil(remaining / 1000));
      if (remaining <= 0) clearInterval(timerIntervalRef.current);
    }, 100);

    sessionTimerRef.current = setTimeout(() => {
      clearInterval(timerIntervalRef.current);
      onTimerUpdate(0);
      endSession();
    }, SESSION_DURATION_MS);
  };

  const reconnect = () => {
    disableAI();
    disableLocalDiffusion();
    setTimeout(() => enableAI(), 500);
  };

  useImperativeHandle(ref, () => ({
    stopEarly: () => {
      if (!sessionEndedRef.current && sessionStartTimeRef.current) endSession();
    },
    startNewSession,
    reconnect
  }));

  useEffect(() => {
    if (loaded) {
      wrapperRef.current?.focus();
      onLoaded();
      // Auto-start a random scenario when game loads
      if (scenarioEngineInitRef.current && !activeScenario) {
        setTimeout(handleStartRandomScenario, 500);
      }
    }
  }, [loaded, onLoaded, activeScenario, handleStartRandomScenario]);


  useEffect(() => {
    if (loaded && !sessionEnded) {
      startRecording();

      const endTime = Date.now() + SESSION_DURATION_MS;
      timerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        onTimerUpdate(Math.ceil(remaining / 1000));
        if (remaining <= 0) clearInterval(timerIntervalRef.current);
      }, 100);

      sessionTimerRef.current = setTimeout(() => {
        clearInterval(timerIntervalRef.current);
        onTimerUpdate(0);
        endSession();
      }, SESSION_DURATION_MS);
    }

    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [loaded]);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      disableAI();
      disableLocalDiffusion();
    };
  }, []);

  useEffect(() => {
    let status = 'disconnected';
    if (aiStatus === 'connecting') status = 'connecting';
    else if (aiEnabled) status = 'connected';
    onStatusChange(status);
  }, [aiStatus, aiEnabled, onStatusChange]);

  useEffect(() => {
    // Update prompt on Decart connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'prompt', prompt, enhance_prompt: true }));
    }
    // Update prompt on local diffusion connection
    if (localWsRef.current && localWsRef.current.readyState === WebSocket.OPEN) {
      localWsRef.current.send(JSON.stringify({ type: 'prompt', prompt }));
    }
  }, [prompt]);

  // Main Three.js setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log('[Three.js] ========================================');
    console.log('[Three.js] Initializing scene...');

    const state = { keys: {}, carSpeed: 0, yaw: 0 };

    // Scene with simple sky
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB');
    scene.fog = new THREE.FogExp2('#87CEEB', 0.002);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, 1280 / 720, 0.1, 2000);
    camera.position.set(0, 5, 50);
    cameraRef.current = camera;
    console.log('[Three.js] Camera at:', camera.position.x, camera.position.y, camera.position.z);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1280, 720);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.objectFit = 'cover';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    console.log('[Three.js] Renderer:', renderer.domElement.width, 'x', renderer.domElement.height);

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(50, 100, 50);
    scene.add(sun);

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000),
      new THREE.MeshStandardMaterial({ color: '#333333' })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(2000, 100, 0x666666, 0x444444);
    grid.position.y = 0.01;
    scene.add(grid);

    // Initialize scenario engine with scene/camera references
    initScenarioEngine(scene, camera, (updates) => {
      if (updates.yaw !== undefined) state.yaw = updates.yaw;
      if (updates.carSpeed !== undefined) state.carSpeed = updates.carSpeed;
    });
    scenarioEngineInitRef.current = true;

    // Listen for scenario state changes
    setOnScenarioStateChange(() => {
      if (scenarioState.hasWon) {
        setScenarioStatus('won');
      } else if (scenarioState.hasLost) {
        setScenarioStatus('lost');
      } else if (scenarioState.isPlaying) {
        setScenarioStatus('playing');
      } else {
        setScenarioStatus('idle');
      }
    });

    // Load city.json buildings (individual meshes for correct colors)
    fetch('/city.json')
      .then(res => res.json())
      .then(data => {
        console.log('[City] ========================================');
        console.log('[City] Loading city.json...');
        console.log('[City] Buildings:', data.buildings?.length || 0);
        console.log('[City] Streets:', data.streets?.length || 0);

        const buildings = data.buildings || [];
        let loaded = 0, failed = 0;

        for (const b of buildings) {
          try {
            const shape = new THREE.Shape();
            shape.moveTo(b.vertices[0][0], -b.vertices[0][1]);
            for (let i = 1; i < b.vertices.length; i++) {
              shape.lineTo(b.vertices[i][0], -b.vertices[i][1]);
            }
            shape.closePath();

            const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
            geo.rotateX(-Math.PI / 2);

            const mat = new THREE.MeshStandardMaterial({ color: b.color || '#888888' });
            const mesh = new THREE.Mesh(geo, mat);
            scene.add(mesh);
            loaded++;
          } catch (e) {
            failed++;
          }
        }

        console.log('[City] Loaded:', loaded, 'buildings');
        if (failed > 0) console.log('[City] Failed:', failed, 'buildings');

        // Render streets (road surfaces + center lines)
        const streets = data.streets || [];
        if (streets.length > 0) {
          const roadMaterial = new THREE.MeshStandardMaterial({ color: '#2a2a2a' });
          const lineMaterial = new THREE.MeshStandardMaterial({ color: '#ffff00' });

          for (const street of streets) {
            try {
              if (street.axis === 'z') {
                // N-S street
                const length = Math.abs(street.end - street.start);
                const roadGeo = new THREE.PlaneGeometry(street.width, length);
                roadGeo.rotateX(-Math.PI / 2);
                const roadMesh = new THREE.Mesh(roadGeo, roadMaterial);
                roadMesh.position.set(street.center, 0.02, (street.start + street.end) / 2);
                scene.add(roadMesh);

                // Dashed center line
                for (let z = street.start; z < street.end; z += 5) {
                  const lineGeo = new THREE.PlaneGeometry(0.3, 3);
                  lineGeo.rotateX(-Math.PI / 2);
                  const lineMesh = new THREE.Mesh(lineGeo, lineMaterial);
                  lineMesh.position.set(street.center, 0.03, z + 1.5);
                  scene.add(lineMesh);
                }
              } else {
                // E-W street
                const length = Math.abs(street.end - street.start);
                const roadGeo = new THREE.PlaneGeometry(length, street.width);
                roadGeo.rotateX(-Math.PI / 2);
                const roadMesh = new THREE.Mesh(roadGeo, roadMaterial);
                roadMesh.position.set((street.start + street.end) / 2, 0.02, street.center);
                scene.add(roadMesh);

                // Dashed center line
                for (let x = street.start; x < street.end; x += 5) {
                  const lineGeo = new THREE.PlaneGeometry(3, 0.3);
                  lineGeo.rotateX(-Math.PI / 2);
                  const lineMesh = new THREE.Mesh(lineGeo, lineMaterial);
                  lineMesh.position.set(x + 1.5, 0.03, street.center);
                  scene.add(lineMesh);
                }
              }
            } catch (e) {
              // skip bad street
            }
          }
          console.log('[City] Rendered', streets.length, 'streets');
        }

        console.log('[City] ========================================');
      })
      .catch(err => console.error('[City] Failed:', err));

    console.log('[Three.js] Scene ready');
    console.log('[Three.js] ========================================');

    // Enable AI after scene is ready
    setTimeout(() => {
      if (!wsRef.current) {
        console.log('[Three.js] Triggering Decart connection...');
        enableAI();
      }
    }, 2000);

    // Controls
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const direction = new THREE.Vector3();
    const maxSpeed = 0.8, accel = 0.01, friction = 0.003, steerSpeed = 0.03;
    const SPEED_TO_MS = 37.5; // Convert carSpeed (0-0.8) to m/s (0-30)

    const getCommand = (keys) => {
      if (keys['a']) return 1;        // left
      if (keys['d']) return 2;        // right
      if (keys['w']) return 3;        // straight
      return 4;                       // lane follow (idle)
    };

    const onMouseMove = (e) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      state.yaw -= e.movementX * 0.002;
      euler.set(0, state.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      logEvent('mouse', { dx: e.movementX, dy: e.movementY });
    };

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const key = e.key.toLowerCase();
      // Toggle debug mode with 'p' - also force-starts if not loaded
      if (key === 'p') {
        setDebugMode(prev => {
          const newMode = !prev;
          if (newMode && !loaded) {
            console.log('[Debug] Force-starting without Decart...');
            setLoaded(true);
          }
          return newMode;
        });
        return;
      }
      if (!state.keys[key]) {
        state.keys[key] = true;
        logEvent('keydown', { key });
      }
    };

    const onKeyUp = (e) => {
      const key = e.key.toLowerCase();
      state.keys[key] = false;
      logEvent('keyup', { key });
    };

    const onClick = () => renderer.domElement.requestPointerLock();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('click', onClick);

    // Animation
    let animationId;
    let frameCount = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Movement
      if (state.keys['w']) state.carSpeed += accel;
      if (state.keys['s']) state.carSpeed -= 0.02;
      state.carSpeed = Math.max(0, Math.min(state.carSpeed - friction, maxSpeed));

      const steerFactor = state.carSpeed / maxSpeed;
      if (state.keys['a']) state.yaw += steerSpeed * steerFactor;
      if (state.keys['d']) state.yaw -= steerSpeed * steerFactor;

      euler.set(0, state.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      camera.position.add(direction.multiplyScalar(state.carSpeed));

      // Update scenario entities and check for collisions/win conditions
      const scenarioResult = updateScenario();
      if (scenarioResult.won) {
        setScenarioStatus('won');
      } else if (scenarioResult.lost) {
        setScenarioStatus('lost');
      }

      // Update shared state ref for external access
      gameStateRef.current = { yaw: state.yaw, carSpeed: state.carSpeed };

      // Grid follows camera
      grid.position.x = Math.round(camera.position.x / 20) * 20;
      grid.position.z = Math.round(camera.position.z / 20) * 20;

      composer.render();

      // Log camera every 10 frames (~6fps)
      frameCount++;
      if (frameCount % 10 === 0) {
        const steerFactor2 = state.carSpeed / maxSpeed;
        logEvent('camera', {
          pos: [camera.position.x, camera.position.y, camera.position.z],
          yaw: state.yaw,
          speed: state.carSpeed * SPEED_TO_MS,
          throttle: state.keys['w'] ? 1 : 0,
          brake: state.keys['s'] ? 1 : 0,
          steer: state.keys['a'] ? -steerSpeed * steerFactor2 : (state.keys['d'] ? steerSpeed * steerFactor2 : 0),
          command: getCommand(state.keys),
        });
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', outline: 'none' }}
      onClick={() => wrapperRef.current?.focus()}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: (aiEnabled && !debugMode && !usingLocalDiffusion) ? 100 : -1,
          background: '#000',
        }}
      />
      
      {/* Canvas for local StreamDiffusion output */}
      <canvas
        ref={canvasOutputRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: (aiEnabled && !debugMode && usingLocalDiffusion) ? 100 : -1,
          background: '#000',
        }}
      />

      {/* Debug panel - press 'p' to toggle */}
      {debugMode && (
        <div className="debug-panel">
          <div style={{ marginBottom: 4, color: '#888' }}>Debug Mode (P to hide)</div>
          <div>AI: {aiEnabled ? 'enabled' : 'disabled'}</div>
          <div>Status: {aiStatus}</div>
          <div>Backend: {usingLocalDiffusion ? 'Local StreamDiffusion' : 'Decart'}</div>
          <div style={{ marginTop: 8, borderTop: '1px solid #444', paddingTop: 8 }}>
            <div>Scenario: {activeScenario?.name || 'none'}</div>
            <div>Result: <span style={{ color: scenarioStatus === 'won' ? '#4caf50' : scenarioStatus === 'lost' ? '#f44336' : '#fff' }}>{scenarioStatus}</span></div>
            <div style={{ marginTop: 8 }}>
              <select
                style={{
                  background: '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  padding: '4px 8px',
                  fontSize: 11,
                  width: '100%',
                  marginBottom: 6,
                }}
                value={activeScenario?.id || ''}
                onChange={(e) => {
                  if (e.target.value) handleStartScenario(e.target.value);
                }}
              >
                <option value="">-- Select Scenario --</option>
                {sampleScenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Scenario status overlay (win/lose) - only in debug mode */}
      {debugMode && (scenarioStatus === 'won' || scenarioStatus === 'lost') && (
        <div className={`scenario-status-overlay ${scenarioStatus}`}>
          {scenarioStatus === 'won' ? 'SCENARIO COMPLETE' : 'COLLISION DETECTED'}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: '#000',
          zIndex: 200,
          opacity: (loaded || debugMode) ? 0 : 1,
          transition: 'opacity 0.8s ease-out',
          pointerEvents: (loaded || debugMode) ? 'none' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!loaded && !debugMode && (
          <Spinner style={{ width: 32, height: 32, color: '#fff', opacity: 0, animation: 'fadeIn 1s ease-out forwards' }} />
        )}
      </div>
    </div>
  );
});

export default GameCanvas;
