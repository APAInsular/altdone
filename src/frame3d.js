import gsap from 'gsap'

export function initFrame3D(container, logoUrl) {
  const wrapper = document.createElement('div')
  wrapper.id = 'frame3d-wrapper'

  wrapper.innerHTML = `
    <div id="frame3d-scene">
      <div id="f3d-front" style="
        position:absolute;inset:0;
        backface-visibility:hidden;
        border-radius:18px;
        overflow:hidden;
        transform:translateZ(14px);
        background:var(--surface);
        border:1px solid var(--border);
        display:flex;align-items:center;justify-content:center;
        box-shadow:inset 0 0 40px rgba(74,138,221,0.06);
      ">
        <img
          id="f3d-logo"
          src="${logoUrl}"
          alt="Logo"
          style="width:78%;height:78%;object-fit:contain;display:block;pointer-events:none;transition:filter 0.4s;"
          draggable="false"
        />
      </div>

      <div style="
        position:absolute;inset:0;
        backface-visibility:hidden;
        transform:rotateY(180deg) translateZ(14px);
        border-radius:18px;
        background:var(--brand-muted);
        border:1px solid var(--border);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
      ">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span style="color:var(--brand);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">altdone</span>
      </div>

      <div style="position:absolute;width:28px;height:100%;top:0;left:-14px;transform:rotateY(-90deg) translateZ(0);transform-origin:right center;background:var(--border);border-radius:4px 0 0 4px;"></div>
      <div style="position:absolute;width:28px;height:100%;top:0;right:-14px;transform:rotateY(90deg) translateZ(0);transform-origin:left center;background:var(--border);border-radius:0 4px 4px 0;"></div>
      <div style="position:absolute;width:100%;height:28px;top:-14px;left:0;transform:rotateX(90deg) translateZ(0);transform-origin:center bottom;background:var(--border);"></div>
      <div style="position:absolute;width:100%;height:28px;bottom:-14px;left:0;transform:rotateX(-90deg) translateZ(0);transform-origin:center top;background:var(--border);"></div>

      <div id="f3d-shadow" style="
        position:absolute;bottom:-50px;left:50%;
        transform:translateX(-50%);
        width:160px;height:16px;
        background:rgba(0,0,0,0.13);
        border-radius:50%;
        filter:blur(10px);
        pointer-events:none;
      "></div>
    </div>

    <div id="f3d-hint">Arrastra para girar · doble clic para voltear</div>
  `

  container.insertBefore(wrapper, container.firstChild)

  const scene  = wrapper.querySelector('#frame3d-scene')
  const shadow = wrapper.querySelector('#f3d-shadow')
  const hint   = wrapper.querySelector('#f3d-hint')
  const logo   = wrapper.querySelector('#f3d-logo')

  let rotX = -8, rotY = 22
  let velX = 0, velY = 0
  let isDragging = false
  let lastX, lastY
  let flipped = false
  let hintGone = false
  let frameId

  function applyTransform() {
    scene.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`
    const sy = Math.cos((rotX * Math.PI) / 180)
    shadow.style.transform = `translateX(-50%) scaleX(${Math.max(0.25, sy)})`
    shadow.style.opacity = Math.max(0.03, 0.18 * sy)
  }

  function fadeHint() {
    if (hintGone) return
    hintGone = true
    gsap.to(hint, { opacity: 0, duration: 0.4, onComplete: () => { hint.style.display = 'none' } })
  }

  function onMouseDown(e) {
    isDragging = true
    lastX = e.clientX; lastY = e.clientY
    velX = 0; velY = 0
    scene.style.cursor = 'grabbing'
    fadeHint()
  }

  function onMouseMove(e) {
    if (!isDragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    velY = dx * 0.5
    velX = -dy * 0.5
    rotY += velY
    rotX += velX
    rotX = Math.max(-75, Math.min(75, rotX))
    lastX = e.clientX; lastY = e.clientY
    applyTransform()
  }

  function onMouseUp() {
    isDragging = false
    scene.style.cursor = 'grab'
  }

  function onTouchStart(e) {
    const t = e.touches[0]
    lastX = t.clientX; lastY = t.clientY
    velX = 0; velY = 0
    fadeHint()
  }

  function onTouchMove(e) {
    e.preventDefault()
    const t = e.touches[0]
    const dx = t.clientX - lastX
    const dy = t.clientY - lastY
    velY = dx * 0.5
    velX = -dy * 0.5
    rotY += velY
    rotX += velX
    rotX = Math.max(-75, Math.min(75, rotX))
    lastX = t.clientX; lastY = t.clientY
    applyTransform()
  }

  function onDblClick() {
    flipped = !flipped
    const targetY = rotY + (flipped ? 180 : -180)
    gsap.to({ y: rotY }, {
      y: targetY, duration: 0.65, ease: 'back.out(1.4)',
      onUpdate() { rotY = this.targets()[0].y; applyTransform() }
    })
  }

  function onMouseEnter() {
    if (logo) logo.style.filter = 'brightness(1.08) drop-shadow(0 0 12px rgba(74,138,221,0.3))'
  }

  function onMouseLeave() {
    if (logo) logo.style.filter = ''
  }

  scene.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  scene.addEventListener('touchstart', onTouchStart, { passive: true })
  scene.addEventListener('touchmove', onTouchMove, { passive: false })
  scene.addEventListener('dblclick', onDblClick)
  scene.addEventListener('mouseenter', onMouseEnter)
  scene.addEventListener('mouseleave', onMouseLeave)

  function loop() {
    if (!isDragging) {
      velX *= 0.92
      velY *= 0.92
      rotX += velX
      rotY += velY
      const t = Date.now() * 0.001
      rotY += 0.200
      rotX += Math.sin(t * 0.9) * 0.058
      rotX = Math.max(-75, Math.min(75, rotX))
      applyTransform()
    }
    frameId = requestAnimationFrame(loop)
  }

  applyTransform()
  loop()

  gsap.fromTo(scene,
    { opacity: 0, scale: 0.85, rotateY: -40 },
    { opacity: 1, scale: 1, rotateY: 22, duration: 0.9, ease: 'back.out(1.6)', delay: 0.3 }
  )

  return function cleanup() {
    cancelAnimationFrame(frameId)
    scene.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    scene.removeEventListener('touchstart', onTouchStart)
    scene.removeEventListener('touchmove', onTouchMove)
    scene.removeEventListener('dblclick', onDblClick)
    scene.removeEventListener('mouseenter', onMouseEnter)
    scene.removeEventListener('mouseleave', onMouseLeave)
    wrapper.remove()
  }
}
