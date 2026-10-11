export function initParticles(dz) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = `
    position:absolute;inset:0;width:100%;height:100%;
    border-radius:inherit;pointer-events:none;z-index:0;opacity:0.5;
  `
  dz.insertBefore(canvas, dz.firstChild)

  const ctx = canvas.getContext('2d')
  let W, H
  let particles = []
  let mouse = { x: -999, y: -999 }
  let rafId

  const PARTICLE_COUNT = 34
  const MAX_DIST = 100
  const MOUSE_REP = 130

  function resize() {
    const r = dz.getBoundingClientRect()
    W = canvas.width = r.width
    H = canvas.height = r.height
  }

  function brandColor() {
    return document.body.classList.contains('dark')
      ? 'rgba(108,192,245,'
      : 'rgba(0,108,181,'
  }

  function makeParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1.4 + Math.random() * 1.4,
    }
  }

  function init() {
    resize()
    particles = Array.from({ length: PARTICLE_COUNT }, makeParticle)
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    const b = brandColor()

    particles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > W) p.vx *= -1
      if (p.y < 0 || p.y > H) p.vy *= -1

      const mdx = p.x - mouse.x
      const mdy = p.y - mouse.y
      const md = Math.sqrt(mdx * mdx + mdy * mdy)
      if (md < MOUSE_REP) {
        const f = (MOUSE_REP - md) / MOUSE_REP * 0.011
        p.vx += (mdx / md) * f
        p.vy += (mdy / md) * f
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (sp > 1.3) { p.vx = p.vx / sp * 1.3; p.vy = p.vy / sp * 1.3 }
      }

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = b + '0.75)'
      ctx.fill()
    })

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < MAX_DIST) {
          const alpha = (1 - d / MAX_DIST) * 0.4
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = b + alpha + ')'
          ctx.lineWidth = 0.8
          ctx.stroke()
        }
      }
    }

    rafId = requestAnimationFrame(draw)
  }

  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect()
    mouse.x = e.clientX - r.left
    mouse.y = e.clientY - r.top
  }

  function onMouseLeave() {
    mouse.x = -999
    mouse.y = -999
  }

  function onResize() {
    resize()
    particles.forEach(p => { p.x = Math.min(p.x, W); p.y = Math.min(p.y, H) })
  }

  dz.addEventListener('mousemove', onMouseMove)
  dz.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('resize', onResize)

  init()
  draw()

  return function cleanup() {
    cancelAnimationFrame(rafId)
    dz.removeEventListener('mousemove', onMouseMove)
    dz.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('resize', onResize)
    canvas.remove()
  }
}
