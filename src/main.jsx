import { useState, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

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
  } catch(e) {
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

  // Busca la imagen en todas las partes posibles
  const candidates = data.candidates || []
  console.log('[gemini] Candidates:', candidates.length)
  candidates.forEach((c, i) => {
    console.log(`[gemini] Candidate ${i} parts:`,
      c.content?.parts?.map(p => p.inlineData ? 'IMAGE' : p.text ? 'TEXT:'+p.text.slice(0,50) : 'OTHER')
    )
  })

  // La imagen puede estar en inlineData O inline_data según la versión
  const allParts = data.candidates?.[0]?.content?.parts || []
  const imgPart = allParts.find(p => p.inlineData || p.inline_data)
  console.log('[gemini] Imagen encontrada:', !!imgPart)

  if (!imgPart) throw new Error('Gemini no devolvió imagen')
  const imgData = imgPart.inlineData || imgPart.inline_data
  return { b64: imgData.data, mime: imgData.mimeType || imgData.mime_type }
}

// ─── UI Components ────────────────────────────────────────────────────────────
const styles = {
  header: {
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--gray-200)',
    position: 'sticky', top: 0, zIndex: 100,
    padding: '0 24px',
  },
  headerInner: {
    maxWidth: 1100, margin: '0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 60,
  },
  logo: {
    fontSize: 22, fontFamily: 'Georgia, serif',
    color: 'var(--violet)', letterSpacing: '-0.5px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  tabs: {
    display: 'flex', gap: 4, background: 'var(--gray-100)',
    borderRadius: 8, padding: 4,
  },
  tab: (active) => ({
    padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: 14,
    fontWeight: 500, transition: 'all .15s',
    background: active ? 'var(--white)' : 'transparent',
    color: active ? 'var(--violet)' : 'var(--gray-600)',
    boxShadow: active ? 'var(--shadow)' : 'none',
  }),
  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },
  card: {
    background: 'var(--white)', borderRadius: 12,
    border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  },
  dropzone: (drag) => ({
    border: `2px dashed ${drag ? 'var(--violet)' : 'var(--gray-200)'}`,
    borderRadius: 'var(--radius)', padding: '48px 24px',
    textAlign: 'center', transition: 'all .2s', cursor: 'pointer',
    background: drag ? 'var(--violet-light)' : 'var(--gray-50)',
  }),
  btn: (variant = 'primary') => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '10px 20px', borderRadius: 8, border: 'none',
    fontWeight: 500, fontSize: 14, transition: 'all .15s',
    ...(variant === 'primary' ? {
      background: 'var(--violet)', color: 'var(--white)',
    } : variant === 'ghost' ? {
      background: 'transparent', color: 'var(--violet)',
      border: '1px solid var(--violet-light)',
    } : {
      background: 'var(--gray-100)', color: 'var(--gray-800)',
    }),
  }),
  badge: (color = 'violet') => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
    background: color === 'violet' ? 'var(--violet-light)' : 'var(--gray-100)',
    color: color === 'violet' ? 'var(--violet)' : 'var(--gray-600)',
  }),
}

function DropZone({ onFiles, multiple = true, children }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef()

  const handle = useCallback(files => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length) onFiles(arr)
  }, [onFiles])

  return (
    <div
      style={styles.dropzone(drag)}
      onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files) }}
    >
      <input ref={ref} type="file" accept="image/*" multiple={multiple} style={{ display: 'none' }}
        onChange={e => handle(e.target.files)} />
      {children}
    </div>
  )
}

// ─── Optimizador Tab ─────────────────────────────────────────────────────────
function OptimizerTab() {
  const [items, setItems] = useState([])
  const [processing, setProcessing] = useState(false)
  const [quality, setQuality] = useState(82)

  const addFiles = useCallback(files => {
    const newItems = files.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f, status: 'pending',
      originalSize: f.size, originalName: f.name,
      webpBlob: null, webpSize: null, seo: null, error: null,
    }))
    setItems(prev => [...prev, ...newItems])
  }, [])

  const processAll = async () => {
    setProcessing(true)
    const pending = items.filter(i => i.status === 'pending')

    for (const item of pending) {
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'compressing' } : x))
      try {
        const webpBlob = await compressToWebP(item.file, quality / 100)
        const webpB64 = await blobToBase64(webpBlob)

        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'analyzing', webpBlob, webpSize: webpBlob.size } : x))

        const seo = await analyzeSEO(webpB64, 'image/webp')

        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', seo } : x))
      } catch (err) {
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: err.message } : x))
      }
    }
    setProcessing(false)
  }

  const downloadItem = (item) => {
    if (!item.webpBlob) return
    const name = item.seo?.filename || item.originalName.replace(/\.[^.]+$/, '') + '.webp'
    downloadBlob(item.webpBlob, name)
  }

  const downloadAll = () => {
    items.filter(i => i.status === 'done').forEach(downloadItem)
  }

  const removeItem = (id) => setItems(prev => prev.filter(x => x.id !== id))
  const reset = () => setItems([])

  const doneCount = items.filter(i => i.status === 'done').length

  return (
    <div>
      {items.length === 0 ? (
        <DropZone onFiles={addFiles} multiple>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, marginBottom: 8, color: 'var(--gray-800)' }}>
            Arrastra imágenes aquí
          </h3>
          <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>
            PNG, JPG, WEBP, GIF · Múltiples archivos aceptados
          </p>
        </DropZone>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--gray-600)' }}>Calidad WebP</label>
              <input type="range" min={50} max={100} value={quality}
                onChange={e => setQuality(+e.target.value)}
                style={{ accentColor: 'var(--violet)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--violet)', minWidth: 30 }}>{quality}%</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button style={styles.btn('secondary')} onClick={reset}>Limpiar</button>
              {doneCount > 1 && (
                <button style={styles.btn('ghost')} onClick={downloadAll}>
                  ↓ Descargar todos ({doneCount})
                </button>
              )}
              {items.some(i => i.status === 'pending') && (
                <button style={styles.btn()} onClick={processAll} disabled={processing}>
                  {processing ? '⏳ Procesando…' : '✨ Optimizar todo'}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {items.map(item => (
              <ImageCard key={item.id} item={item} onDownload={downloadItem} onRemove={removeItem} />
            ))}
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <DropZone onFiles={addFiles} multiple>
              <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>+ Añadir más imágenes</p>
            </DropZone>
          </div>
        </div>
      )}
    </div>
  )
}

function ImageCard({ item, onDownload, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const previewUrl = item.webpBlob ? URL.createObjectURL(item.webpBlob) : (item.file ? URL.createObjectURL(item.file) : null)
  const savings = item.webpSize ? Math.round((1 - item.webpSize / item.originalSize) * 100) : null

  const statusColor = { pending: 'var(--gray-400)', compressing: '#F59E0B', analyzing: '#3B82F6', done: '#10B981', error: '#EF4444' }
  const statusLabel = { pending: 'Pendiente', compressing: 'Comprimiendo…', analyzing: 'Analizando SEO…', done: 'Listo', error: 'Error' }

  return (
    <div style={{ ...styles.card, padding: '16px' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {previewUrl && (
          <img src={previewUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.originalName}
            </span>
            <span style={{ ...styles.badge(), background: statusColor[item.status] + '22', color: statusColor[item.status], flexShrink: 0 }}>
              {statusLabel[item.status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray-400)' }}>
            <span>Original: {formatBytes(item.originalSize)}</span>
            {item.webpSize && <span>WebP: {formatBytes(item.webpSize)}</span>}
            {savings !== null && <span style={{ color: '#10B981', fontWeight: 600 }}>−{savings}%</span>}
          </div>
          {item.error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{item.error}</p>}
          {item.seo && (
            <button style={{ ...styles.btn('ghost'), marginTop: 8, padding: '4px 10px', fontSize: 12 }}
              onClick={() => setExpanded(v => !v)}>
              {expanded ? '▲ Ocultar SEO' : '▼ Ver datos SEO'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {item.status === 'done' && (
            <button style={styles.btn()} onClick={() => onDownload(item)}>↓</button>
          )}
          <button style={styles.btn('secondary')} onClick={() => onRemove(item.id)}>✕</button>
        </div>
      </div>

      {expanded && item.seo && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--gray-100)', display: 'grid', gap: 8 }}>
          <SEOField label="Título SEO" value={item.seo.title} />
          <SEOField label="Alt text" value={item.seo.alt} />
          <SEOField label="Nombre de archivo" value={item.seo.filename} />
          <SEOField label="Descripción" value={item.seo.description} />
        </div>
      )}
    </div>
  )
}

function SEOField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 2 }}>
        <p style={{ fontSize: 13, color: 'var(--gray-800)', flex: 1, lineHeight: 1.5 }}>{value}</p>
        <button style={{ ...styles.btn('ghost'), padding: '2px 8px', fontSize: 11, flexShrink: 0 }} onClick={copy}>
          {copied ? '✓' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

// ─── Editor IA Tab ────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Fondo blanco', prompt: 'Elimina el fondo y reemplázalo con un fondo blanco limpio y uniforme' },
  { label: 'Sin fondo', prompt: 'Elimina completamente el fondo dejando solo el sujeto principal con transparencia' },
  { label: 'Recortar sujeto', prompt: 'Recorta y centra perfectamente el sujeto principal de la imagen' },
  { label: 'Mejorar calidad', prompt: 'Mejora la nitidez, contraste y colores de la imagen sin cambiar su contenido' },
  { label: 'Estilo profesional', prompt: 'Aplica un look profesional de e-commerce: iluminación uniforme, fondo neutro, sujeto centrado' },
  { label: 'Color vibrante', prompt: 'Aumenta la saturación y viveza de los colores manteniendo un aspecto natural' },
]

function EditorTab() {
  const [file, setFile] = useState(null)
  const [previewSrc, setPreviewSrc] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [seo, setSeo] = useState(null)
  const [analyzingSeo, setAnalyzingSeo] = useState(false)

  const setImage = (files) => {
    const f = files[0]
    if (!f) return
    setFile(f)
    setResult(null); setSeo(null); setError(null)
    const url = URL.createObjectURL(f)
    setPreviewSrc(url)
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
      const webpB64 = await blobToBase64(webpBlob)
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
      const b64 = await blobToBase64(result.blob)
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left: Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!file ? (
          <DropZone onFiles={setImage} multiple={false}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✏️</div>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 18, marginBottom: 8 }}>Selecciona una imagen</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Una imagen para editar con IA</p>
          </DropZone>
        ) : (
          <div style={styles.card}>
            <div style={{ position: 'relative' }}>
              <img src={previewSrc} alt="Original" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
              <button
                style={{ position: 'absolute', top: 8, right: 8, ...styles.btn('secondary'), padding: '4px 10px', fontSize: 12 }}
                onClick={() => { setFile(null); setPreviewSrc(null); setResult(null); setSeo(null) }}>
                Cambiar
              </button>
            </div>
            <div style={{ padding: 12, fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)' }}>
              {file.name} · {formatBytes(file.size)}
            </div>
          </div>
        )}

        <div style={styles.card}>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--gray-600)' }}>Presets rápidos</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {PRESETS.map(p => (
                <button key={p.label} style={{ ...styles.btn('ghost'), padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setPrompt(p.prompt)}>
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe qué quieres hacer con la imagen…"
              rows={4}
              style={{
                width: '100%', border: '1px solid var(--gray-200)', borderRadius: 8,
                padding: '10px 12px', fontSize: 14, resize: 'vertical', outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <button
              style={{ ...styles.btn(), width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={edit}
              disabled={!file || !prompt.trim() || loading}>
              {loading ? '⏳ Editando con Gemini…' : '🪄 Editar imagen'}
            </button>
            {error && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      </div>

      {/* Right: Result */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...styles.card, flex: 1 }}>
          {result ? (
            <>
              <img src={result.src} alt="Resultado" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
              <div style={{ padding: 12, borderTop: '1px solid var(--gray-100)', display: 'flex', gap: 8 }}>
                <button style={styles.btn()} onClick={download}>↓ Descargar WebP</button>
                <button style={styles.btn('ghost')} onClick={getSEO} disabled={analyzingSeo}>
                  {analyzingSeo ? '⏳ Analizando…' : '🔍 Analizar SEO'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: 'var(--gray-400)', fontSize: 14 }}>
              {loading ? '✨ Generando imagen…' : 'El resultado aparecerá aquí'}
            </div>
          )}
        </div>

        {seo && (
          <div style={{ ...styles.card, padding: 16 }}>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 16, marginBottom: 12 }}>Datos SEO</h3>
            {seo.error ? (
              <p style={{ color: '#EF4444', fontSize: 13 }}>{seo.error}</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <SEOField label="Título SEO" value={seo.title} />
                <SEOField label="Alt text" value={seo.alt} />
                <SEOField label="Nombre de archivo" value={seo.filename} />
                <SEOField label="Descripción" value={seo.description} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('optimizer')

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span>⬡</span>
            <span>altdone</span>
          </div>
          <div style={styles.tabs}>
            <button style={styles.tab(tab === 'optimizer')} onClick={() => setTab('optimizer')}>Optimizador</button>
            <button style={styles.tab(tab === 'editor')} onClick={() => setTab('editor')}>Editor IA</button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <div style={{ marginBottom: 24 }}>
          {tab === 'optimizer' ? (
            <>
              <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, marginBottom: 6 }}>Optimizador batch</h1>
              <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>
                Convierte a WebP y genera alt text, nombre de archivo y keywords con Claude Haiku
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, marginBottom: 6 }}>Editor con IA</h1>
              <p style={{ color: 'var(--gray-400)', fontSize: 15 }}>
                Edita imágenes con Gemini 2.0 Flash, exporta a WebP y obtén datos SEO
              </p>
            </>
          )}
        </div>

        {tab === 'optimizer' ? <OptimizerTab /> : <EditorTab />}
      </main>

    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
