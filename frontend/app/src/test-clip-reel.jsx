import { ParallaxScroll } from './components/ui/Clip-Reel'
import './components/ui/Clip-Reel.css'

const gamingImages = [
  "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
  "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80",
  "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=800&q=80",
  "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80",
  "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80",
]

export default function TestClipReel() {
  return (
    <div style={{
      display: 'flex',
      background: '#1a1a1a',
      minHeight: '100vh',
      padding: '2rem',
      gap: '2rem'
    }}>
      {/* Left side panel */}
      <div style={{ width: '400px', height: '100vh', overflow: 'hidden' }}>
        <ParallaxScroll images={gamingImages} className="parallax-side" direction="down" />
      </div>

      {/* Center content placeholder */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ color: '#fff' }}>Clip Reel Test</h1>
      </div>

      {/* Right side panel */}
      <div style={{ width: '400px', height: '100vh', overflow: 'hidden' }}>
        <ParallaxScroll images={gamingImages} className="parallax-side" direction="up" />
      </div>
    </div>
  )
}
