import { useState, useRef, useEffect } from 'react'
import './OpalAnimation.css'

export function OpalAnimation() {
  const [eyeState, setEyeState] = useState('open')
  const isAnimatingRef = useRef(false)

  const openEyes = `
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ████████     ████████████████████████████     ████████
      ████████     ████████████████████████████     ████████
      ████████     ████████████████████████████     ████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████                                                                      
      ██████████████████████████████████████████████████████    
      ██████████████████████████████████████████████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
        ████████                                  ████████
            ███                                      ███    `

  const closedEyes = `
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ████████     ████████████████████████████     ████████
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████                                                                      
      ██████████████████████████████████████████████████████    
      ██████████████████████████████████████████████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
        ████████                                  ████████
            ███                                      ███    `

  const lookLeft = `
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████     ████████████████████████████     ██████████
      ██████     ████████████████████████████     ██████████
      ██████     ████████████████████████████     ██████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████                                                                      
      ██████████████████████████████████████████████████████    
      ██████████████████████████████████████████████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
        ████████                                  ████████
            ███                                      ███    `


  const lookRight = `
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████████████████████████████████████████████████████
      ██████████     ████████████████████████████     ██████
      ██████████     ████████████████████████████     ██████
      ██████████     ████████████████████████████     ██████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████
██████████████████████████████████████████████████████████████████                                                                      
      ██████████████████████████████████████████████████████    
      ██████████████████████████████████████████████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
      ██████████████                          ██████████████
        ████████                                  ████████
            ███                                      ███    `


  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const blinkSequence = async () => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true

    // Blink 1
    setEyeState('closed')
    await sleep(60)
    setEyeState('open')
    await sleep(100)

    // Blink 2
    setEyeState('closed')
    await sleep(60)
    setEyeState('open')
    await sleep(100)

    // Blink 3
    setEyeState('closed')
    await sleep(60)
    setEyeState('open')

    isAnimatingRef.current = false
  }

  const randomBlink = async () => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true

    setEyeState('closed')
    await sleep(60)
    setEyeState('open')

    isAnimatingRef.current = false
  }

  const lookAround = async () => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true

    // Look left
    setEyeState('left')
    await sleep(1200)

    // Look center
    setEyeState('open')
    await sleep(800)

    // Look right
    setEyeState('right')
    await sleep(1200)

    // Look center
    setEyeState('open')

    isAnimatingRef.current = false
  }

  // Random autonomous blinking (every 2-4 seconds)
  useEffect(() => {
    const scheduleRandomBlink = () => {
      const delay = 2000 + Math.random() * 2000
      return setTimeout(() => {
        randomBlink()
      }, delay)
    }

    let timeoutId = scheduleRandomBlink()
    const intervalId = setInterval(() => {
      clearTimeout(timeoutId)
      timeoutId = scheduleRandomBlink()
    }, 4000)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])

  // Random looking around (every 3-6 seconds)
  useEffect(() => {
    const scheduleLookAround = () => {
      const delay = 3000 + Math.random() * 3000
      return setTimeout(() => {
        lookAround()
      }, delay)
    }

    let timeoutId = scheduleLookAround()
    const intervalId = setInterval(() => {
      clearTimeout(timeoutId)
      timeoutId = scheduleLookAround()
    }, 6000)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])

  const getEyeContent = () => {
    switch(eyeState) {
      case 'closed':
        return closedEyes
      case 'left':
        return lookLeft
      case 'right':
        return lookRight
      default:
        return openEyes
    }
  }

  return (
    <pre
      className="opal-animation"
    >
      {getEyeContent()}
    </pre>
  )
}

export default OpalAnimation
