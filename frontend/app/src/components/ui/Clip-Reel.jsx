import { useScroll, useTransform, motion } from 'motion/react'
import { useRef, useCallback } from 'react'
import { cn } from '../../lib/utils'
import './Clip-Reel.css'

export const ParallaxScroll = ({
  images,
  className,
  direction = "down",
}) => {
  const gridRef = useRef(null)
  const { scrollYProgress } = useScroll({
    container: gridRef,
    offset: ["start start", "end start"],
  })

  const translateFirst = useTransform(scrollYProgress, [0, 1], [0, -200])
  const translateSecond = useTransform(scrollYProgress, [0, 1], [0, 200])
  const translateThird = useTransform(scrollYProgress, [0, 1], [0, -200])

  const isSidePanel = className?.includes('parallax-side')

  // Mouse tracking for border glow effect
  const handleMouseMove = useCallback((e) => {
    const wrapper = e.currentTarget
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const relativeX = (x / rect.width) * 100
    const relativeY = (y / rect.height) * 100
    wrapper.style.setProperty('--glow-x', `${relativeX}%`)
    wrapper.style.setProperty('--glow-y', `${relativeY}%`)
  }, [])

  const handleMouseEnter = useCallback((e) => {
    e.currentTarget.style.setProperty('--glow-intensity', '1')
  }, [])

  const handleMouseLeave = useCallback((e) => {
    e.currentTarget.style.setProperty('--glow-intensity', '0')
  }, [])

  if (isSidePanel) {
    // Auto-animated carousel for side panels
    // Duplicate images for seamless loop
    const duplicatedImages = [...images, ...images]

    // Calculate total distance: (image height + gap) * number of images
    // 15rem = 240px, gap = 1.5rem = 24px, so each image block is ~264px
    const imageBlockHeight = 264 // height + gap in px
    const totalDistance = imageBlockHeight * images.length

    // Determine animation based on direction
    // For seamless loop, we animate exactly one full set of images
    const animateY = direction === "down"
      ? [-totalDistance, 0] // Start from top, move down
      : [0, -totalDistance] // Start from bottom, move up

    return (
      <div
        className={cn("Clip-Reel-container parallax-auto-scroll", className)}
      >
        <motion.div
          className="Clip-Reel-column"
          animate={{
            y: animateY
          }}
          transition={{
            duration: images.length * 10,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          {duplicatedImages.map((el, idx) => (
            <div
              key={"grid-side-" + idx}
              className="Clip-Reel-image-wrapper"
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <img
                src={el}
                className="Clip-Reel-image"
                height="400"
                width="400"
                alt="gaming thumbnail"
              />
            </div>
          ))}
        </motion.div>
      </div>
    )
  }

  // Three columns for full-width display
  const third = Math.ceil(images.length / 3)
  const firstPart = images.slice(0, third)
  const secondPart = images.slice(third, 2 * third)
  const thirdPart = images.slice(2 * third)

  return (
    <div
      className={cn("Clip-Reel-container", className)}
      ref={gridRef}
    >
      <div className="Clip-Reel-grid">
        <div className="Clip-Reel-column">
          {firstPart.map((el, idx) => (
            <motion.div
              style={{ y: translateFirst }}
              key={"grid-1" + idx}
            >
              <div
                className="Clip-Reel-image-wrapper"
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <img
                  src={el}
                  className="Clip-Reel-image"
                  height="400"
                  width="400"
                  alt="thumbnail"
                />
              </div>
            </motion.div>
          ))}
        </div>
        <div className="Clip-Reel-column">
          {secondPart.map((el, idx) => (
            <motion.div style={{ y: translateSecond }} key={"grid-2" + idx}>
              <div
                className="Clip-Reel-image-wrapper"
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <img
                  src={el}
                  className="Clip-Reel-image"
                  height="400"
                  width="400"
                  alt="thumbnail"
                />
              </div>
            </motion.div>
          ))}
        </div>
        <div className="Clip-Reel-column">
          {thirdPart.map((el, idx) => (
            <motion.div style={{ y: translateThird }} key={"grid-3" + idx}>
              <div
                className="Clip-Reel-image-wrapper"
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <img
                  src={el}
                  className="Clip-Reel-image"
                  height="400"
                  width="400"
                  alt="thumbnail"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
