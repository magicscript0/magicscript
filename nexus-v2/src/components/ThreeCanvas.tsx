import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface ThreeCanvasProps {
  accelerate?: boolean // when boot loader or login ignition activates
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ accelerate = false }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const speedRef = useRef(1.0)
  const shockwavesRef = useRef<{ radius: number; maxRadius: number; opacity: number; mesh: THREE.Line }[]>([])

  useEffect(() => {
    speedRef.current = accelerate ? 4.0 : 1.0
  }, [accelerate])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // 1. Scene, Camera, WebGL Renderer
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030712, 0.024)

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 25)

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

    // 2a. Outer Wireframe Torus Knot
    const torusGeo = new THREE.TorusKnotGeometry(4.8, 1.25, 140, 28, 2, 3)
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.24,
    })
    const torusMesh = new THREE.Mesh(torusGeo, torusMat)
    coreGroup.add(torusMesh)

    // Torus Glowing Point Vertices
    const torusPointMat = new THREE.PointsMaterial({
      color: 0x8b5cf6,
      size: 0.1,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const torusPoints = new THREE.Points(torusGeo, torusPointMat)
    coreGroup.add(torusPoints)

    // 2b. Inner Crystalline Icosahedron Core
    const icoGeo = new THREE.IcosahedronGeometry(2.4, 1)
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    })
    const icoMesh = new THREE.Mesh(icoGeo, icoMat)
    coreGroup.add(icoMesh)

    // 2c. Concentric Orbiting Gimbal Rings with Satellites
    const rings: { line: THREE.Line; speedX: number; speedY: number; speedZ: number }[] = []
    const ringConfigs = [
      { radius: 7.8, color: 0x00f2fe, opacity: 0.35, sx: 0.005, sy: 0.003, sz: 0.006 },
      { radius: 9.6, color: 0x8b5cf6, opacity: 0.3, sx: -0.004, sy: 0.005, sz: -0.005 },
      { radius: 11.5, color: 0x38bdf8, opacity: 0.25, sx: 0.003, sy: -0.004, sz: 0.004 },
      { radius: 13.8, color: 0xfbbf24, opacity: 0.2, sx: -0.002, sy: 0.002, sz: -0.003 },
    ]

    ringConfigs.forEach((cfg) => {
      const ringGeo = new THREE.BufferGeometry()
      const pts: THREE.Vector3[] = []
      const segments = 128
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta) * cfg.radius, Math.sin(theta) * cfg.radius, 0))
      }
      ringGeo.setFromPoints(pts)
      const ringMat = new THREE.LineBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Line(ringGeo, ringMat)
      coreGroup.add(ring)
      rings.push({ line: ring, speedX: cfg.sx, speedY: cfg.sy, speedZ: cfg.sz })
    })

    // 3. 10,000 Spatial Warp Star Field (Particles gliding forward in Z)
    const particleCount = 10000
    const particleGeo = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const zVelocities = new Float32Array(particleCount)

    const colorA = new THREE.Color(0x00f2fe) // Cyan
    const colorB = new THREE.Color(0x8b5cf6) // Violet
    const colorC = new THREE.Color(0xfbbf24) // Gold
    const colorD = new THREE.Color(0x38bdf8) // Sky blue

    for (let i = 0; i < particleCount; i++) {
      // Cylinder / cone distribution along depth
      const radius = 8 + Math.random() * 45
      const angle = Math.random() * Math.PI * 2
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80

      zVelocities[i] = 0.04 + Math.random() * 0.08

      const roll = Math.random()
      const c = roll < 0.5 ? colorA : roll < 0.8 ? colorB : roll < 0.93 ? colorD : colorC
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMat = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
    })

    const particleSystem = new THREE.Points(particleGeo, particleMat)
    scene.add(particleSystem)

    // 4. Interactive Shockwave System on Click / Tap
    const shockwaveGroup = new THREE.Group()
    scene.add(shockwaveGroup)

    const triggerShockwave = (x = 0, y = 0) => {
      const geo = new THREE.BufferGeometry()
      const pts: THREE.Vector3[] = []
      const segs = 64
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0))
      }
      geo.setFromPoints(pts)

      const mat = new THREE.LineBasicMaterial({
        color: 0x00f2fe,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      })

      const mesh = new THREE.Line(geo, mat)
      mesh.position.set(x, y, 2)
      shockwaveGroup.add(mesh)

      shockwavesRef.current.push({
        radius: 1,
        maxRadius: 28,
        opacity: 0.9,
        mesh,
      })
    }

    const handleClick = (e: MouseEvent) => {
      // Convert click to 3D space
      const halfW = window.innerWidth / 2
      const halfH = window.innerHeight / 2
      const x = ((e.clientX - halfW) / halfW) * 12
      const y = -((e.clientY - halfH) / halfH) * 8
      triggerShockwave(x, y)
    }

    window.addEventListener('click', handleClick)

    // 5. Parallax & Mouse Tracking with Weight & Inertia
    let mouseX = 0
    let mouseY = 0
    let camTargetX = 0
    let camTargetY = 0

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

    // 6. Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // 7. 60 FPS Animation Engine
    let animId: number
    const posAttr = particleGeo.attributes.position as THREE.BufferAttribute

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const currentSpeed = speedRef.current

      // Parallax smooth lerp
      camTargetX += (mouseX * 4.0 - camTargetX) * 0.04
      camTargetY += (-mouseY * 3.0 - camTargetY) * 0.04

      camera.position.x = camTargetX
      camera.position.y = camTargetY
      camera.rotation.z = -camTargetX * 0.015
      camera.lookAt(0, 0, 0)

      // Kinetic core rotation
      torusMesh.rotation.x += 0.0035 * currentSpeed
      torusMesh.rotation.y += 0.0055 * currentSpeed
      torusPoints.rotation.x = torusMesh.rotation.x
      torusPoints.rotation.y = torusMesh.rotation.y

      icoMesh.rotation.x -= 0.006 * currentSpeed
      icoMesh.rotation.y += 0.008 * currentSpeed

      // Gimbal rings rotation
      rings.forEach((r) => {
        r.line.rotation.x += r.speedX * currentSpeed
        r.line.rotation.y += r.speedY * currentSpeed
        r.line.rotation.z += r.speedZ * currentSpeed
      })

      // Particle forward warp drift
      const positionsArr = posAttr.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3 + 2
        positionsArr[idx] += zVelocities[i] * currentSpeed * 2.2
        if (positionsArr[idx] > 35) {
          positionsArr[idx] = -45
        }
      }
      posAttr.needsUpdate = true

      // Shockwaves update
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const sw = shockwavesRef.current[i]
        sw.radius += 0.5 * currentSpeed
        sw.opacity -= 0.018 * currentSpeed
        sw.mesh.scale.set(sw.radius, sw.radius, 1)
        ;(sw.mesh.material as THREE.LineBasicMaterial).opacity = Math.max(0, sw.opacity)

        if (sw.opacity <= 0 || sw.radius >= sw.maxRadius) {
          shockwaveGroup.remove(sw.mesh)
          sw.mesh.geometry.dispose()
          ;(sw.mesh.material as THREE.Material).dispose()
          shockwavesRef.current.splice(i, 1)
        }
      }

      renderer.render(scene, camera)
    }

    animate()

    // 8. Cleanup
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('resize', handleResize)

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }

      torusGeo.dispose()
      torusMat.dispose()
      torusPointMat.dispose()
      icoGeo.dispose()
      icoMat.dispose()
      particleGeo.dispose()
      particleMat.dispose()
      rings.forEach((r) => {
        r.line.geometry.dispose()
        ;(r.line.material as THREE.Material).dispose()
      })
      shockwavesRef.current.forEach((sw) => {
        sw.mesh.geometry.dispose()
        ;(sw.mesh.material as THREE.Material).dispose()
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
