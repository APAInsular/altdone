# Changelog

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
