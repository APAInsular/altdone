import gsap from 'gsap'

/* ── Scroll progress bar ── */
export function initScrollProgress() {
  const bar = document.createElement('div')
  bar.className = 'scroll-progress'
  document.body.appendChild(bar)

  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
  }

  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  update()

  return () => {
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    bar.remove()
  }
}

/* ── Magnetic hover glow ── */
export function initMagneticGlow() {
  const targets = document.querySelectorAll('.dropzone:not([data-glow]), .editor-picker:not([data-glow])')
  const cleanups = []

  targets.forEach(target => {
    target.setAttribute('data-glow', '1')
    const glow = document.createElement('div')
    glow.className = 'magnetic-glow'
    target.appendChild(glow)

    function onMove(e) {
      const r = target.getBoundingClientRect()
      gsap.to(glow, { x: e.clientX - r.left, y: e.clientY - r.top, opacity: 1, duration: 0.28, ease: 'power2.out' })
      gsap.to(target, {
        rotateX: ((e.clientY - r.top) / r.height - 0.5) * -3,
        rotateY: ((e.clientX - r.left) / r.width - 0.5) * 3,
        duration: 0.28, ease: 'power2.out', transformPerspective: 700,
      })
    }

    function onLeave() {
      gsap.to(glow, { opacity: 0, duration: 0.25, ease: 'power2.out' })
      gsap.to(target, { rotateX: 0, rotateY: 0, duration: 0.35, ease: 'power3.out' })
    }

    target.addEventListener('mousemove', onMove)
    target.addEventListener('mouseleave', onLeave)
    cleanups.push(() => {
      target.removeEventListener('mousemove', onMove)
      target.removeEventListener('mouseleave', onLeave)
      glow.remove()
    })
  })

  return () => cleanups.forEach(fn => fn())
}

/* ── Button light sweep (event delegation) ── */
export function initSweep() {
  function ensureSweep(btn) {
    let sweep = btn.querySelector('.btn-sweep')
    if (!sweep) {
      sweep = document.createElement('span')
      sweep.className = 'btn-sweep'
      btn.appendChild(sweep)
    }
    return sweep
  }

  function playSweep(btn) {
    const sweep = ensureSweep(btn)
    gsap.killTweensOf(sweep)
    gsap.fromTo(sweep,
      { x: '-160%', opacity: 0 },
      { x: '190%', opacity: 1, duration: 0.65, ease: 'power2.out',
        onComplete: () => gsap.set(sweep, { opacity: 0, x: '-160%' }) }
    )
  }

  function onEnter(e) {
    const btn = e.target.closest('.btn, .preset-chip, .nav-tab')
    if (btn) playSweep(btn)
  }

  function onLeave(e) {
    const btn = e.target.closest('.btn, .preset-chip, .nav-tab')
    if (!btn) return
    const sweep = ensureSweep(btn)
    gsap.killTweensOf(sweep)
    gsap.set(sweep, { opacity: 0, x: '-160%' })
  }

  document.addEventListener('mouseenter', onEnter, true)
  document.addEventListener('mouseleave', onLeave, true)

  // Pre-inject sweep spans into existing elements
  document.querySelectorAll('.btn, .preset-chip, .nav-tab').forEach(ensureSweep)

  return () => {
    document.removeEventListener('mouseenter', onEnter, true)
    document.removeEventListener('mouseleave', onLeave, true)
  }
}

/* ── Scroll reveal with IntersectionObserver ── */
export function initScrollReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const el = entry.target
      el.classList.add('revealed')
      gsap.to(el, { opacity: 1, y: 0, duration: 0.48, ease: 'power3.out', clearProps: 'transform' })
      io.unobserve(el)
    })
  }, { threshold: 0.1 })

  function observe() {
    document.querySelectorAll(
      '.image-card:not(.revealed), .presets-card:not(.revealed), .editor-result:not(.revealed)'
    ).forEach(el => {
      if (!el.classList.contains('reveal')) el.classList.add('reveal')
      io.observe(el)
    })
  }

  observe()

  const mo = new MutationObserver(observe)
  mo.observe(document.getElementById('root') || document.body, { childList: true, subtree: true })

  return () => { io.disconnect(); mo.disconnect() }
}

/* ── Entry animation (one-time) ── */
export function initEntryAnimation() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
  tl.fromTo('nav',
    { opacity: 0, y: -22 },
    { opacity: 1, y: 0, duration: 0.5 }
  ).fromTo('.opt-hero',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.55 },
    '-=0.2'
  )
}

/* ── Dark mode toggle with GSAP ── */
export function toggleDark(isDark, themeBtn, overlay) {
  if (!themeBtn || !overlay) {
    document.body.classList.toggle('dark', isDark)
    return
  }

  const sunIcon  = themeBtn.querySelector('.theme-icon--sun')
  const moonIcon = themeBtn.querySelector('.theme-icon--moon')

  if (isDark) {
    const tl = gsap.timeline()
    tl.to(themeBtn, { rotate: 360, scale: 1.2, duration: 0.45, ease: 'back.out(2)' })
      .to(themeBtn, { scale: 1, duration: 0.2, ease: 'power2.out' }, '-=0.1')

    if (sunIcon)  gsap.to(sunIcon,  { opacity: 0, rotation: 90,  scale: 0.4, duration: 0.3, ease: 'power2.in' })
    if (moonIcon) gsap.fromTo(moonIcon,
      { opacity: 0, rotation: -90, scale: 0.4 },
      { opacity: 1, rotation: 0,   scale: 1,   duration: 0.35, ease: 'back.out(1.5)', delay: 0.15 }
    )

    gsap.set(overlay, { opacity: 0, background: '#0e0e14' })
    gsap.to(overlay, {
      opacity: 1, duration: 0.22, ease: 'power2.in',
      onComplete: () => {
        document.body.classList.add('dark')
        gsap.to(overlay, { opacity: 0, duration: 0.35, ease: 'power2.out' })
      }
    })

    spawnStars(themeBtn)
  } else {
    const tl = gsap.timeline()
    tl.to(themeBtn, { rotate: -180, scale: 1.2, duration: 0.4, ease: 'back.out(2)' })
      .to(themeBtn, { scale: 1, rotate: 0, duration: 0.2, ease: 'power2.out' }, '-=0.1')

    if (moonIcon) gsap.to(moonIcon, { opacity: 0, rotation: -90, scale: 0.4, duration: 0.3, ease: 'power2.in' })
    if (sunIcon)  gsap.fromTo(sunIcon,
      { opacity: 0, rotation: 90, scale: 0.4 },
      { opacity: 1, rotation: 0,  scale: 1,  duration: 0.35, ease: 'back.out(1.5)', delay: 0.15 }
    )

    gsap.set(overlay, { opacity: 0, background: '#ffffff' })
    gsap.to(overlay, {
      opacity: 0.6, duration: 0.2, ease: 'power2.in',
      onComplete: () => {
        document.body.classList.remove('dark')
        gsap.to(overlay, {
          opacity: 0, duration: 0.35, ease: 'power2.out',
          onComplete: () => gsap.set(overlay, { background: '#0e0e14' })
        })
      }
    })
  }
}

/* ── Toast notification ── */
export function showToast(message) {
  let stack = document.querySelector('.toast-stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.className = 'toast-stack'
    document.body.appendChild(stack)
  }

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.innerHTML = `<span class="toast-dot"></span><span>${String(message).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>`
  stack.appendChild(toast)

  gsap.fromTo(toast, { opacity: 0, y: -12, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.6)' })
  setTimeout(() => {
    gsap.to(toast, { opacity: 0, y: -10, scale: 0.97, duration: 0.25, ease: 'power2.in', onComplete: () => toast.remove() })
  }, 2600)
}

/* ── Confetti burst ── */
export function confettiBurst(originEl) {
  if (!originEl) return
  const rect = originEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const colors = ['#4a8add', '#4f37c8', '#7db7df', '#1a8a55', '#fde68a', '#f472b6']
  const pieces = 28

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    piece.style.left = `${cx}px`
    piece.style.top  = `${cy}px`
    piece.style.background = colors[i % colors.length]
    document.body.appendChild(piece)

    const angle = (Math.PI * 2 * i) / pieces
    const dist  = 70 + Math.random() * 95
    gsap.fromTo(piece,
      { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 },
      {
        x: Math.cos(angle) * dist, y: Math.sin(angle) * dist,
        opacity: 0, scale: 0.25, rotate: 360 + Math.random() * 360,
        duration: 0.9, ease: 'power3.out', onComplete: () => piece.remove()
      }
    )
  }
}

/* ── Star burst (dark mode toggle) ── */
function spawnStars(origin) {
  const rect = origin.getBoundingClientRect()
  const cx = rect.left + rect.width  / 2 + window.scrollX
  const cy = rect.top  + rect.height / 2 + window.scrollY
  const colors = ['#6aa3f0', '#c084fc', '#f0abfc', '#a5f3fc', '#fde68a']
  const count = 10

  for (let i = 0; i < count; i++) {
    const star = document.createElement('div')
    star.style.cssText = `
      position:absolute;width:6px;height:6px;border-radius:50%;
      background:${colors[i % colors.length]};
      left:${cx}px;top:${cy}px;pointer-events:none;z-index:9998;
    `
    document.body.appendChild(star)
    const angle = (i / count) * Math.PI * 2
    const dist  = 40 + Math.random() * 50
    gsap.fromTo(star,
      { x: 0, y: 0, opacity: 1, scale: 1 },
      {
        x: Math.cos(angle) * dist, y: Math.sin(angle) * dist,
        opacity: 0, scale: 0,
        duration: 0.6 + Math.random() * 0.3, ease: 'power2.out',
        onComplete: () => star.remove()
      }
    )
  }
}
