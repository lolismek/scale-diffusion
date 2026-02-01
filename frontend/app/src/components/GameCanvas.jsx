import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Spinner } from './Spinner';
import { uploadSession } from '../utils/upload';

const SESSION_DURATION_MS = 60 * 1000; // 1 minute

const GameCanvas = forwardRef(({ className = '', apiKey = '', prompt = 'New York City realistic buildings and streets', isFullscreen = false, onLoaded = () => {}, onStatusChange = () => {}, onTimerUpdate = () => {}, walletAddress = '' }, ref) => {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const connectingRef = useRef(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState('disconnected');
  const [loaded, setLoaded] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  // Simple logging refs
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
    samples: [],           // Array of {t, rtt} measurements
    streamStartTime: null, // When we started sending frames
    firstFrameTime: null,  // When we received first AI frame
    initialLatency: null,  // firstFrameTime - streamStartTime
  });

  // Enable AI texture via WebSocket
  const enableAI = async () => {
    if (connectingRef.current || wsRef.current) {
      console.log('Already connecting or connected, skipping');
      return;
    }

    if (!rendererRef.current) {
      console.log('Renderer not ready');
      return;
    }

    connectingRef.current = true;
    setAiStatus('connecting');
    console.log('Connecting to Decart via WebSocket...');

    try {
      const canvas = rendererRef.current.domElement;
      console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);

      const stream = canvas.captureStream(30);
      const videoTrack = stream.getVideoTracks()[0];
      console.log('Outgoing stream:', {
        tracks: stream.getTracks().length,
        videoTrack: videoTrack?.label,
        settings: videoTrack?.getSettings()
      });

      const ws = new WebSocket('wss://api3.decart.ai/v1/stream-trial?model=mirage');
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('WebSocket connected');

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.onconnectionstatechange = () => {
          console.log('PC connection state:', pc.connectionState);
          // Mark when we start sending frames
          if (pc.connectionState === 'connected' && !latencyRef.current.streamStartTime) {
            latencyRef.current.streamStartTime = performance.now();
            console.log('Stream started at:', latencyRef.current.streamStartTime);
          }
        };
        pc.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', pc.iceConnectionState);
        };

        // Add canvas stream tracks
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Adding video track:', videoTrack.readyState, videoTrack.enabled, videoTrack.muted);
          const sender = pc.addTrack(videoTrack, stream);

          // Log stats and measure RTT periodically
          const statsInterval = setInterval(async () => {
            if (pc.connectionState !== 'connected') {
              clearInterval(statsInterval);
              return;
            }
            const stats = await pc.getStats();
            stats.forEach(report => {
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                console.log('Outbound video:', {
                  framesSent: report.framesSent,
                  bytesSent: report.bytesSent,
                  framesPerSecond: report.framesPerSecond
                });
              }
              // Capture RTT from candidate-pair stats
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const rtt = report.currentRoundTripTime * 1000; // Convert to ms
                if (rtt > 0) {
                  latencyRef.current.samples.push({
                    t: performance.now(),
                    rtt: rtt,
                  });
                  console.log('RTT sample:', rtt.toFixed(1), 'ms');
                }
              }
            });
          }, 2000);
        }

        // Handle incoming video stream
        pc.ontrack = (event) => {
          console.log('Received remote track', event.track.kind, event.streams);
          if (videoRef.current && event.streams[0]) {
            const video = videoRef.current;
            video.srcObject = event.streams[0];

            // Wait for metadata to load before playing
            video.onloadedmetadata = () => {
              console.log('Video metadata loaded:', video.videoWidth, 'x', video.videoHeight);
              video.play().then(() => {
                console.log('Video playing');
                setAiEnabled(true);
                setAiStatus('connected');
              }).catch(e => console.error('Video play error:', e));
            };

            // First frame received - reveal the game and measure initial latency
            video.onplaying = () => {
              const now = performance.now();
              if (latencyRef.current.streamStartTime && !latencyRef.current.firstFrameTime) {
                latencyRef.current.firstFrameTime = now;
                latencyRef.current.initialLatency = now - latencyRef.current.streamStartTime;
                console.log('First AI frame received! Initial latency:', latencyRef.current.initialLatency.toFixed(0), 'ms');
              }
              console.log('First frame received, revealing game');
              setTimeout(() => setLoaded(true), 100);
            };

            console.log('Video srcObject set, tracks:', event.streams[0].getTracks().map(t => t.kind));
          }
        };

        // Handle ICE candidates
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

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('WS message:', data.type, data);

        if (data.type === 'answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
          // Send initial prompt after connection is established
          ws.send(JSON.stringify({ type: 'prompt', prompt, enhance_prompt: true }));
          console.log('Sent initial prompt:', prompt);
        } else if (data.type === 'ice-candidate' && pcRef.current && data.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else if (data.type === 'error') {
          console.error('Decart error:', data.message || data);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        console.error('WS readyState:', ws.readyState);
        setAiStatus('error');
        connectingRef.current = false;
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed, code:', event.code, 'reason:', event.reason);
        setAiEnabled(false);
        setAiStatus('disconnected');
        connectingRef.current = false;
        // If session was active and not ended, upload what we have
        if (sessionStartTimeRef.current && !sessionEndedRef.current) {
          console.log('WebSocket disconnected early - uploading collected data');
          endSession();
        }
      };

    } catch (err) {
      console.error('Decart connection failed:', err);
      setAiStatus('error');
      connectingRef.current = false;
    }
  };

  // Disable AI texture
  const disableAI = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setAiEnabled(false);
    setAiStatus('disconnected');
  };

  // Simple logging - just push to array
  const logEvent = (type, data) => {
    sessionLogRef.current.push({
      t: performance.now(),
      type,
      ...data,
    });
  };

  // Start recording the AI video stream
  const startRecording = () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) {
      console.log('No video stream to record');
      return;
    }

    try {
      const stream = video.srcObject;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 2500000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, chunks:', recordedChunksRef.current.length);
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      sessionStartTimeRef.current = Date.now();
      onStatusChange('collecting');
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  // End session: stop recording, bundle data, upload
  const endSession = async () => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    setSessionEnded(true);
    console.log('Ending session...');

    // Stop the timer if still running
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Wait a bit for final chunks
      await new Promise(r => setTimeout(r, 500));
    }

    // Create video blob
    const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    console.log('Video blob size:', videoBlob.size);

    // Separate camera events from input events
    const allEvents = sessionLogRef.current;
    const inputEvents = allEvents.filter(e => e.type !== 'camera');
    const cameraEvents = allEvents.filter(e => e.type === 'camera');

    // Calculate average RTT from samples
    const rttSamples = latencyRef.current.samples;
    const avgRtt = rttSamples.length > 0
      ? rttSamples.reduce((sum, s) => sum + s.rtt, 0) / rttSamples.length
      : null;

    // Bundle and upload
    const bundle = {
      sessionId: sessionIdRef.current,
      walletAddress,
      prompt,
      video: videoBlob,
      inputs: inputEvents,
      camera: cameraEvents,
      latency: {
        initialLatency: latencyRef.current.initialLatency,  // Time from stream start to first AI frame
        avgRtt: avgRtt,                                      // Average round-trip time during session
        rttSamples: rttSamples,                              // All RTT measurements with timestamps
      },
      metadata: {
        duration: Date.now() - (sessionStartTimeRef.current || Date.now()),
        eventCount: allEvents.length,
        startTime: sessionStartTimeRef.current,
        endTime: Date.now(),
      },
    };

    console.log('Latency data:', {
      initialLatency: latencyRef.current.initialLatency?.toFixed(0) + 'ms',
      avgRtt: avgRtt?.toFixed(1) + 'ms',
      sampleCount: rttSamples.length,
    });

    console.log('Uploading session bundle...', {
      sessionId: bundle.sessionId,
      videoSize: videoBlob.size,
      inputCount: inputEvents.length,
      cameraCount: cameraEvents.length,
    });

    // Clear timer display
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    onTimerUpdate(null);

    // Show uploading
    onStatusChange('uploading');

    // Upload
    const result = await uploadSession(bundle);
    if (result.success) {
      console.log('Session uploaded successfully!', result.keys);
    } else {
      console.error('Session upload failed:', result.error);
    }

    // Show thank you, then connected
    onStatusChange('thankyou');
    setTimeout(() => {
      onStatusChange('connected');
    }, 1500);
  };

  // Start a new recording session
  const startNewSession = () => {
    // Reset session state
    sessionEndedRef.current = false;
    setSessionEnded(false);
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionLogRef.current = [];
    recordedChunksRef.current = [];
    // Reset latency tracking (keep initial values, just clear samples)
    latencyRef.current.samples = [];

    console.log('Starting new session:', sessionIdRef.current);
    startRecording();

    const endTime = Date.now() + SESSION_DURATION_MS;

    // Update countdown every 100ms
    timerIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const secs = Math.ceil(remaining / 1000);
      onTimerUpdate(secs);
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
      }
    }, 100);

    sessionTimerRef.current = setTimeout(() => {
      console.log('Session timer complete (1 min) - ending session');
      clearInterval(timerIntervalRef.current);
      onTimerUpdate(0);
      endSession();
    }, SESSION_DURATION_MS);
  };

  // Attempt to reconnect to Decart
  const reconnect = () => {
    console.log('Attempting to reconnect...');
    disableAI();
    setTimeout(() => {
      enableAI();
    }, 500);
  };

  // Expose stopEarly, startNewSession, and reconnect to parent
  useImperativeHandle(ref, () => ({
    stopEarly: () => {
      if (!sessionEndedRef.current && sessionStartTimeRef.current) {
        console.log('Stopping session early...');
        endSession();
      }
    },
    startNewSession,
    reconnect
  }));

  // Auto-focus wrapper when loaded
  useEffect(() => {
    if (loaded) {
      wrapperRef.current?.focus();
      onLoaded();
    }
  }, [loaded, onLoaded]);

  // Start recording and 1-min timer when loaded
  useEffect(() => {
    if (loaded && !sessionEnded) {
      console.log('Game loaded - starting recording and 1-min session timer');
      startRecording();

      const endTime = Date.now() + SESSION_DURATION_MS;

      // Update countdown every second
      timerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, endTime - Date.now());
        const secs = Math.ceil(remaining / 1000);
        onTimerUpdate(secs);
        if (remaining <= 0) {
          clearInterval(timerIntervalRef.current);
        }
      }, 100);

      sessionTimerRef.current = setTimeout(() => {
        console.log('Session timer complete (1 min) - ending session');
        clearInterval(timerIntervalRef.current);
        onTimerUpdate(0);
        endSession();
      }, SESSION_DURATION_MS);
    }

    return () => {
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [loaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      disableAI();
    };
  }, []);

  // Notify parent of status changes
  useEffect(() => {
    // Status: 'connecting' | 'connected' | 'disconnected'
    let status = 'disconnected';
    if (aiStatus === 'connecting') status = 'connecting';
    else if (aiEnabled) status = 'connected';
    onStatusChange(status);
  }, [aiStatus, aiEnabled, onStatusChange]);

  // Update prompt when it changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending prompt update:', prompt);
      wsRef.current.send(JSON.stringify({ type: 'prompt', prompt, enhance_prompt: true }));
    }
  }, [prompt]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // State
    const state = {
      keys: {},
      driveMode: true,
      carSpeed: 0,
      yaw: 0,
      pitch: 0,
    };

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB');
    scene.fog = new THREE.Fog('#87CEEB', 100, 1500);

    // Camera - 16:9 aspect for Decart
    const camera = new THREE.PerspectiveCamera(
      75,
      1280 / 720,
      0.1,
      5000
    );
    camera.position.set(0, 5, 50);

    // Renderer - force 1280x720 for Decart compatibility
    const DECART_WIDTH = 1280;
    const DECART_HEIGHT = 720;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(DECART_WIDTH, DECART_HEIGHT);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.objectFit = 'cover';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Trigger AI enable after city loads and a few frames render
    // Delay longer to ensure canvas has real content
    setTimeout(() => {
      if (!wsRef.current) {
        console.log('Renderer ready, enabling Decart AI...');
        enableAI();
      }
    }, 3000);

    // Lighting
    scene.add(new THREE.HemisphereLight(0xc8d8e8, 0x7a6e5a, 0.9));
    const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
    dirLight.position.set(30, 50, 20);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xd0e0f0, 0.4);
    fillLight.position.set(-30, 30, -20);
    scene.add(fillLight);

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(DECART_WIDTH, DECART_HEIGHT),
      0.3, 0.4, 0.85
    );
    composer.addPass(bloomPass);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10000, 10000),
      new THREE.MeshStandardMaterial({ color: '#3a3a3a' })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Load city
    const addBuilding = (vertices, height, color) => {
      const shape = new THREE.Shape();
      shape.moveTo(vertices[0][0], -vertices[0][1]);
      for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i][0], -vertices[i][1]);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);

      const material = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
    };

    fetch('/city.json')
      .then(res => res.json())
      .then(data => {
        if (data.buildings) {
          data.buildings.forEach(b => {
            addBuilding(b.vertices, b.height, b.color);
          });
        }
      })
      .catch(err => console.error('Failed to load city:', err));

    // Controls
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const direction = new THREE.Vector3();

    const maxSpeed = 0.8;
    const accel = 0.01;
    const brakeForce = 0.02;
    const friction = 0.003;
    const steerSpeed = 0.03;

    const onMouseMove = (e) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      state.yaw -= e.movementX * 0.002;
      euler.set(0, state.yaw, 0);
      camera.quaternion.setFromEuler(euler);
      // Log mouse movement
      logEvent('mouse', { dx: e.movementX, dy: e.movementY });
    };

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const key = e.key.toLowerCase();
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

    const onClick = () => {
      renderer.domElement.requestPointerLock();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('click', onClick);

    // Movement update - WASD works anywhere, mouse look needs pointer lock
    const updateMovement = () => {
      if (state.keys['w']) state.carSpeed += accel;
      if (state.keys['s']) state.carSpeed -= brakeForce;
      state.carSpeed -= friction;
      state.carSpeed = Math.max(0, Math.min(state.carSpeed, maxSpeed));

      const steerFactor = state.carSpeed / maxSpeed;
      if (state.keys['a']) state.yaw += steerSpeed * steerFactor;
      if (state.keys['d']) state.yaw -= steerSpeed * steerFactor;

      euler.set(0, state.yaw, 0);
      camera.quaternion.setFromEuler(euler);

      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      camera.position.add(direction.multiplyScalar(state.carSpeed));
    };

    // Store camera reference for logging
    cameraRef.current = camera;

    // Store camera ref for external access
    cameraRef.current = camera;

    // Animation loop
    let animationId;
    let frameCount = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      updateMovement();
      composer.render();

      // Log camera state every 10th frame (~6fps logging)
      frameCount++;
      if (frameCount % 10 === 0) {
        logEvent('camera', {
          pos: [camera.position.x, camera.position.y, camera.position.z],
          yaw: state.yaw,
          speed: state.carSpeed,
        });
      }
    };
    animate();

    // Resize handler - keep canvas at 1280x720 for Decart, CSS handles display scaling
    const onResize = () => {
      // Fixed resolution for Decart - no resize needed
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
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
      {/* Three.js canvas (renders but hidden until AI ready) */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* AI-processed video overlay */}
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
          zIndex: aiEnabled ? 100 : -1,
          background: '#000',
        }}
      />

      {/* Loading overlay - black with spinner until first frame */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: '#000',
          zIndex: 200,
          opacity: loaded ? 0 : 1,
          transition: 'opacity 0.8s ease-out',
          pointerEvents: loaded ? 'none' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!loaded && (
          <Spinner style={{ width: 32, height: 32, color: '#fff', opacity: 0, animation: 'fadeIn 1s ease-out forwards' }} />
        )}
      </div>

    </div>
  );
});

export default GameCanvas;
