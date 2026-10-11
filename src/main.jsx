import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import logoAzul from './assets/platita-altdone-azul.svg'
import logoBlanco from './assets/platita-altdone-blanco.svg'
import { Icono, IconoWhatsApp } from './iconos.jsx'
import { showToast } from './animations.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Convierte a WebP; con ladoMax, además reduce la imagen manteniendo la proporción
async function compressToWebP(file, quality = 0.82, ladoMax = Infinity) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.naturalWidth * escala)
      canvas.height = Math.round(img.naturalHeight * escala)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
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

// A la IA le basta una copia reducida: Claude trabaja a 1568 px como máximo y así se envía menos
const LADO_ANALISIS = 1568
const LADO_EDICION = 1536
const copiaParaIA = (blob, lado) => compressToWebP(blob, 0.85, lado)

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

// Las zonas de subida se abren también con Intro o Espacio (WCAG 2.1.1)
function alPulsarTecla(accion) {
  return e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accion() }
  }
}

// ─── Estadísticas (Umami sin cookies) y enlaces ─────────────────────────────
// Si Umami no carga (bloqueador, local), la app sigue igual
function medir(evento, datos) {
  try { window.umami?.track(evento, datos) } catch { /* sin estadísticas */ }
}

const PLATITA = 'https://platita.es'
const utm = contenido => `?utm_source=altdone&utm_medium=herramienta&utm_content=${contenido}`

// Contacto y servicio que se ofrecen en la herramienta (mismo número que platita.es)
const WHATSAPP_DUDAS = 'https://wa.me/34613026824?text=Hola%2C%20tengo%20una%20duda%20sobre%20Platita%20AltDone'
const SERVICIO_MANTENIMIENTO = `${PLATITA}/servicios/mantenimiento-wordpress-fuerteventura/${utm('exito_descarga')}`
const CLAVE_AVISO_EXITO = 'altdone-aviso-exito'

// La primera descarga de la sesión muestra el aviso del servicio; las siguientes, no
function avisoYaMostrado() {
  try { return sessionStorage.getItem(CLAVE_AVISO_EXITO) === '1' } catch { return false }
}

function marcarAvisoMostrado() {
  try { sessionStorage.setItem(CLAVE_AVISO_EXITO, '1') } catch { /* sin almacenamiento: se verá en esta carga */ }
}

// Línea discreta bajo las acciones en el momento del éxito: sin modal ni nada que tape
function AvisoExito({ titulo }) {
  return (
    <p className="aviso-exito">
      <Icono nombre="check" />
      <span>
        <strong>{titulo}</strong> ¿Tu WordPress va lento o hace tiempo que no se actualiza? Lo revisamos y lo
        mantenemos al día.{' '}
        <a
          href={SERVICIO_MANTENIMIENTO}
          target="_blank"
          rel="noopener"
          onClick={() => medir('clic_servicio', { servicio: 'mantenimiento-wordpress', origen: 'exito_descarga' })}
        >
          Ver el mantenimiento de WordPress<span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
      </span>
    </p>
  )
}

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

  const [pct, setPct] = useState(50)

  function aplicar(valor) {
    const v = Math.min(Math.max(valor, 0), 100)
    afterRef.current.style.width = v + '%'
    lineRef.current.style.left   = v + '%'
    handleRef.current.style.left = v + '%'
    setPct(Math.round(v))
  }

  function setPos(clientX) {
    const r = wrapRef.current.getBoundingClientRect()
    aplicar((clientX - r.left) / r.width * 100)
  }

  // Flechas, Inicio y Fin mueven la línea (control deslizante accesible)
  function onKeyDown(e) {
    const pasos = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }
    if (e.key in pasos) { e.preventDefault(); aplicar(pct + pasos[e.key]) }
    else if (e.key === 'Home') { e.preventDefault(); aplicar(0) }
    else if (e.key === 'End') { e.preventDefault(); aplicar(100) }
  }

  function onPointerDown(e) { wrapRef.current.setPointerCapture(e.pointerId); setPos(e.clientX) }
  function onPointerMove(e) { if (e.buttons !== 1) return; setPos(e.clientX) }
  function onPointerUp(e)   { wrapRef.current.releasePointerCapture(e.pointerId) }

  return (
    <div
      className="compare-wrap"
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Comparar la imagen editada con la original"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct} % de la imagen editada a la vista`}
      onKeyDown={onKeyDown}
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
      <button type="button" className="seo-value" onClick={copy} aria-label={`Copiar ${label}: ${value}`}>
        <span>{value}</span>
        <span className="seo-copy" aria-hidden="true">{copied ? <><Icono nombre="check" /> Copiado</> : <><Icono nombre="copiar" /> Copiar</>}</span>
      </button>
      <span className="sr-only" role="status">{copied ? `${label} copiado` : ''}</span>
    </div>
  )
}

// ─── Image Card ───────────────────────────────────────────────────────────────
function ImageCard({ item, onDownload, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  // Una URL por imagen (antes se creaba una en cada render y no se liberaba)
  const fuente = item.webpBlob || item.file
  const previewUrl = useMemo(() => URL.createObjectURL(fuente), [fuente])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])
  // Diferencia de peso: si el WebP pesa más que el original, se dice tal cual
  const cambio = item.webpSize
    ? Math.round((item.webpSize / item.originalSize - 1) * 100)
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
    <li className={`image-card ${item.status}`}>
      <img className="image-thumb" src={previewUrl} alt="" />
      <div className="image-info">
        <div className="image-name">{item.originalName}</div>
        <div className="image-meta">
          <span className="image-size">
            {formatBytes(item.originalSize)}
            {item.webpSize && ` → ${formatBytes(item.webpSize)}`}
            {cambio !== null && (cambio <= 0
              ? <span className="ahorro"> ({cambio === 0 ? 'igual' : `−${-cambio} %`})</span>
              : <span className="ahorro ahorro--mas"> (+{cambio} %: el original ya estaba muy optimizado)</span>)}
          </span>
          <span className={`badge ${badgeClass[item.status] || 'badge-pending'}`}>
            {statusLabel[item.status] || item.status}
          </span>
        </div>
        {item.error && (
          <p className="mensaje-error mensaje-error--item">{item.error}</p>
        )}
        {item.seo && (
          <button
            className="btn btn-suave btn-sm image-toggle"
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
            <SEOField label="Texto alternativo" value={item.seo.alt} />
            <SEOField label="Nombre de archivo" value={item.seo.filename} />
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
    </li>
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

// CSV con los datos SEO, listo para Excel o para importar en WordPress
function csvSeo(items) {
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const filas = [['archivo_original', 'nombre_archivo', 'titulo', 'texto_alternativo', 'descripcion']]
  for (const i of items) filas.push([i.originalName, i.seo.filename, i.seo.title, i.seo.alt, i.seo.description])
  // BOM para que Excel lea bien las tildes
  return new Blob(['﻿' + filas.map(f => f.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

function OptimizerTab({ aviso, alDescargar }) {
  const [items, setItems]           = useState([])
  const [processing, setProcessing] = useState(false)
  const [progreso, setProgreso]     = useState(null)
  const [quality, setQuality]       = useState(82)
  const [drag, setDrag]             = useState(false)
  const [anuncio, setAnuncio]       = useState('')
  const fileInputRef                = useRef()

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

  const procesar = async pending => {
    setProcessing(true)

    let correctas = 0
    for (const [n, item] of pending.entries()) {
      setProgreso({ actual: n + 1, total: pending.length })
      setAnuncio(`Procesando imagen ${n + 1} de ${pending.length}`)
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'compressing', error: null } : x))
      try {
        // WebP a tamaño completo para descargar; a la IA solo va una copia reducida
        const webpBlob = await compressToWebP(item.file, quality / 100)
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'analyzing', webpBlob, webpSize: webpBlob.size } : x))
        const copia = await copiaParaIA(webpBlob, LADO_ANALISIS)
        const seo = await analyzeSEO(await blobToBase64(copia), 'image/webp')
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', seo } : x))
        correctas++
      } catch (err) {
        setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: err.message } : x))
      }
    }

    const errores = pending.length - correctas
    medir('procesar', { imagenes: pending.length, correctas, errores })
    // El aviso dice lo que ha pasado de verdad, también si hubo errores
    const resumen = errores
      ? `${correctas} de ${pending.length} imágenes listas; ${errores} con error`
      : (pending.length === 1 ? 'Imagen lista' : `${pending.length} imágenes listas`)
    setAnuncio('')
    setProgreso(null)
    showToast(resumen)
    setProcessing(false)
  }

  const downloadItem = item => {
    if (!item.webpBlob) return
    medir('descargar', { origen: 'optimizador' })
    const name = item.seo?.filename || item.originalName.replace(/\.[^.]+$/, '') + '.webp'
    downloadBlob(item.webpBlob, name)
    alDescargar('optimizador', listas.length > 1 ? 'Imágenes listas.' : 'Imagen lista.')
  }

  const listas = items.filter(i => i.status === 'done')
  const downloadAll = () => listas.forEach(downloadItem)
  const downloadCsv = () => {
    medir('descargar_csv', { imagenes: listas.length })
    downloadBlob(csvSeo(listas), 'altdone-datos-seo.csv')
    alDescargar('optimizador', 'Datos SEO listos.')
  }
  const processAll = () => procesar(items.filter(i => i.status === 'pending'))
  // Reintenta directamente las imágenes que fallaron
  const reintentar = () => procesar(items.filter(i => i.status === 'error'))

  const removeItem = id => setItems(prev => prev.filter(x => x.id !== id))
  const reset      = () => setItems([])

  const pendingCount = items.filter(i => i.status === 'pending').length
  const errorCount   = items.filter(i => i.status === 'error').length
  const hayImagenes  = items.length > 0

  return (
    <>
      <div className="page-header">
        <h1>Optimiza tus imágenes para WordPress</h1>
        <p>Te las devolvemos en WebP, con título, texto alternativo, nombre de archivo y descripción listos para pegar.</p>
      </div>

      <div
        className={`dropzone${drag ? ' drag-over' : ''}${hayImagenes ? ' dropzone--compacta' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={alPulsarTecla(() => fileInputRef.current?.click())}
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
        <div className="drop-texto">
          <div className="drop-title">{hayImagenes ? 'Añade más imágenes' : 'Arrastra tus imágenes aquí'}</div>
          <div className="drop-hint">PNG, JPG, WEBP o GIF · varias a la vez · los GIF animados pierden la animación</div>
        </div>
        <span className="drop-cta">o haz clic para elegirlas</span>
      </div>
      <AvisoIA>La conversión a WebP se hace en tu navegador; para los datos SEO, se envía a Anthropic (Claude) una copia reducida.</AvisoIA>

      {/* Región viva: lo que pasa durante el procesado, para lectores de pantalla */}
      <p className="sr-only" role="status">{anuncio}</p>

      {hayImagenes && (
        <section className="lote" aria-labelledby="lote-titulo">
          <div className="lote-cabecera">
            <h2 id="lote-titulo">{items.length === 1 ? '1 imagen' : `${items.length} imágenes`}</h2>
            <label className="quality-control">
              Calidad WebP
              <input
                type="range" min={50} max={100} value={quality}
                aria-valuetext={`${quality} %`}
                onChange={e => setQuality(+e.target.value)}
              />
              <strong aria-hidden="true">{quality}%</strong>
            </label>
          </div>

          {/* Barra de acciones: en el móvil queda fija abajo */}
          <div className="actions">
            {pendingCount > 0 && (
              <button className="btn btn-primary" onClick={processAll} disabled={processing}>
                <Icono nombre="procesar" />
                {processing && progreso
                  ? `Procesando ${progreso.actual} de ${progreso.total}…`
                  : `Procesar ${pendingCount === 1 ? '1 imagen' : `${pendingCount} imágenes`}`}
              </button>
            )}
            {!processing && errorCount > 0 && (
              <button className="btn btn-secundario" onClick={reintentar}>
                Reintentar {errorCount === 1 ? 'la que falló' : `las ${errorCount} que fallaron`}
              </button>
            )}
            {listas.length > 1 && (
              <button className="btn btn-secundario" onClick={downloadAll}>
                <Icono nombre="descargar" />
                Descargar todas ({listas.length})
              </button>
            )}
            {listas.length > 0 && (
              <button className="btn btn-secundario" onClick={downloadCsv}>
                <Icono nombre="archivo" />
                Datos SEO en CSV
              </button>
            )}
            <button className="btn btn-suave" onClick={reset} disabled={processing}>
              <Icono nombre="papelera" />
              Vaciar
            </button>
          </div>

          {aviso?.origen === 'optimizador' && <AvisoExito titulo={aviso.titulo} />}

          <ul className="image-list">
            {items.map(item => (
              <ImageCard key={item.id} item={item} onDownload={downloadItem} onRemove={removeItem} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

// ─── Editor IA Tab ────────────────────────────────────────────────────────────
function EditorTab({ aviso, alDescargar }) {
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
      // Copia reducida en WebP: evita el límite de 4 MB con fotos grandes del móvil
      const copia = await copiaParaIA(file, LADO_EDICION)
      const { b64: resultB64, mime: resultMime } = await editWithGemini(await blobToBase64(copia), 'image/webp', prompt)

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
    alDescargar('editor', 'Imagen lista.')
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
            role="button"
            tabIndex={0}
            aria-label={file ? `Cambiar la imagen (ahora: ${file.name})` : undefined}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={alPulsarTecla(() => fileInputRef.current?.click())}
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
                <div className="picker-title" id="picker-title">Elige una imagen</div>
                <div className="picker-hint" id="picker-hint">PNG, JPG, WEBP o GIF · máx. 4 MB</div>
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
            <label className="campo-etiqueta" htmlFor="promptTextarea">Qué quieres cambiar</label>
            <textarea
              id="promptTextarea"
              aria-describedby="prompt-ayuda"
              className="prompt-textarea"
              placeholder="Por ejemplo: quita el fondo y céntrala sobre blanco"
              rows={4}
              value={prompt}
              maxLength={500}
              onChange={e => setPrompt(e.target.value)}
            />
            <p className="campo-ayuda" id="prompt-ayuda">{prompt.length}/500 caracteres</p>
            {error && (
              <p className="mensaje-error" role="alert">{error}</p>
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
        <div className="editor-result" id="editorResult" aria-busy={loading}>
          <p className="sr-only" role="status">
            {loading ? 'Editando la imagen…' : result ? 'Imagen editada lista. Compárala con la original y descárgala.' : ''}
          </p>
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

              {aviso?.origen === 'editor' && <AvisoExito titulo={aviso.titulo} />}

              {seo && (
                <div className="result-meta">
                  {seo.error ? (
                    <p className="mensaje-error" role="alert">{seo.error}</p>
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
const PESTANAS = [
  { id: 'optimizer', tabId: 'tab-opt', panelId: 'page-opt', nombre: 'Optimizador', evento: 'optimizador' },
  { id: 'editor', tabId: 'tab-ed', panelId: 'page-ed', nombre: 'Editor IA', evento: 'editor' },
]

function App() {
  const [tab, setTab]     = useState('optimizer')

  // Aviso del servicio tras la primera descarga de la sesión
  const [aviso, setAviso] = useState(null)
  const alDescargar = useCallback((origen, titulo) => {
    if (avisoYaMostrado()) return
    marcarAvisoMostrado()
    setAviso({ origen, titulo })
  }, [])

  // Sin modo oscuro, como en el resto de platita.es: se borra la preferencia que guardaba la v1.1.0
  useEffect(() => {
    try { localStorage.removeItem('altdone-tema') } catch { /* sin almacenamiento */ }
  }, [])

  function cambiarPestana(id) {
    setTab(id)
    medir('pestana', { pestana: PESTANAS.find(p => p.id === id).evento })
  }

  // Flechas, Inicio y Fin recorren las pestañas (patrón de pestañas de WAI-ARIA)
  function teclaPestana(e) {
    const i = PESTANAS.findIndex(p => p.id === tab)
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PESTANAS.length - 1 }[e.key]
    if (destino === undefined) return
    e.preventDefault()
    const p = PESTANAS[(destino + PESTANAS.length) % PESTANAS.length]
    cambiarPestana(p.id)
    document.getElementById(p.tabId)?.focus()
  }

  return (
    <>
      <a className="saltar" href="#contenido">Ir al contenido</a>

      <nav>
        <a className="logo" href="/">
          <img src={logoAzul} alt="Platita AltDone" />
        </a>

        <div className="nav-pills" role="tablist" aria-label="Herramientas">
          {PESTANAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={p.tabId}
              aria-selected={tab === p.id}
              aria-controls={p.panelId}
              tabIndex={tab === p.id ? 0 : -1}
              className={`nav-tab${tab === p.id ? ' active' : ''}`}
              onClick={() => cambiarPestana(p.id)}
              onKeyDown={teclaPestana}
            >
              {p.nombre}
            </button>
          ))}
        </div>

      </nav>

      <main id="contenido" tabIndex={-1}>
        <div className={`page${tab === 'optimizer' ? ' active' : ''}`} id="page-opt" role="tabpanel" aria-labelledby="tab-opt">
          <OptimizerTab aviso={aviso} alDescargar={alDescargar} />
        </div>
        <div className={`page${tab === 'editor' ? ' active' : ''}`} id="page-ed" role="tabpanel" aria-labelledby="tab-ed">
          <EditorTab aviso={aviso} alDescargar={alDescargar} />
        </div>

        {/* Contacto discreto al final de la zona de trabajo (no flota sobre las acciones) */}
        <p className="dudas">
          <a
            className="btn btn-secundario btn-dudas"
            href={WHATSAPP_DUDAS}
            target="_blank"
            rel="noopener"
            onClick={() => medir('dudas', { canal: 'whatsapp' })}
          >
            <IconoWhatsApp />
            ¿Dudas? Escríbenos por WhatsApp
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        </p>
      </main>

      <footer className="pie">
        <div className="pie-dentro">
          <a className="pie-marca" href={`${PLATITA}/${utm('pie')}`}>
            <img src={logoBlanco} alt="Platita Software" />
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
