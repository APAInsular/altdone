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
  natural usando Gemini 2.5 Flash Image
- Proxy seguro: las API keys nunca se exponen al navegador
- Exportación CSV con todos los metadatos SEO
- Descarga de imágenes optimizadas con nombre SEO correcto

## Requisitos
- Node.js 18+
- pnpm
- API Key de Anthropic (Claude Haiku)
- API Key de Google Gemini

## Instalación
```bash
git clone https://github.com/platita-software/altdone
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
- Gemini 2.5 Flash Image (Google) — edición de imágenes
- Canvas API — conversión WebP en navegador

## Seguridad
- API keys solo en servidor vía .env
- Token de autenticación interno (APP_SECRET)
- Rate limiting, helmet, CORS restrictivo
- Validación de payload y timeout en requests

## Licencia
MIT — Platita Software 2026
