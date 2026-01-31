import { useEffect, useState } from 'react'
import './ClaudeMascots.css'

const ClaudeMascot = ({ style, flipped, color }) => (
  <div className={`claude-mascot ${flipped ? 'flipped' : ''}`} style={{ ...style, color, textShadow: `0 0 6px ${color}99` }}>
    <pre>{` ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝`}</pre>
  </div>
)

export function ClaudeMascots() {
  const colors = [
    '#ff8c5a', // original orange
    '#e8a088', // salmon
    '#dba090', // dusty peach
    '#f0a070', // warm peach
    '#d4a0a8', // salmon pink
    '#e5a898', // coral
    '#e0b0a0', // soft salmon
  ]

  const [mascots, setMascots] = useState([
    { pos: 10, dir: 1, speed: 0.55, bottom: 12, color: colors[0] },
    { pos: 35, dir: -1, speed: 0.48, bottom: 18, color: colors[1] },
    { pos: 60, dir: 1, speed: 0.52, bottom: 10, color: colors[2] },
    { pos: 85, dir: -1, speed: 0.50, bottom: 15, color: colors[3] },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setMascots(prev => prev.map(m => {
        let next = m.pos + m.dir * m.speed
        let newDir = m.dir
        if (next > 95) { newDir = -1; next = 95 }
        if (next < 5) { newDir = 1; next = 5 }
        return { ...m, pos: next, dir: newDir }
      }))
    }, 50)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="claude-mascots-container">
      {mascots.map((m, i) => (
        <ClaudeMascot
          key={i}
          style={{ left: `${m.pos}%`, bottom: `${m.bottom}px` }}
          flipped={m.dir === -1}
          color={m.color}
        />
      ))}
    </div>
  )
}

export default ClaudeMascots
