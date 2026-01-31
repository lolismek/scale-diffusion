import { useEffect, useRef } from 'react'
import { GL } from 'alfrid'
import SceneApp from './ribbons/SceneApp'
import preload from './ribbons/utils/preload'
import './ribbons/Settings'

let scene = null

export default function RibbonCanvas() {
  const canvasRef = useRef(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !canvasRef.current) return
    initialized.current = true

    const canvas = canvasRef.current

    preload().then(() => {
      // Import Settings to initialize
      import('./ribbons/Settings').then(({ default: Settings }) => {
        Settings.init()

        GL.init(canvas, {
          alpha: true,
          preserveDrawingBuffer: true,
          premultipliedAlpha: false
        })

        scene = new SceneApp()
      })
    }).catch(err => {
      console.error('Failed to load ribbon assets:', err)
    })

    return () => {
      // Cleanup if needed
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent'
      }}
    />
  )
}
