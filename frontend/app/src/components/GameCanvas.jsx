import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const GameCanvas = ({ className = '', apiKey = '', prompt = 'New York City realistic buildings and streets', isFullscreen = false, onLoaded = () => {} }) => {
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
        };
        pc.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', pc.iceConnectionState);
        };

        // Add canvas stream tracks
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Adding video track:', videoTrack.readyState, videoTrack.enabled, videoTrack.muted);
          const sender = pc.addTrack(videoTrack, stream);

          // Log stats periodically to verify frames are being sent
          const statsInterval = setInterval(async () => {
            if (pc.connectionState !== 'connected') {
              clearInterval(statsInterval);
              return;
            }
            const stats = await sender.getStats();
            stats.forEach(report => {
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                console.log('Outbound video:', {
                  framesSent: report.framesSent,
                  bytesSent: report.bytesSent,
                  framesPerSecond: report.framesPerSecond
                });
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

            // First frame received - reveal the game
            video.onplaying = () => {
              console.log('First frame received, revealing game');
              // Small delay to ensure frame is actually rendered
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

  // Auto-focus wrapper when loaded to enable WASD
  useEffect(() => {
    if (loaded) {
      wrapperRef.current?.focus();
      onLoaded();
    }
  }, [loaded, onLoaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disableAI();
    };
  }, []);

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
    };

    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      state.keys[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e) => {
      state.keys[e.key.toLowerCase()] = false;
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

    // Animation loop
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      updateMovement();
      composer.render();
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
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite, fadeIn 0.5s ease-out',
            }}
          />
        )}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
};

export default GameCanvas;
