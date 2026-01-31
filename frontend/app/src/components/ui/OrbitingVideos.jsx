import { useRef, useEffect, useState } from 'react'
import './OrbitingVideos.css'

const defaultClips = [
  '/clips/league_comp.gif',
  '/clips/csgo2_comp_compressed.gif',
  '/clips/hecaclear_comp.gif',
  '/clips/mc_yolo_compressed.gif',
  '/clips/opalskribbl_compressed.gif',
  '/clips/csgo_yolo_1_compressed.gif',
  '/clips/final tft clip comp.mov',
  '/clips/discord.MOV',
  '/video.mp4',
]

const depthClips = [
  '/clips/racing_depth_1.mov',
  '/clips/csgo_depth_1.mov',
  '/clips/fps_depth_1.mov',
  '/clips/csgo_depth.mov',
  '/clips/depth_krunker.mov',
  '/clips/depth_shell.mov',
  '/clips/mc_depth.mov',
]

const OrbitingVideos = ({
  itemsPerRing = 4,
  orbitRadius = 150,
  orbitSpeed = 20,
  topOffset = -200,
  bottomOffset = 200,
  colorOffset = 0,
  className = '',
  scale = 1,
  depthOnly = false
}) => {
  const clips = depthOnly ? depthClips : defaultClips
  const containerRef = useRef(null)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    let animationId
    let lastTime = performance.now()

    const animate = (currentTime) => {
      const delta = (currentTime - lastTime) / 1000
      lastTime = currentTime

      setRotation(prev => (prev + (360 / orbitSpeed) * delta) % 360)
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [orbitSpeed])

  const colors = [
    '#e8a088', // opal salmon
    '#dba090', // dusty peach
    '#e0b0a0', // soft salmon
    '#d4a0a8', // salmon pink
    '#e8b098', // warm peach
    '#dda8a8', // blush
    '#d8a8b0', // pink salmon
    '#e0a090', // peachy
    '#d0a0b0', // mauve peach
    '#e5a898', // coral
    '#d8a0a0', // dusty rose
    '#dca8a0', // salmon cream
  ]

  const renderRing = (yOffset, ringIndex, reverseDirection = false) => {
    const items = Array.from({ length: itemsPerRing }, (_, i) => ({ id: ringIndex * itemsPerRing + i + 1 }))
    const direction = reverseDirection ? -1 : 1

    return items.map((item, index) => {
      const angle = (360 / itemsPerRing) * index + rotation * direction
      const radian = (angle * Math.PI) / 180
      const x = Math.cos(radian) * orbitRadius
      // Add subtle vertical wobble
      const wobble = Math.sin(radian * 2 + index) * 5 + Math.cos(radian * 1.5) * 3
      const y = Math.sin(radian) * orbitRadius * 0.25 + wobble
      const z = Math.sin(radian)
      const itemScale = (0.7 + (z + 1) * 0.45) * scale
      const opacity = 0.3 + (z + 1) * 0.35
      const zIndex = Math.round((z + 1) * 10)
      const color = colors[(item.id - 1 + colorOffset) % colors.length]
      const clipSrc = clips[(item.id - 1 + colorOffset) % clips.length]
      const isVideo = clipSrc.toLowerCase().endsWith('.mov') || clipSrc.toLowerCase().endsWith('.mp4')

      return (
        <div
          key={item.id}
          className="orbiting-item"
          style={{
            transform: `translate(${x}px, ${yOffset + y}px) scale(${itemScale})`,
            opacity,
            zIndex,
          }}
        >
          <div className="orbiting-placeholder" style={{ borderColor: `${color}80` }}>
            {isVideo ? (
              <video src={clipSrc} className="orbiting-gif" autoPlay loop muted playsInline />
            ) : (
              <img src={clipSrc} alt="" className="orbiting-gif" />
            )}
            <div className="bbox-label" style={{ backgroundColor: `${color}99` }}>{70 + ((item.id * 7) % 29)}%</div>
          </div>
        </div>
      )
    })
  }

  return (
    <div ref={containerRef} className={`orbiting-videos-container ${className}`}>
      {renderRing(topOffset, 0, false)}
      {renderRing(bottomOffset, 1, true)}
    </div>
  )
}

export default OrbitingVideos
