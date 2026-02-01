import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const GameCanvas = ({ className = '', apiKey = '', prompt = 'New York City realistic buildings and streets' }) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const connectingRef = useRef(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState('disconnected');

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
      const stream = rendererRef.current.domElement.captureStream(30);
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
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        // Handle incoming video stream
        pc.ontrack = (event) => {
          console.log('Received remote track', event.track.kind, event.streams);
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            videoRef.current.play().then(() => {
              console.log('Video playing, dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
            }).catch(e => console.log('Video play error:', e));
            setAiEnabled(true);
            setAiStatus('connected');
            console.log('Video srcObject set, tracks:', event.streams[0].getTracks().map(t => t.kind));
          }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
          }
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('WS message:', data.type);

        if (data.type === 'answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
        } else if (data.type === 'ice' && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
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
      wsRef.current.send(JSON.stringify({ type: 'prompt', text: prompt }));
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

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      5000
    );
    camera.position.set(0, 5, 50);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Trigger AI enable after renderer is ready
    setTimeout(() => {
      if (!wsRef.current) {
        console.log('Renderer ready, enabling Decart AI...');
        enableAI();
      }
    }, 1000);

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
      new THREE.Vector2(container.clientWidth, container.clientHeight),
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

    // Movement update
    const updateMovement = () => {
      if (document.pointerLockElement !== renderer.domElement) return;

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

    // Resize handler
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
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
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
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
          zIndex: 100,
          opacity: aiEnabled ? 1 : 0,
          background: '#000',
        }}
      />
    </div>
  );
};

export default GameCanvas;
