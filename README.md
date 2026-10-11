# AltDone
> AI-powered image optimizer and SEO generator for WordPress
> by Platita Software

## ¿Qué es AltDone?
Herramienta web que combina compresión WebP, análisis SEO con 
IA y edición de imágenes para WordPress. Desarrollada por 
Platita Software.

## Funcionalidades
- Optimizador batch: convierte imágenes a WebP y genera 
  metadatos SEO (título, alt text, nombre de archivo, 
  descripción) con Claude Haiku
- Editor IA: edita imágenes con instrucciones en lenguaje 
  natural usando Gemini 3.1 Flash Lite Image
- Proxy seguro: las API keys nunca se exponen al navegador
- Descarga de imágenes optimizadas con nombre SEO correcto

## Requisitos
- Node.js 22+
- pnpm
- API Key de Anthropic (Claude Haiku)
- API Key de Google Gemini

## Instalación
```bash
git clone https://github.com/APAInsular/altdone
cd altdone
pnpm install
cp .env.example .env
# Edita .env con tus API keys
pnpm build
pnpm start
```

## Desarrollo
```bash
pnpm dev  # Vite dev server con hot-reload en :5173
```

## Variables de entorno
Ver .env.example para la lista completa de variables.
Nunca subas el archivo .env al repositorio.

## Stack
- Express.js — servidor proxy seguro
- React + Vite — frontend compilado
- Claude Haiku (Anthropic) — análisis SEO con IA
- Gemini 3.1 Flash Lite Image (Google) — edición de imágenes
- Canvas API — conversión WebP en navegador

## Seguridad
- Claves de IA solo en el servidor vía `.env`; el servidor fija modelos y parámetros
- Verificación con Cloudflare Turnstile y cookie de sesión firmada
- Solo peticiones del mismo origen (`ALLOWED_ORIGIN`)
- Límites por IP, cupos diarios globales, helmet y validación de entrada
- Tiempo máximo en las llamadas a los proveedores

## Deployment

### Requisitos del servidor
- Node.js 22+
- pnpm
- PM2 o Passenger (Plesk)
- Nginx o Apache como reverse proxy

### Pasos
1. Clona el repo en tu servidor
2. `pnpm install`
3. Copia `.env.example` a `.env` y rellena las keys
4. Crea un widget de Cloudflare Turnstile para el dominio y pon sus claves en `.env`
   (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`), junto con un `SESSION_SECRET` aleatorio
5. `pnpm build`
6. `node server.js` (o PM2/Passenger)

### Actualizar a nueva versión
```bash
git pull origin main
pnpm install
pnpm build
touch tmp/restart.txt  # si usas Passenger/Plesk
# o: pm2 restart altdone  # si usas PM2
```

### Variables de entorno
Ver `.env.example` para la lista completa.
`ALLOWED_ORIGIN` debe apuntar a tu dominio en producción.

## Licencia
MIT — Platita Software 2026
