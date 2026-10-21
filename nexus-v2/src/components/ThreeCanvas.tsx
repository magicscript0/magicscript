import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface ThreeCanvasProps {
  accelerate?: boolean // when boot loader is charging up!
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ accelerate = false }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const speedMultiplierRef = useRef(1.0)

  useEffect(() => {
    speedMultiplierRef.current = accelerate ? 3.5 : 1.0
  }, [accelerate])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030712, 0.028)

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 24)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // 2. Central 3D Kinetic Core Group
    const coreGroup = new THREE.Group()
    scene.add(coreGroup)

    // Inner Wireframe Torus Knot (Cyan & Violet dual-tone)
    const coreGeo = new THREE.TorusKnotGeometry(4.6, 1.15, 130, 24, 2, 3)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    })
    const wireMesh = new THREE.Mesh(coreGeo, wireMat)
    coreGroup.add(wireMesh)

    // Floating Points on the Torus
    const pointMat = new THREE.PointsMaterial({
      color: 0x8b5cf6,
      size: 0.09,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const pointMesh = new THREE.Points(coreGeo, pointMat)
    coreGroup.add(pointMesh)

    // Concentric Gimbal Orbiting Rings
    const rings: THREE.Line[] = []
    const ringRadii = [7.5, 9.2, 11.0]
    const ringColors = [0x00f2fe, 0x8b5cf6, 0x38bdf8]

    ringRadii.forEach((radius, idx) => {
      const ringGeo = new THREE.BufferGeometry()
      const pts: THREE.Vector3[] = []
      const segments = 120
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0))
      }
      ringGeo.setFromPoints(pts)
      const ringMat = new THREE.LineBasicMaterial({
        color: ringColors[idx],
        transparent: true,
        opacity: 0.28 - idx * 0.06,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Line(ringGeo, ringMat)
      ring.rotation.x = (idx * Math.PI) / 3
      ring.rotation.y = (idx * Math.PI) / 4
      coreGroup.add(ring)
      rings.push(ring)
    })

    // 3. 8,000 Spatial Quantum Particle Swarm
    const particleCount = 8500
    const particleGeo = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    const colorA = new THREE.Color(0x00f2fe) // Cyan
    const colorB = new THREE.Color(0x8b5cf6) // Violet
    const colorC = new THREE.Color(0xfbbf24) // Gold highlight

    for (let i = 0; i < particleCount; i++) {
      // Spherical distribution around deep space
      const radius = 10 + Math.random() * 55
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)

      const roll = Math.random()
      const c = roll < 0.6 ? colorA : roll < 0.9 ? colorB : colorC
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    })

    const particleField = new THREE.Points(particleGeo, particleMat)
    scene.add(particleField)

    // 4. Interactive Mouse Tracking & Parallax
    let mouseX = 0
    let mouseY = 0
    let targetX = 0
    let targetY = 0

    const handleMouseMove = (e: MouseEvent) => {
      const halfW = window.innerWidth / 2
      const halfH = window.innerHeight / 2
      mouseX = (e.clientX - halfW) / halfW
      mouseY = (e.clientY - halfH) / halfH
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const halfW = window.innerWidth / 2
        const halfH = window.innerHeight / 2
        mouseX = (e.touches[0].clientX - halfW) / halfW
        mouseY = (e.touches[0].clientY - halfH) / halfH
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    // 5. Window Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // 6. 60 FPS Render Loop with Smooth Camera Dampening
    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const speed = speedMultiplierRef.current

      // Parallax smooth interpolation (lerp)
      targetX += (mouseX * 3.5 - targetX) * 0.04
      targetY += (-mouseY * 2.5 - targetY) * 0.04

      camera.position.x = targetX
      camera.position.y = targetY
      camera.lookAt(0, 0, 0)

      // Rotate central kinetic core
      coreGroup.rotation.x += 0.003 * speed
      coreGroup.rotation.y += 0.005 * speed

      // Rotate gimbal rings with counter-rotations
      rings.forEach((ring, idx) => {
        ring.rotation.z += (idx % 2 === 0 ? 0.004 : -0.004) * (idx + 1) * speed
        ring.rotation.y += 0.002 * speed
      })

      // Particle swarm slow rotation
      particleField.rotation.y += 0.0006 * speed
      particleField.rotation.x += 0.0003 * speed

      renderer.render(scene, camera)
    }

    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('resize', handleResize)

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }

      coreGeo.dispose()
      wireMat.dispose()
      pointMat.dispose()
      particleGeo.dispose()
      particleMat.dispose()
      rings.forEach((r) => {
        r.geometry.dispose()
        ;(r.material as THREE.Material).dispose()
      })
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    />
  )
}
