import { useState, useCallback, useRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import './index.css'
import logoUrl from './assets/logo.svg'
import { initFrame3D } from './frame3d.js'
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

// ─── Constants ───────────────────────────────────────────────────────────────
const ANTHROPIC_ENDPOINT = '/api/anthropic'
const GEMINI_ENDPOINT    = '/api/gemini'

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

// ─── API calls ───────────────────────────────────────────────────────────────
function apiHeaders() {
  return { 'Content-Type': 'application/json' }
}

async function callAnthropic(body) {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
  return res.json()
}

async function callGemini(body, model = 'gemini-2.5-flash-image') {
  return fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ ...body, model }),
  })
}

async function analyzeSEO(imageBase64, mimeType) {
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: `Mira esta imagen con atención. NO uses el nombre del archivo. Describe visualmente lo que ves y genera SEO en español basado ÚNICAMENTE en el contenido visual.

Responde SOLO con este JSON sin markdown ni texto adicional:
{
  "filename": "[describe-lo-que-ves-en-la-imagen].webp",
  "title": "[Título SEO describiendo el contenido visual real]",
  "alt": "[Descripción accesible de lo que aparece en la imagen]",
  "description": "[2-3 frases sobre el contenido visual con keywords]"
}

Ejemplo: si ves una silla de oficina negra, el filename sería silla-oficina-negra-ergonomica.webp, nunca el nombre técnico del archivo.` }
      ]
    }]
  })
  const text = data.content?.[0]?.text || '{}'
  console.log('[SEO] Respuesta raw de Haiku:', text)
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : JSON.parse(clean)
  } catch (e) {
    console.error('[SEO] Error parseando JSON:', e, 'Texto:', text)
    return { filename: 'imagen.webp', title: 'Sin título', alt: 'Imagen', description: '' }
  }
}

async function editWithGemini(imageBase64, mimeType, userPrompt) {
  const promptCompleto = `Edita esta imagen siguiendo estas instrucciones: ${userPrompt}

IMPORTANTE: Debes devolver la imagen modificada. Genera y devuelve la imagen editada como resultado principal.`

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: promptCompleto }
      ]
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  }

  const response = await callGemini(body)
  console.log('[gemini] Status:', response.status)
  const data = await response.json()
  console.log('[gemini] Data completa:', JSON.stringify(data).slice(0, 2000))

  const candidates = data.candidates || []
  console.log('[gemini] Candidates:', candidates.length)
  candidates.forEach((c, i) => {
    console.log(`[gemini] Candidate ${i} parts:`,
      c.content?.parts?.map(p => p.inlineData ? 'IMAGE' : p.text ? 'TEXT:' + p.text.slice(0, 50) : 'OTHER')
    )
  })

  const allParts = data.candidates?.[0]?.content?.parts || []
  const imgPart = allParts.find(p => p.inlineData || p.inline_data)
  console.log('[gemini] Imagen encontrada:', !!imgPart)

  if (!imgPart) throw new Error('Gemini no devolvió imagen')
  const imgData = imgPart.inlineData || imgPart.inline_data
  return { b64: imgData.data, mime: imgData.mimeType || imgData.mime_type }
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="seo-field">
      <span className="seo-label">{label}</span>
      <div className="seo-value" onClick={copy}>
        <span>{value}</span>
        <span className="seo-copy">{copied ? '✓' : 'Copiar'}</span>
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
    analyzing: 'Analizando SEO…', done: 'Listo ✓', error: 'Error',
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
            className="btn btn-ghost"
            style={{ marginTop: 8, padding: '3px 10px', fontSize: 12 }}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? '▲ Ocultar SEO' : '▼ Ver datos SEO'}
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
        <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => onDownload(item)}>
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      )}
      <button className="remove-btn" title="Eliminar" onClick={() => onRemove(item.id)}>&times;</button>
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
  const frame3dContainerRef       = useRef()
  const dropzoneRef               = useRef()
  const processBtnRef             = useRef()
  const fileInputRef              = useRef()

  // Init frame3d
  useEffect(() => {
    if (!frame3dContainerRef.current) return
    const cleanup = initFrame3D(frame3dContainerRef.current, logoUrl)
    return cleanup
  }, [])

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

    for (const item of pending) {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'compressing' } : x))
      try {
        const webpBlob = await compressToWebP(item.file, quality / 100)
        const webpB64  = await blobToBase64(webpBlob)
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'analyzing', webpBlob, webpSize: webpBlob.size } : x))
        const seo = await analyzeSEO(webpB64, 'image/webp')
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', seo } : x))
      } catch (err) {
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: err.message } : x))
      }
    }

    showToast('Imágenes procesadas correctamente')
    if (processBtnRef.current) confettiBurst(processBtnRef.current)
    setProcessing(false)
  }

  const downloadItem = item => {
    if (!item.webpBlob) return
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
          <div ref={frame3dContainerRef} />
          <div className="page-header">
            <h1>Optimizador batch</h1>
            <p>Convierte a WebP y genera alt text, nombre de archivo y keywords con Claude Haiku</p>
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
            <div className="drop-icon-wrap">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <div className="drop-title">Arrastra imágenes aquí</div>
            <div className="drop-hint">PNG · JPG · WEBP · GIF &nbsp;·&nbsp; Múltiples archivos</div>
            <span className="drop-cta">o haz clic para seleccionar</span>
          </div>
        </div>
      </div>

      {/* ── Lista de imágenes ── */}
      {items.length > 0 && (
        <div id="listSection">
          <div className="file-counter">
            <svg viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>{items.length === 1 ? '1 archivo' : `${items.length} archivos`}</span>
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
              <svg viewBox="0 0 24 24">
                <polyline points="13 2 13 9 20 9"/>
                <path d="M11 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
                <polyline points="18 5 22 9 18 13"/>
              </svg>
              {processing ? 'Procesando…' : 'Procesar imágenes'}
            </button>
          )}

          {doneCount > 1 && (
            <button className="btn btn-ghost" onClick={downloadAll}>
              <svg viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar todos ({doneCount})
            </button>
          )}

          <button className="btn btn-ghost" onClick={reset}>
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
            Limpiar todo
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
    } catch (err) {
      setError(err.message)
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
    } catch (err) {
      setSeo({ error: err.message })
    }
    setAnalyzingSeo(false)
  }

  const download = () => {
    if (!result) return
    const name = seo?.filename || (file?.name.replace(/\.[^.]+$/, '') || 'imagen') + '-editada.webp'
    downloadBlob(result.blob, name)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Editor con IA</h1>
        <p>Edita imágenes con Gemini 2.0 Flash, exporta a WebP y obtén datos SEO</p>
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
                <div className="picker-icon">✏️</div>
                <div className="picker-title">Selecciona una imagen</div>
                <div className="picker-hint">Una imagen para editar con IA</div>
              </>
            )}
          </div>

          {file && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              {file.name} &nbsp;·&nbsp; {formatBytes(file.size)}
              &nbsp;·&nbsp;
              <button
                className="btn btn-ghost"
                style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex' }}
                onClick={() => { setFile(null); setPreviewSrc(null); setResult(null); setSeo(null) }}
              >
                Cambiar
              </button>
            </div>
          )}

          <div className="presets-card">
            <div className="presets-label">Presets rápidos</div>
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
              placeholder="Describe qué quieres hacer con la imagen…"
              rows={4}
              value={prompt}
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
              {loading ? '⏳ Editando con Gemini…' : '🪄 Editar imagen'}
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
            <p className="result-placeholder">El resultado aparecerá aquí</p>
          )}

          {result && !loading && (
            <>
              <div className="result-image-wrap">
                <CompareSlider originalSrc={previewSrc} editedSrc={result.src} />
              </div>

              <div className="result-actions">
                <button className="btn btn-primary" onClick={download}>
                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar WebP
                </button>
                <button className="btn btn-ghost" onClick={getSEO} disabled={analyzingSeo}>
                  {analyzingSeo ? '⏳ Analizando…' : '🔍 Analizar SEO'}
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
        <a className="logo" href="#">
          <img src={logoUrl} alt="Platita Servicios Informáticos" />
        </a>

        <div className="nav-pills">
          <a
            className={`nav-tab${tab === 'optimizer' ? ' active' : ''}`}
            href="#"
            id="tab-opt"
            onClick={e => { e.preventDefault(); setTab('optimizer') }}
          >
            Optimizador
          </a>
          <a
            className={`nav-tab${tab === 'editor' ? ' active' : ''}`}
            href="#"
            id="tab-ed"
            onClick={e => { e.preventDefault(); setTab('editor') }}
          >
            Editor IA
          </a>
        </div>

        <button
          className="theme-btn"
          ref={themeBtnRef}
          id="themeBtn"
          aria-label="Cambiar modo oscuro/claro"
          onClick={() => setIsDark(d => !d)}
        >
          <span className="theme-icon theme-icon--sun">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1"  x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1"  y1="12" x2="3"  y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </span>
          <span className="theme-icon theme-icon--moon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </span>
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
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
