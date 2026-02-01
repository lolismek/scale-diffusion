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
  const [aiPrompt, setAiPrompt] = useState('New York City realistic buildings, streets, and urban texture')
  const inputRef = useRef(null)

  // Show fastfetch then input
  useEffect(() => {
    setTimeout(() => setShowFastfetch(true), 100)
    setTimeout(() => setShowInput(true), 600)
  }, [])

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

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
    setShowInput(false)

    // Start transition
    setTimeout(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setIsConnected(true)
      }, 800)
    }, 600)
  }

  return (
    <div className="container">
      {/* Background layers - always visible, terminal covers it */}
      <div className="background-layers">
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
          <div className="terminal-content">
            {showFastfetch && (
              <div className="fastfetch">
                <pre className="ascii-logo">{ASCII_LOGO}</pre>
                <div className="info-panel">
                  {INFO_LINES.map((line, i) => (
                    <div key={i} className="info-line">{line.value}</div>
                  ))}
                  <div className="color-palettes">
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
                <div className="terminal-line"><span className="prompt">{'>'}</span> how does this work?</div>
                <div className="terminal-response">scale-diffusion: help us play games, generate training data, earn rewards</div>
                <div className="separator-line">─────────────────────────────────────────────────────────────────────────</div>
                <form className="terminal-input-line" onSubmit={handleSubmit}>
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
          </div>
        </div>

      {/* TV screen - appears when connected */}
      {isConnected && (
        <div className="tv-container">
          <div className="game-frame">
            <GameCanvas
              className="game-canvas"
              apiKey={import.meta.env.VITE_DECART_API_KEY}
              prompt={aiPrompt}
            />
          </div>
          <div className="shape-blur-container">
            <ShapeBlur
              variation={0}
              pixelRatioProp={window.devicePixelRatio || 1}
              shapeSize={1.3}
              roundness={0}
              borderSize={0.01}
              circleSize={0.02}
              circleEdge={1.7}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
