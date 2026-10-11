import { useState, useCallback, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import './index.css'
import logoAzul from './assets/platita-altdone-azul.svg'
import logoBlanco from './assets/platita-altdone-blanco.svg'
import { Icono } from './iconos.jsx'
import { initParticles } from './particles.js'
import {
  initScrollProgress,
  initMagneticGlow,
  initSweep,
  initScrollReveal,
  initEntryAnimation,
  toggleDark,
  showToast,
  confettiBurst,
} from './animations.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function compressToWebP(file, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url)
        if (!blob) return reject(new Error('Canvas toBlob failed'))
        resolve(blob)
      }, 'image/webp', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Estadísticas (Umami sin cookies) y enlaces ─────────────────────────────
// Si Umami no carga (bloqueador, local), la app sigue igual
function medir(evento, datos) {
  try { window.umami?.track(evento, datos) } catch { /* sin estadísticas */ }
}

const PLATITA = 'https://platita.es'
const utm = contenido => `?utm_source=altdone&utm_medium=herramienta&utm_content=${contenido}`

// Aviso junto a cada zona de subida: qué sale del navegador y a quién
function AvisoIA({ children }) {
  return (
    <p className="aviso-ia">
      {children} No guardamos tus imágenes; no subas fotos con datos personales de otras personas.{' '}
      <a href={`${PLATITA}/privacidad/#platita-altdone-altdoneplatitaes`} target="_blank" rel="noopener">Cómo tratamos tus datos</a>
    </p>
  )
}

// ─── API ─────────────────────────────────────────────────────────────────────
// El servidor fija modelos y parámetros; aquí solo se envían la imagen y las instrucciones.
// Antes de usar la IA se verifica una vez con Turnstile y el servidor da una cookie de sesión.
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let sesionPendiente = null

function cargarTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SRC
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => reject(new Error('No se pudo cargar la verificación de seguridad.'))
    document.head.appendChild(script)
  })
}

async function verificarPersona() {
  const cfg = await fetch('/api/config').then(r => r.json())
  if (!cfg.turnstileSiteKey) throw new Error('La verificación de seguridad no está configurada.')
  const turnstile = await cargarTurnstile()

  // Contenedor fijo: Turnstile solo se muestra si necesita que interactúes
  let caja = document.getElementById('verificacion')
  if (!caja) {
    caja = document.createElement('div')
    caja.id = 'verificacion'
    caja.className = 'verificacion'
    document.body.appendChild(caja)
  }

  const token = await new Promise((resolve, reject) => {
    const id = turnstile.render(caja, {
      sitekey: cfg.turnstileSiteKey,
      action: 'sesion',
      appearance: 'interaction-only',
      language: 'es',
      callback: t => { resolve(t); setTimeout(() => turnstile.remove(id), 0) },
      'error-callback': () => { turnstile.remove(id); reject(new Error('No hemos podido verificar que eres una persona. Recarga la página.')) },
    })
  })

  const res = await fetch('/api/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo verificar la seguridad.')
}

function asegurarSesion(forzar = false) {
  if (forzar || !sesionPendiente) {
    sesionPendiente = verificarPersona().catch(err => { sesionPendiente = null; throw err })
  }
  return sesionPendiente
}

async function llamarApi(ruta, cuerpo) {
  await asegurarSesion()
  const enviar = () => fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  let res = await enviar()
  // Sesión caducada: se verifica de nuevo una sola vez
  if (res.status === 401) {
    await asegurarSesion(true)
    res = await enviar()
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

function analyzeSEO(imagen, tipo) {
  return llamarApi('/api/seo', { imagen, tipo })
}

async function editWithGemini(imagen, tipo, instrucciones) {
  const data = await llamarApi('/api/editar', { imagen, tipo, instrucciones })
  return { b64: data.imagen, mime: data.tipo }
}

// ─── Compare Slider ───────────────────────────────────────────────────────────
function CompareSlider({ originalSrc, editedSrc }) {
  const wrapRef = useRef()
  const afterRef = useRef()
  const lineRef = useRef()
  const handleRef = useRef()

  function setPos(clientX) {
    const r = wrapRef.current.getBoundingClientRect()
    const pct = Math.min(Math.max((clientX - r.left) / r.width * 100, 0), 100)
    afterRef.current.style.width = pct + '%'
    lineRef.current.style.left   = pct + '%'
    handleRef.current.style.left = pct + '%'
  }

  function onPointerDown(e) { wrapRef.current.setPointerCapture(e.pointerId); setPos(e.clientX) }
  function onPointerMove(e) { if (e.buttons !== 1) return; setPos(e.clientX) }
  function onPointerUp(e)   { wrapRef.current.releasePointerCapture(e.pointerId) }

  return (
    <div
      className="compare-wrap"
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <img src={originalSrc} alt="Imagen original" />
      <div className="compare-after" ref={afterRef}>
        <img src={editedSrc} alt="Imagen editada" />
      </div>
      <span className="compare-label compare-label-before">Antes</span>
      <span className="compare-label compare-label-after">Después</span>
      <span className="compare-line" ref={lineRef}></span>
      <span className="compare-handle" ref={handleRef}></span>
    </div>
  )
}

// ─── SEO Field (copiable) ─────────────────────────────────────────────────────
function SEOField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    medir('copiar_campo', { campo: label })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="seo-field">
      <span className="seo-label">{label}</span>
      <div className="seo-value" onClick={copy}>
        <span>{value}</span>
        <span className="seo-copy">{copied ? <><Icono nombre="check" /> Copiado</> : <><Icono nombre="copiar" /> Copiar</>}</span>
      </div>
    </div>
  )
}

// ─── Image Card ───────────────────────────────────────────────────────────────
function ImageCard({ item, onDownload, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const cardRef = useRef()
  const previewUrl = item.webpBlob
    ? URL.createObjectURL(item.webpBlob)
    : URL.createObjectURL(item.file)
  const savings = item.webpSize
    ? Math.round((1 - item.webpSize / item.originalSize) * 100)
    : null

  const statusLabel = {
    pending: 'Pendiente', compressing: 'Comprimiendo…',
    analyzing: 'Analizando SEO…', done: 'Listo', error: 'Error',
  }

  const badgeClass = {
    pending: 'badge-pending', compressing: 'badge-processing',
    analyzing: 'badge-processing', done: 'badge-done', error: 'badge-error',
  }

  return (
    <div className={`image-card ${item.status}`} ref={cardRef}>
      <img className="image-thumb" src={previewUrl} alt={item.originalName} />
      <div className="image-info" style={{ flex: 1, minWidth: 0 }}>
        <div className="image-name">{item.originalName}</div>
        <div className="image-meta">
          <span className="image-size">
            {formatBytes(item.originalSize)}
            {item.webpSize && ` → ${formatBytes(item.webpSize)}`}
            {savings !== null && <span style={{ color: 'var(--green-fg)', fontWeight: 700 }}> −{savings}%</span>}
          </span>
          <span className={`badge ${badgeClass[item.status] || 'badge-pending'}`}>
            {statusLabel[item.status] || item.status}
          </span>
        </div>
        {item.error && (
          <div style={{ fontSize: 11.5, color: 'var(--red-fg)', marginTop: 3 }}>{item.error}</div>
        )}
        {item.seo && (
          <button
            className="btn btn-suave btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            <Icono nombre={expanded ? 'arriba' : 'abajo'} />
            {expanded ? 'Ocultar datos SEO' : 'Ver datos SEO'}
          </button>
        )}
        {expanded && item.seo && (
          <div className="seo-section">
            <SEOField label="Título SEO"       value={item.seo.title} />
            <SEOField label="Alt text"         value={item.seo.alt} />
            <SEOField label="Nombre archivo"   value={item.seo.filename} />
            <SEOField label="Descripción"      value={item.seo.description} />
          </div>
        )}
      </div>
      {item.status === 'done' && (
        <button className="btn btn-suave btn-icono" onClick={() => onDownload(item)} aria-label={`Descargar ${item.seo?.filename || item.originalName}`}>
          <Icono nombre="descargar" />
        </button>
      )}
      <button className="remove-btn" aria-label={`Quitar ${item.originalName}`} onClick={() => onRemove(item.id)}><Icono nombre="cerrar" /></button>
    </div>
  )
}

// ─── Optimizador Tab ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Fondo blanco',      prompt: 'Elimina el fondo y reemplázalo con un fondo blanco limpio y uniforme' },
  { label: 'Sin fondo',         prompt: 'Elimina completamente el fondo dejando solo el sujeto principal con transparencia' },
  { label: 'Recortar sujeto',   prompt: 'Recorta y centra perfectamente el sujeto principal de la imagen' },
  { label: 'Mejorar calidad',   prompt: 'Mejora la nitidez, contraste y colores de la imagen sin cambiar su contenido' },
  { label: 'Estilo profesional',prompt: 'Aplica un look profesional de e-commerce: iluminación uniforme, fondo neutro, sujeto centrado' },
  { label: 'Color vibrante',    prompt: 'Aumenta la saturación y viveza de los colores manteniendo un aspecto natural' },
]

function OptimizerTab() {
  const [items, setItems]         = useState([])
  const [processing, setProcessing] = useState(false)
  const [quality, setQuality]     = useState(82)
  const [drag, setDrag]           = useState(false)
  const dropzoneRef               = useRef()
  const processBtnRef             = useRef()
  const fileInputRef              = useRef()

  // Init particle network
  useEffect(() => {
    if (!dropzoneRef.current) return
    const cleanup = initParticles(dropzoneRef.current)
    return cleanup
  }, [])

  const addFiles = useCallback(newFiles => {
    const images = Array.from(newFiles).filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    setItems(prev => {
      const added = images
        .filter(f => !prev.find(x => x.originalName === f.name && x.originalSize === f.size))
        .map(f => ({
          id: Math.random().toString(36).slice(2),
          file: f, status: 'pending',
          originalSize: f.size, originalName: f.name,
          webpBlob: null, webpSize: null, seo: null, error: null,
        }))
      return [...prev, ...added]
    })
  }, [])

  const processAll = async () => {
    setProcessing(true)
    const pending = items.filter(i => i.status === 'pending')

    let correctas = 0
    for (const item of pending) {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'compressing' } : x))
      try {
        const webpBlob = await compressToWebP(item.file, quality / 100)
        const webpB64  = await blobToBase64(webpBlob)
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'analyzing', webpBlob, webpSize: webpBlob.size } : x))
        const seo = await analyzeSEO(webpB64, 'image/webp')
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', seo } : x))
        correctas++
      } catch (err) {
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: err.message } : x))
      }
    }

    medir('procesar', { imagenes: pending.length, correctas, errores: pending.length - correctas })
    showToast('Imágenes procesadas correctamente')
    if (processBtnRef.current) confettiBurst(processBtnRef.current)
    setProcessing(false)
  }

  const downloadItem = item => {
    if (!item.webpBlob) return
    medir('descargar', { origen: 'optimizador' })
    const name = item.seo?.filename || item.originalName.replace(/\.[^.]+$/, '') + '.webp'
    downloadBlob(item.webpBlob, name)
  }

  const downloadAll = () => items.filter(i => i.status === 'done').forEach(downloadItem)

  const removeItem = id => setItems(prev => prev.filter(x => x.id !== id))
  const reset      = () => setItems([])

  const doneCount    = items.filter(i => i.status === 'done').length
  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <>
      {/* ── Hero: frame 3D + dropzone ── */}
      <div className="opt-hero">
        <div className="opt-hero-left">
          <div className="page-header">
            <h1>Optimiza tus imágenes para WordPress</h1>
            <p>Sube tus imágenes y te las devolvemos en WebP, con título, texto alternativo, nombre de archivo y descripción listos para pegar.</p>
          </div>
        </div>

        <div className="opt-hero-right">
          <div
            className={`dropzone${drag ? ' drag-over' : ''}`}
            ref={dropzoneRef}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }}
            />
            <div className="hexagono"><Icono nombre="subir" /></div>
            <div className="drop-title">Arrastra tus imágenes aquí</div>
            <div className="drop-hint">PNG, JPG, WEBP o GIF · varias a la vez · máx. 4 MB cada una</div>
            <span className="drop-cta">o haz clic para elegirlas</span>
          </div>
          <AvisoIA>La conversión a WebP se hace en tu navegador; para los datos SEO, la imagen se envía a Anthropic (Claude).</AvisoIA>
        </div>
      </div>

      {/* ── Lista de imágenes ── */}
      {items.length > 0 && (
        <div id="listSection">
          <div className="file-counter">
            <Icono nombre="archivo" />
            <span>{items.length === 1 ? '1 imagen' : `${items.length} imágenes`}</span>
          </div>

          <div className="image-list">
            {items.map(item => (
              <ImageCard key={item.id} item={item} onDownload={downloadItem} onRemove={removeItem} />
            ))}
          </div>
        </div>
      )}

      {/* ── Acciones ── */}
      {items.length > 0 && (
        <div className="actions">
          {pendingCount > 0 && (
            <button
              className="btn btn-primary"
              ref={processBtnRef}
              onClick={processAll}
              disabled={processing}
            >
              <Icono nombre="procesar" />
              {processing ? 'Procesando…' : 'Procesar imágenes'}
            </button>
          )}

          {doneCount > 1 && (
            <button className="btn btn-secundario" onClick={downloadAll}>
              <Icono nombre="descargar" />
              Descargar todas ({doneCount})
            </button>
          )}

          <button className="btn btn-secundario" onClick={reset}>
            <Icono nombre="papelera" />
            Vaciar la lista
          </button>

          <div className="quality-control">
            Calidad WebP
            <input
              type="range" min={50} max={100} value={quality}
              onChange={e => setQuality(+e.target.value)}
            />
            <strong>{quality}%</strong>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Editor IA Tab ────────────────────────────────────────────────────────────
function EditorTab() {
  const [file, setFile]               = useState(null)
  const [previewSrc, setPreviewSrc]   = useState(null)
  const [prompt, setPrompt]           = useState('')
  const [activePreset, setActivePreset] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)
  const [seo, setSeo]                 = useState(null)
  const [analyzingSeo, setAnalyzingSeo] = useState(false)
  const editorPickerRef               = useRef()
  const fileInputRef                  = useRef()

  const setImage = files => {
    const f = Array.from(files).find(f => f.type.startsWith('image/'))
    if (!f) return
    setFile(f)
    setResult(null); setSeo(null); setError(null)
    setPreviewSrc(URL.createObjectURL(f))
  }

  const selectPreset = (p) => {
    setActivePreset(p.label)
    setPrompt(p.prompt)
  }

  const edit = async () => {
    if (!file || !prompt.trim()) return
    setLoading(true); setError(null); setResult(null); setSeo(null)
    try {
      const b64 = await fileToBase64(file)
      const { b64: resultB64, mime: resultMime } = await editWithGemini(b64, file.type, prompt)

      const byteChars = atob(resultB64)
      const byteArr = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
      const blob = new Blob([byteArr], { type: resultMime })

      const webpBlob = await compressToWebP(blob)
      const webpB64  = await blobToBase64(webpBlob)
      setResult({ blob: webpBlob, src: 'data:image/webp;base64,' + webpB64 })
      medir('editar', { ajuste: activePreset || 'propio', resultado: 'ok' })
    } catch (err) {
      setError(err.message)
      medir('editar', { ajuste: activePreset || 'propio', resultado: 'error' })
    }
    setLoading(false)
  }

  const getSEO = async () => {
    if (!result) return
    setAnalyzingSeo(true); setSeo(null)
    try {
      const b64  = await blobToBase64(result.blob)
      const data = await analyzeSEO(b64, 'image/webp')
      setSeo(data)
      medir('seo_editor', { resultado: 'ok' })
    } catch (err) {
      setSeo({ error: err.message })
    }
    setAnalyzingSeo(false)
  }

  const download = () => {
    if (!result) return
    const name = seo?.filename || (file?.name.replace(/\.[^.]+$/, '') || 'imagen') + '-editada.webp'
    downloadBlob(result.blob, name)
    medir('descargar', { origen: 'editor' })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Edita una imagen con IA</h1>
        <p>Elige un ajuste o describe el cambio, compara el antes y el después y descárgala en WebP con sus datos SEO.</p>
      </div>

      <div className="editor-layout">
        {/* Columna izquierda: picker + presets */}
        <div className="editor-left">
          <div
            className={`editor-picker${file ? ' has-image' : ''}`}
            ref={editorPickerRef}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { setImage(e.target.files); e.target.value = '' }}
            />
            {file ? (
              <img src={previewSrc} alt={file.name} />
            ) : (
              <>
                <div className="hexagono"><Icono nombre="imagen" /></div>
                <div className="picker-title">Elige una imagen</div>
                <div className="picker-hint">PNG, JPG, WEBP o GIF · máx. 4 MB</div>
              </>
            )}
          </div>

          {file && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              {file.name} &nbsp;·&nbsp; {formatBytes(file.size)}
              &nbsp;·&nbsp;
              <button
                className="btn btn-suave btn-sm"
                onClick={() => { setFile(null); setPreviewSrc(null); setResult(null); setSeo(null) }}
              >
                Cambiar
              </button>
            </div>
          )}

          <AvisoIA>Para editarla, la imagen y tus instrucciones se envían a Google (Gemini); si pides los datos SEO, a Anthropic (Claude).</AvisoIA>

          <div className="presets-card">
            <div className="presets-label">Ajustes rápidos</div>
            <div className="presets-list" id="presetsList">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  className={`preset-chip${activePreset === p.label ? ' active' : ''}`}
                  data-prompt={p.prompt}
                  onClick={() => selectPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              id="promptTextarea"
              className="prompt-textarea"
              placeholder="Por ejemplo: quita el fondo y céntrala sobre blanco"
              rows={4}
              value={prompt}
              maxLength={500}
              onChange={e => setPrompt(e.target.value)}
            />
            {error && (
              <div style={{ color: 'var(--red-fg)', fontSize: 13, marginBottom: 10 }}>{error}</div>
            )}
            <button
              className="btn btn-primary btn-full"
              id="editBtn"
              onClick={edit}
              disabled={!file || !prompt.trim() || loading}
            >
              <Icono nombre="varita" />
              {loading ? 'Editando…' : 'Editar imagen'}
            </button>
          </div>
        </div>

        {/* Columna derecha: resultado */}
        <div className="editor-result" id="editorResult">
          {loading && (
            <div className="result-loading">
              <div className="spinner" />
              <p>Procesando imagen…</p>
            </div>
          )}

          {!result && !loading && (
            <p className="result-placeholder">Aquí verás el antes y el después</p>
          )}

          {result && !loading && (
            <>
              <div className="result-image-wrap">
                <CompareSlider originalSrc={previewSrc} editedSrc={result.src} />
              </div>

              <div className="result-actions">
                <button className="btn btn-primary" onClick={download}>
                  <Icono nombre="descargar" />
                  Descargar WebP
                </button>
                <button className="btn btn-secundario" onClick={getSEO} disabled={analyzingSeo}>
                  <Icono nombre="buscar" />
                  {analyzingSeo ? 'Analizando…' : 'Obtener datos SEO'}
                </button>
              </div>

              {seo && (
                <div className="result-meta">
                  {seo.error ? (
                    <p style={{ color: 'var(--red-fg)', fontSize: 13 }}>{seo.error}</p>
                  ) : (
                    <>
                      <div className="result-meta-row">
                        <span className="result-meta-label">Alt text</span>
                        <span className="result-meta-value">{seo.alt}</span>
                      </div>
                      <div className="result-meta-row">
                        <span className="result-meta-label">Nombre de archivo</span>
                        <span className="result-meta-value">{seo.filename}</span>
                      </div>
                      <div className="result-meta-row">
                        <span className="result-meta-label">Título SEO</span>
                        <span className="result-meta-value">{seo.title}</span>
                      </div>
                      <div className="result-meta-row">
                        <span className="result-meta-label">Descripción</span>
                        <span className="result-meta-value">{seo.description}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab]     = useState('optimizer')
  const [isDark, setIsDark] = useState(false)
  const themeBtnRef       = useRef()
  const overlayRef        = useRef()
  const isFirstDarkRef    = useRef(true)

  // Animaciones globales al montar
  useEffect(() => {
    initEntryAnimation()
    const cleanupProgress = initScrollProgress()
    const cleanupSweep    = initSweep()
    const cleanupReveal   = initScrollReveal()
    return () => {
      cleanupProgress()
      cleanupSweep()
      cleanupReveal()
    }
  }, [])

  // Magnetic glow tras cada render (tab puede cambiar)
  useEffect(() => {
    initMagneticGlow()
  })

  // Dark mode con GSAP (omitir en primer render)
  useEffect(() => {
    if (isFirstDarkRef.current) { isFirstDarkRef.current = false; return }
    toggleDark(isDark, themeBtnRef.current, overlayRef.current)
  }, [isDark])

  // Animación de entrada para el tab activo al cambiar
  const isFirstTabRef = useRef(true)
  useEffect(() => {
    if (isFirstTabRef.current) { isFirstTabRef.current = false; return }
    const page = document.querySelector('.page.active')
    if (page) {
      gsap.fromTo(page, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' })
    }
  }, [tab])

  return (
    <>
      <div id="darkOverlay" ref={overlayRef} />

      <nav>
        <a className="logo" href="/">
          <img className="logo-claro" src={logoAzul} alt="Platita AltDone" />
          <img className="logo-oscuro" src={logoBlanco} alt="Platita AltDone" />
        </a>

        <div className="nav-pills">
          <a
            className={`nav-tab${tab === 'optimizer' ? ' active' : ''}`}
            href="#"
            id="tab-opt"
            onClick={e => { e.preventDefault(); setTab('optimizer'); medir('pestana', { pestana: 'optimizador' }) }}
          >
            Optimizador
          </a>
          <a
            className={`nav-tab${tab === 'editor' ? ' active' : ''}`}
            href="#"
            id="tab-ed"
            onClick={e => { e.preventDefault(); setTab('editor'); medir('pestana', { pestana: 'editor' }) }}
          >
            Editor IA
          </a>
        </div>

        <button
          className="theme-btn"
          ref={themeBtnRef}
          id="themeBtn"
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          onClick={() => setIsDark(d => !d)}
        >
          <span className="theme-icon theme-icon--sun"><Icono nombre="sol" /></span>
          <span className="theme-icon theme-icon--moon"><Icono nombre="luna" /></span>
        </button>
      </nav>

      <main>
        <div className={`page${tab === 'optimizer' ? ' active' : ''}`} id="page-opt">
          <OptimizerTab />
        </div>
        <div className={`page${tab === 'editor' ? ' active' : ''}`} id="page-ed">
          <EditorTab />
        </div>
      </main>

      <footer className="pie">
        <div className="pie-dentro">
          <a className="pie-marca" href={`${PLATITA}/${utm('pie')}`}>
            <img src={logoBlanco} alt="Platita AltDone" />
          </a>
          <p className="pie-texto">
            Una herramienta de <a href={`${PLATITA}/${utm('pie')}`}>Platita Software</a>, en Canarias.
          </p>
          <ul className="pie-legal">
            <li><a href={`${PLATITA}/aviso-legal/`}>Aviso legal</a></li>
            <li><a href={`${PLATITA}/privacidad/#platita-altdone-altdoneplatitaes`}>Privacidad</a></li>
            <li><a href={`${PLATITA}/cookies/`}>Cookies</a></li>
          </ul>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
