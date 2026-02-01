import { useState, useEffect, useRef } from 'react'
import Video2Ascii from 'video2ascii'
import ShapeBlur from './components/ShapeBlur'
import GameCanvas from './components/GameCanvas'
import './App.css'

// Validate Solana address format (base58, 32-44 chars)
function isValidSolanaAddress(address) {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  return base58Regex.test(address)
}

function truncateAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

// ASCII logo
const ASCII_LOGO = `

      .------.
    .-..    ..--.
   .:-        ..:=.
   .-..        ..=.
    .-.         ..- 
      =.       -.=
         '  -=      `

// System info lines
const INFO_LINES = [
  { label: '', value: 'anon@scale-diffusion' },
  { label: '', value: 'scale-diffusion v0.1' },
  { label: '', value: 'browser runtime' },
  { label: '', value: 'webgl 2.0' },
  { label: '', value: 'scale-term' },
  { label: '', value: 'awaiting wallet' },
]

function App() {
  const [walletAddress, setWalletAddress] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showFastfetch, setShowFastfetch] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitLines, setSubmitLines] = useState([])
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('New York City realistic buildings, streets, and urban texture')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [gameLoaded, setGameLoaded] = useState(false)
  const inputRef = useRef(null)

  // Show fastfetch then input (after fastfetch finishes loading)
  useEffect(() => {
    setTimeout(() => setShowFastfetch(true), 100)
    setTimeout(() => setShowInput(true), 1200)
  }, [])

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

  // Exit fullscreen when pointer lock is released (Escape key)
  useEffect(() => {
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange)
  }, [isFullscreen])

  // Mark animation as done after initial fade-in
  useEffect(() => {
    if (isConnected && !hasAnimated) {
      setTimeout(() => setHasAnimated(true), 1000)
    }
  }, [isConnected, hasAnimated])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = inputValue.trim()

    if (!trimmed) {
      setError('please enter a wallet address')
      return
    }

    if (!isValidSolanaAddress(trimmed)) {
      setError('invalid solana address format')
      return
    }

    setError('')
    setWalletAddress(trimmed)
    setIsSubmitting(true)
    setIsFadingOut(true) // Start fading immediately

    // Terminal submission animation - spam lots of lines while fading
    const addr = truncateAddress(trimmed)
    const lines = [
      `validating ${addr}`,
      'checking solana mainnet-beta...',
      'rpc: https://api.mainnet-beta.solana.com',
      'connection established',
      'fetching account info...',
      `pubkey: ${trimmed.slice(0, 20)}...`,
      'lamports: 0',
      'owner: 11111111111111111111111111111111',
      'executable: false',
      'rent_epoch: 18446744073709551615',
      'verifying wallet signature...',
      'sig: ok',
      'initializing webrtc session...',
      'stun: stun.l.google.com:19302',
      'gathering ice candidates...',
      'candidate: typ host',
      'candidate: typ srflx',
      'sdp offer created',
      'connecting to wss://api3.decart.ai',
      'websocket: open',
      'sending offer...',
      'received answer',
      'ice connection: checking',
      'ice connection: connected',
      'peer connection: connected',
      'starting canvas capture @ 30fps',
      'video track added',
      'remote track received',
      'stream: active',
      'session ready',
    ]

    let i = 0
    const spamInterval = setInterval(() => {
      if (i < lines.length) {
        setSubmitLines(prev => [...prev, lines[i]])
        i++
      } else {
        clearInterval(spamInterval)
      }
    }, 40)

    // Morph while lines are still spamming
    setTimeout(() => {
      clearInterval(spamInterval)
      setShowInput(false)
      setShowFastfetch(false)
      setIsSubmitting(false)
      setIsTransitioning(true)
      setTimeout(() => {
        setIsConnected(true)
      }, 800)
    }, 800)
  }

  return (
    <div className="container">
      {/* Background layers - always visible, terminal covers it */}
      <div className={`background-layers ${isFullscreen ? 'hidden' : ''}`}>
        <div className="fluid-overlay">
          <iframe
            src="/ribbons/index.html"
            title="Ribbon Simulation"
            style={{ backgroundColor: 'transparent', pointerEvents: 'none' }}
          />
        </div>

        <div className="ascii-bg">
          <Video2Ascii
            src="/ascii-video.mp4"
            numColumns={150}
            charset="detailed"
            colored={true}
            brightness={1.0}
            highlight={0}
            autoPlay={true}
            isPlaying={true}
            enableMouse={false}
            loop={true}
          />
        </div>
      </div>

      {/* Terminal - morphs into TV, stays rendered to prevent flicker */}
      <div className={`terminal ${isTransitioning ? 'morphing' : ''} ${isConnected ? 'hidden' : ''}`}>
          <div className={`terminal-content ${isFadingOut ? 'fading-out' : ''}`}>
            {showFastfetch && (
              <div className="fastfetch">
                <pre className="ascii-logo stagger-line" style={{'--line-index': 0}}>{ASCII_LOGO}</pre>
                <div className="info-panel">
                  {INFO_LINES.map((line, i) => (
                    <div key={i} className="info-line stagger-line" style={{'--line-index': i + 1}}>{line.value}</div>
                  ))}
                  <div className="color-palettes stagger-line" style={{'--line-index': INFO_LINES.length + 1}}>
                    <div className="color-row">
                      <span style={{color: '#222'}}>███</span><span style={{color: '#3a3a3a'}}>███</span><span style={{color: '#555'}}>███</span><span style={{color: '#777'}}>███</span><span style={{color: '#999'}}>███</span><span style={{color: '#bbb'}}>███</span>
                    </div>
                    <div className="color-row">
                      <span style={{color: '#5a3018'}}>███</span><span style={{color: '#7a4a2a'}}>███</span><span style={{color: '#9a5e38'}}>███</span><span style={{color: '#b87040'}}>███</span><span style={{color: '#d4824a'}}>███</span><span style={{color: '#e89858'}}>███</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showInput && (
              <div className="input-section">
                <div className="terminal-line stagger-line" style={{'--line-index': 0}}><span className="prompt">{'>'}</span> how does this work?</div>
                <div className="terminal-response stagger-line" style={{'--line-index': 1}}>scale-diffusion: help us play games, generate training data, earn rewards</div>
                <div className="separator-line stagger-line" style={{'--line-index': 2}}>─────────────────────────────────────────────────────────────────────────</div>
                <form className="terminal-input-line stagger-line" style={{'--line-index': 3}} onSubmit={handleSubmit}>
                  <span className="prompt">$</span>
                  <div className="input-wrapper">
                    {!inputValue && <span className="placeholder-text">enter your solana wallet address</span>}
                    <input
                      ref={inputRef}
                      type="text"
                      className="terminal-input"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </form>
              </div>
            )}

            {error && (
              <div className="terminal-error">error: {error}</div>
            )}

            {isSubmitting && (
              <div className="submit-output">
                {submitLines.map((line, i) => (
                  <div key={i} className="submit-line">{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* TV screen - appears when connected */}
      {isConnected && (
        <div className={`tv-container ${isFullscreen ? 'fullscreen' : ''}`}>
          <div className="game-frame" onClick={() => gameLoaded && setIsFullscreen(!isFullscreen)}>
            <GameCanvas
              className="game-canvas"
              apiKey={import.meta.env.VITE_DECART_API_KEY}
              prompt={aiPrompt}
              isFullscreen={isFullscreen}
              onLoaded={() => setGameLoaded(true)}
            />
          </div>
          {!isFullscreen && (
            <div className="shape-blur-container">
              <ShapeBlur
                variation={0}
                pixelRatioProp={window.devicePixelRatio || 1}
                shapeSize={1.3}
                roundness={0}
                borderSize={0.03}
                circleSize={0.03}
                circleEdge={1}
              />
            </div>
          )}
        </div>
      )}

      {isConnected && !isFullscreen && (
        <>
          <div className={`status-box ${hasAnimated ? 'no-anim' : ''}`}>
            <span className="wallet">{truncateAddress(walletAddress)}</span>
            <span className="status">connected</span>
          </div>
          <input
            type="text"
            className={`prompt-input ${hasAnimated ? 'no-anim' : ''}`}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Enter AI prompt..."
            spellCheck={false}
          />
        </>
      )}
    </div>
  )
}

export default App
