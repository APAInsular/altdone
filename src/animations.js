// Si el sistema pide reducir el movimiento, no se anima nada (WCAG 2.3.3)
export const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── Aviso flotante: región viva y 6 s para poder leerlo ── */
export function showToast(message) {
  let stack = document.querySelector('.toast-stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.className = 'toast-stack'
    // Región viva: los lectores de pantalla leen cada aviso nuevo
    stack.setAttribute('role', 'status')
    stack.setAttribute('aria-live', 'polite')
    document.body.appendChild(stack)
  }

  const toast = document.createElement('div')
  toast.className = 'toast'
  const punto = document.createElement('span')
  punto.className = 'toast-dot'
  const texto = document.createElement('span')
  texto.textContent = message
  toast.append(punto, texto)
  stack.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('toast--sale')
    setTimeout(() => toast.remove(), movimientoReducido() ? 0 : 250)
  }, 6000)
}
