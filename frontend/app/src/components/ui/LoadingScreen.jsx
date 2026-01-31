import { useState, useEffect } from 'react'
import './LoadingScreen.css'

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const duration = 2000
    const startTime = Date.now()

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease out - fast start, slow end
      const eased = 1 - Math.pow(1 - t, 3)
      const newProgress = eased * 100

      setProgress(newProgress)

      if (t >= 1) {
        clearInterval(timer)
        setTimeout(() => setVisible(false), 300)
      }
    }, 16)

    return () => clearInterval(timer)
  }, [])

  if (!visible) return null

  return (
    <div className={`loading-screen ${progress >= 100 ? 'fade-out' : ''}`}>
      <div className="claude-loader">
        <pre className="claude-text outline">{` ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝`}</pre>
        <pre className="claude-text filled" style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}>{` ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝`}</pre>
      </div>
    </div>
  )
}
