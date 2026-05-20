# Changelog

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
