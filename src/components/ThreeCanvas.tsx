import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface ThreeCanvasProps {
  accelerate?: boolean // when boot loader or login ignition activates
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ accelerate = false }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const targetSpeedRef = useRef(1.0)
  const shockwavesRef = useRef<{ radius: number; maxRadius: number; opacity: number; mesh: THREE.Line }[]>([])

  useEffect(() => {
    targetSpeedRef.current = accelerate ? 3.8 : 1.0
  }, [accelerate])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // 1. Scene, Camera, WebGL Renderer
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030712, 0.022)

    const isMobileInitial = window.innerWidth < 768
    const camera = new THREE.PerspectiveCamera(
      isMobileInitial ? 60 : 50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, isMobileInitial ? 32 : 24)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(
      isMobileInitial
        ? Math.min(window.devicePixelRatio, 1.5)
        : Math.min(window.devicePixelRatio, 2.0)
    )
    container.appendChild(renderer.domElement)

    // 2. Central Cyber Kinetic Group
    const coreGroup = new THREE.Group()
    scene.add(coreGroup)

    // 2a. Outer Low-Poly Faceted Cyber Geodesic Lattice (Replaces tangled rope)
    const outerGeo = new THREE.IcosahedronGeometry(4.2, 1)
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    })
    const outerMesh = new THREE.Mesh(outerGeo, outerMat)
    coreGroup.add(outerMesh)

    // Glowing Vertex Nodes on Outer Geodesic Lattice
    const outerPointsMat = new THREE.PointsMaterial({
      color: 0x00f2fe,
      size: 0.15,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const outerPoints = new THREE.Points(outerGeo, outerPointsMat)
    coreGroup.add(outerPoints)

    // 2b. Intermediate Shield (Violet Dodecahedron)
    const midGeo = new THREE.DodecahedronGeometry(3.1, 0)
    const midMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.24,
    })
    const midMesh = new THREE.Mesh(midGeo, midMat)
    coreGroup.add(midMesh)

    // 2c. Inner Crystalline Quantum Core (Golden Octahedron)
    const innerGeo = new THREE.OctahedronGeometry(2.0, 0)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    })
    const innerMesh = new THREE.Mesh(innerGeo, innerMat)
    coreGroup.add(innerMesh)

    const innerPointsMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.22,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    })
    const innerPoints = new THREE.Points(innerGeo, innerPointsMat)
    coreGroup.add(innerPoints)

    // 2d. Concentric Structured Cyber Gimbal Rings with Orbital Telemetry Nodes
    const rings: {
      group: THREE.Group
      speedX: number
      speedY: number
      speedZ: number
      lineGeo: THREE.BufferGeometry
      lineMat: THREE.LineBasicMaterial
      nodesGeo?: THREE.BufferGeometry
      nodesMat?: THREE.PointsMaterial
    }[] = []

    const ringConfigs = [
      { radius: 6.8, color: 0x00f2fe, opacity: 0.35, nodeCount: 4, sx: 0.004, sy: 0.005, sz: 0.003 },
      { radius: 9.4, color: 0x8b5cf6, opacity: 0.30, nodeCount: 6, sx: -0.005, sy: 0.003, sz: -0.004 },
      { radius: 12.2, color: 0x38bdf8, opacity: 0.25, nodeCount: 4, sx: 0.003, sy: -0.004, sz: 0.004 },
      { radius: 15.6, color: 0xfbbf24, opacity: 0.18, nodeCount: 8, sx: -0.002, sy: 0.002, sz: -0.002 },
    ]

    ringConfigs.forEach((cfg) => {
      const ringGroup = new THREE.Group()
      coreGroup.add(ringGroup)

      // Ring circular track
      const lineGeo = new THREE.BufferGeometry()
      const pts: THREE.Vector3[] = []
      const segments = 96
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta) * cfg.radius, Math.sin(theta) * cfg.radius, 0))
      }
      lineGeo.setFromPoints(pts)
      const lineMat = new THREE.LineBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending: THREE.AdditiveBlending,
      })
      const ringLine = new THREE.Line(lineGeo, lineMat)
      ringGroup.add(ringLine)

      // Orbital Satellites / Data Beacon Nodes along ring
      const nodePts: THREE.Vector3[] = []
      for (let i = 0; i < cfg.nodeCount; i++) {
        const theta = (i / cfg.nodeCount) * Math.PI * 2
        nodePts.push(new THREE.Vector3(Math.cos(theta) * cfg.radius, Math.sin(theta) * cfg.radius, 0))
      }
      const nodesGeo = new THREE.BufferGeometry().setFromPoints(nodePts)
      const nodesMat = new THREE.PointsMaterial({
        color: cfg.color,
        size: 0.18,
        transparent: true,
        opacity: Math.min(1, cfg.opacity * 2.5),
        blending: THREE.AdditiveBlending,
      })
      const nodes = new THREE.Points(nodesGeo, nodesMat)
      ringGroup.add(nodes)

      rings.push({
        group: ringGroup,
        speedX: cfg.sx,
        speedY: cfg.sy,
        speedZ: cfg.sz,
        lineGeo,
        lineMat,
        nodesGeo,
        nodesMat,
      })
    })

    // 2e. Subtle Perspective Cyber Matrix Floor in Deep Background
    const gridHelper = new THREE.GridHelper(60, 30, 0x00f2fe, 0x1e293b)
    gridHelper.position.set(0, -14, -10)
    gridHelper.rotation.x = 0.22
    ;(gridHelper.material as THREE.Material).transparent = true
    ;(gridHelper.material as THREE.Material).opacity = 0.12
    scene.add(gridHelper)

    // 3. Responsive Particle Star Field (Forward Warp Drift)
    // 1,500 particles on mobile, 3,500 on desktop (clamped for high 60fps performance)
    const particleCount = isMobileInitial ? 1500 : 3500
    const particleGeo = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const zVelocities = new Float32Array(particleCount)

    const colorA = new THREE.Color(0x00f2fe) // Cyan
    const colorB = new THREE.Color(0x8b5cf6) // Violet
    const colorC = new THREE.Color(0xfbbf24) // Gold
    const colorD = new THREE.Color(0x38bdf8) // Sky blue

    for (let i = 0; i < particleCount; i++) {
      const radius = 7 + Math.random() * 45
      const angle = Math.random() * Math.PI * 2
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80

      zVelocities[i] = 0.04 + Math.random() * 0.075

      const roll = Math.random()
      const c = roll < 0.52 ? colorA : roll < 0.82 ? colorB : roll < 0.94 ? colorD : colorC
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const particleMat = new THREE.PointsMaterial({
      size: isMobileInitial ? 0.08 : 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
    })

    const particleSystem = new THREE.Points(particleGeo, particleMat)
    scene.add(particleSystem)

    // 4. Interactive Cyber Shockwave System on Click / Tap
    const shockwaveGroup = new THREE.Group()
    scene.add(shockwaveGroup)

    const triggerShockwave = (x = 0, y = 0) => {
      const geo = new THREE.BufferGeometry()
      const pts: THREE.Vector3[] = []
      const segs = 48
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0))
      }
      geo.setFromPoints(pts)

      const mat = new THREE.LineBasicMaterial({
        color: 0x00f2fe,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      })

      const mesh = new THREE.Line(geo, mat)
      mesh.position.set(x, y, 2)
      shockwaveGroup.add(mesh)

      shockwavesRef.current.push({
        radius: 1,
        maxRadius: 26,
        opacity: 0.85,
        mesh,
      })
    }

    // Filter out taps/clicks directly targeting form controls
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false
      return !!target.closest('input, button, select, textarea, a, label, form')
    }

    const handleClick = (e: MouseEvent) => {
      if (isInteractiveTarget(e.target)) return
      const halfW = window.innerWidth / 2
      const halfH = window.innerHeight / 2
      const x = ((e.clientX - halfW) / halfW) * 12
      const y = -((e.clientY - halfH) / halfH) * 8
      triggerShockwave(x, y)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        if (isInteractiveTarget(e.target)) return
        const halfW = window.innerWidth / 2
        const halfH = window.innerHeight / 2
        const x = ((e.touches[0].clientX - halfW) / halfW) * 12
        const y = -((e.touches[0].clientY - halfH) / halfH) * 8
        triggerShockwave(x, y)
      }
    }

    window.addEventListener('click', handleClick)
    window.addEventListener('touchstart', handleTouchStart, { passive: true })

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

    // 6. Responsive Resize Handler
    const handleResize = () => {
      const isMobile = window.innerWidth < 768
      camera.fov = isMobile ? 60 : 50
      camera.position.z = isMobile ? 32 : 24
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()

      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(
        isMobile
          ? Math.min(window.devicePixelRatio, 1.5)
          : Math.min(window.devicePixelRatio, 2.0)
      )
    }
    window.addEventListener('resize', handleResize)

    // 7. 60 FPS Render Engine with Visibility Pausing & Lerped Acceleration
    let animId = 0
    let isPaused = false
    let currentSpeed = 1.0
    const posAttr = particleGeo.attributes.position as THREE.BufferAttribute

    const animate = () => {
      if (isPaused) return
      animId = requestAnimationFrame(animate)

      // Smooth acceleration/deceleration lerp
      currentSpeed += (targetSpeedRef.current - currentSpeed) * 0.08

      // Parallax smooth lerp
      camTargetX += (mouseX * 3.5 - camTargetX) * 0.04
      camTargetY += (-mouseY * 2.5 - camTargetY) * 0.04

      camera.position.x = camTargetX
      camera.position.y = camTargetY
      camera.rotation.z = -camTargetX * 0.012
      camera.lookAt(0, 0, 0)

      // Geodesic outer core rotation
      outerMesh.rotation.x += 0.003 * currentSpeed
      outerMesh.rotation.y += 0.0045 * currentSpeed
      outerPoints.rotation.x = outerMesh.rotation.x
      outerPoints.rotation.y = outerMesh.rotation.y

      // Intermediate shield counter-rotation
      midMesh.rotation.x -= 0.004 * currentSpeed
      midMesh.rotation.y -= 0.005 * currentSpeed

      // Crystalline core rotation
      innerMesh.rotation.x += 0.005 * currentSpeed
      innerMesh.rotation.y -= 0.006 * currentSpeed
      innerPoints.rotation.x = innerMesh.rotation.x
      innerPoints.rotation.y = innerMesh.rotation.y

      // Gimbal rings rotation
      rings.forEach((r) => {
        r.group.rotation.x += r.speedX * currentSpeed
        r.group.rotation.y += r.speedY * currentSpeed
        r.group.rotation.z += r.speedZ * currentSpeed
      })

      // Particle forward warp drift
      const positionsArr = posAttr.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3 + 2
        positionsArr[idx] += zVelocities[i] * currentSpeed * 2.0
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

    // Page Visibility API - zero CPU/battery consumption when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true
        cancelAnimationFrame(animId)
      } else {
        if (isPaused) {
          isPaused = false
          animId = requestAnimationFrame(animate)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // WebGL Context Loss Handling (Mobile OS / Background tab recovery)
    const domElement = renderer.domElement
    const handleContextLost = (e: Event) => {
      e.preventDefault()
      isPaused = true
      cancelAnimationFrame(animId)
    }

    const handleContextRestored = () => {
      isPaused = false
      animId = requestAnimationFrame(animate)
    }

    domElement.addEventListener('webglcontextlost', handleContextLost, false)
    domElement.addEventListener('webglcontextrestored', handleContextRestored, false)

    animate()

    // 8. Complete Resource Cleanup on Unmount
    return () => {
      isPaused = true
      cancelAnimationFrame(animId)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      domElement.removeEventListener('webglcontextlost', handleContextLost)
      domElement.removeEventListener('webglcontextrestored', handleContextRestored)

      if (container.contains(domElement)) {
        container.removeChild(domElement)
      }

      outerGeo.dispose()
      outerMat.dispose()
      outerPointsMat.dispose()
      midGeo.dispose()
      midMat.dispose()
      innerGeo.dispose()
      innerMat.dispose()
      innerPointsMat.dispose()
      gridHelper.geometry.dispose()
      ;(gridHelper.material as THREE.Material).dispose()
      particleGeo.dispose()
      particleMat.dispose()

      rings.forEach((r) => {
        r.lineGeo.dispose()
        r.lineMat.dispose()
        if (r.nodesGeo) r.nodesGeo.dispose()
        if (r.nodesMat) r.nodesMat.dispose()
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
