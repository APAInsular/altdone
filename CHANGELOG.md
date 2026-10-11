# Changelog

## [Sin publicar] · Rediseño con la identidad de Platita
### Cambiado
- Identidad de platita.es (paso 1): tokens de marca (azul `#006cb5`, papel/noche, tinta; el modo oscuro
  usa noche y el acento cielo), Exo 2 para títulos y Roboto para texto servidas desde el propio dominio
  (fuera Google Fonts y DM Sans/DM Mono), logo de la submarca Platita AltDone en SVG (azul y blanco según
  el modo), favicon e icono de Apple del isotipo.
- Botones en píldora de 48 px (primario azul, secundario con contorno tinta, suave para acciones de
  tarjeta), pestañas y ajustes rápidos en píldora, tarjetas con una sola elevación (sombra, sin borde) y
  hexágono del isotipo en las zonas de subida.
- Iconos SVG propios con trazo 1,8 en lugar de emojis y símbolos (✏️ 🪄 ⏳ 🔍 ✓ ▲ ▼ ×).
- Textos de tú y sin nombres de modelos: «Optimiza tus imágenes para WordPress», «Edita una imagen con IA»,
  «Ajustes rápidos», «Vaciar la lista»; los botones de solo icono tienen nombre accesible.
- Vite copia `static/` (favicon) a `public/` y solo limpia `public/assets` al compilar: ya no borra
  `public/.php-ini` ni `.php-version` del servidor.
- Estadísticas con Umami propio (`stats.javierjg.es`, sitio `altdone.platita.es`), sin cookies (paso 2).
  Eventos anónimos: `procesar` (imágenes, correctas y errores), `descargar`, `copiar_campo`, `editar`
  (ajuste y resultado), `seo_editor` y `pestana`. La CSP del servidor admite `stats.javierjg.es`.
- Aviso junto a cada zona de subida: qué se hace en el navegador, a quién se envía la imagen (Anthropic para
  el SEO, Google para la edición), que no se guarda y que no conviene subir datos personales de terceros.
- Pie en noche con el logo, enlace a platita.es con UTM (`utm_source=altdone`) y enlaces a aviso legal,
  privacidad (sección de AltDone) y cookies.
### Eliminado
- Marco 3D giratorio del logo (el manual de marca no permite rotar ni deformar el logo).

## [1.0.4] - 2026-10-11 · Cierre de los proxies de IA
### Seguridad
- `/api/anthropic` y `/api/gemini` eran proxies abiertos: cualquiera podía usar las claves eligiendo modelo,
  parámetros e instrucciones (y el modelo de Gemini se insertaba en la URL sin validar). Se sustituyen por
  `/api/seo` y `/api/editar`: el servidor fija modelo, `max_tokens` e instrucciones; el navegador solo envía
  la imagen (PNG, JPG, WEBP o GIF, máx. 4 MB, base64 validado) y, al editar, hasta 500 caracteres.
- Verificación con Cloudflare Turnstile (`/api/sesion`) que entrega una cookie de sesión firmada con HMAC,
  `HttpOnly`, `SameSite=Strict` y 30 minutos de vida; las rutas de IA exigen la cookie y el mismo origen.
- Límites por IP real (`trust proxy` solo para el proxy local): 10 verificaciones/10 min, 120 análisis/h y
  20 ediciones/h; cupos diarios globales configurables (`CUPO_DIARIO_SEO`, `CUPO_DIARIO_EDICION`).
- La clave de Gemini viaja en la cabecera `x-goog-api-key`, no en la URL.
- Errores genéricos en español, sin detalles internos; JSON limitado a 6 MB; fuera `X-Powered-By`.
- CSP de la app sin `'unsafe-inline'` en scripts ni CDNs sin uso; `frame-ancestors 'none'`.
- Dependencias actualizadas: `pnpm audit` pasa de 11 vulnerabilidades (1 crítica) a ninguna.
### Cambiado
- Editor: modelo `gemini-3.1-flash-lite-image` (sustituto oficial de `gemini-2.5-flash-image`, en retirada).
  Se puede cambiar con `GEMINI_IMAGE_MODEL` sin tocar código.
### Eliminado
- Dependencias `cors` y `node-fetch` (se usa el `fetch` nativo de Node 22).

## [1.0.3] - 2026-05-20
### Added
- ROADMAP.md público con fases de desarrollo
- ROADMAP_INTERNAL.md interno con estrategia y métricas

## [1.0.2] - 2026-05-20
### Removed
- Botón de configuración de API Keys del header
- Modal de configuración de keys del lado cliente
- Las API keys se gestionan exclusivamente en el servidor via .env

## [1.0.1] - 2026-05-20
### Added
- Documentación de despliegue en README.md
- Proceso de actualización para servidores con Plesk/Passenger
### Fixed
- Compatibilidad con Passenger: token inyectado via config.js
- Permisos de archivos para usuario platita en Plesk

## [1.0.0] - 2026-05-19

### Added
- Optimizador batch de imágenes a WebP con compresión automática
- Análisis SEO con Claude Haiku: título, alt text, 
  nombre de archivo y descripción
- Editor IA de imágenes con Gemini 2.5 Flash Image
- Proxy seguro con variables de entorno (.env)
- Autenticación interna con APP_SECRET
- Rate limiting y reintentos automáticos (429/529)
- Exportación de metadatos SEO a CSV y TXT
- Build compilado con Vite (sin Babel en navegador)
- Helmet CSP, CORS restrictivo y validación de payload
