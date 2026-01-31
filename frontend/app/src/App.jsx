import { useState, useEffect, useRef } from 'react'
import Video2Ascii from 'video2ascii'
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

// Fastfetch-style ASCII art and system info
const FASTFETCH_LINES = [
  '',
  '       ██████╗ ██████╗  █████╗ ██╗     ',
  '      ██╔═══██╗██╔══██╗██╔══██╗██║     ',
  '      ██║   ██║██████╔╝███████║██║     ',
  '      ██║   ██║██╔═══╝ ██╔══██║██║     ',
  '      ╚██████╔╝██║     ██║  ██║███████╗',
  '       ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚══════╝',
  '',
  '  ─────────────────────────────────────',
  '',
  '  os        scale-diffusion v0.1.0',
  '  host      browser runtime',
  '  kernel    webgl 2.0',
  '  uptime    loading...',
  '  packages  diffusion-core, sol-wallet',
  '  shell     opal-term',
  '',
  '  ─────────────────────────────────────',
  '',
]

function App() {
  const [walletAddress, setWalletAddress] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [terminalLines, setTerminalLines] = useState([])
  const [showInput, setShowInput] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const inputRef = useRef(null)

  // Typewriter effect for fastfetch
  useEffect(() => {
    let lineIndex = 0
    const interval = setInterval(() => {
      if (lineIndex < FASTFETCH_LINES.length) {
        setTerminalLines(prev => [...prev, FASTFETCH_LINES[lineIndex]])
        lineIndex++
      } else {
        clearInterval(interval)
        setTimeout(() => setShowInput(true), 300)
      }
    }, 50)

    return () => clearInterval(interval)
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
    setTerminalLines(prev => [...prev, `  > wallet ${trimmed}`, '', '  connecting...'])
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
      {/* Background layers - always rendered, revealed when connected */}
      <div className={`background-layers ${isConnected ? 'visible' : ''}`}>
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

      {/* Terminal - morphs into TV */}
      {!isConnected && (
        <div className={`terminal ${isTransitioning ? 'morphing' : ''}`}>
          <div className="terminal-content">
            {terminalLines.map((line, i) => (
              <div key={i} className="terminal-line">{line}</div>
            ))}

            {showInput && (
              <form className="terminal-input-line" onSubmit={handleSubmit}>
                <span className="prompt">{'>'}</span>
                <span className="command">wallet </span>
                <input
                  ref={inputRef}
                  type="text"
                  className="terminal-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </form>
            )}

            {error && (
              <div className="terminal-error">  error: {error}</div>
            )}
          </div>
        </div>
      )}

      {/* TV screen - appears when connected */}
      {isConnected && (
        <div className="tv-container">
          <div className="tv-screen">
            {/* Header embedded in TV */}
            <div className="tv-header">
              <span className="session-label">session active</span>
              <div className="wallet-info">
                <span className="wallet-address">{truncateAddress(walletAddress)}</span>
                <span className="status-dot" />
              </div>
            </div>

            {/* Game content area */}
            <div className="tv-content">
              {/* Game will load here */}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
