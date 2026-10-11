# Platita AltDone
> Optimiza imágenes para WordPress: WebP y datos SEO con IA
> Una herramienta de Platita Software · https://altdone.platita.es

## ¿Qué es AltDone?
Herramienta web gratuita que convierte tus imágenes a WebP y genera sus datos SEO
(título, texto alternativo, nombre de archivo y descripción) listos para pegar en
WordPress. Incluye un editor con IA para retoques rápidos (quitar el fondo, fondo
blanco, mejorar la calidad…).

## Funcionalidades
- **Optimizador por lotes:** conversión a WebP en el navegador (Canvas API) con calidad
  ajustable y datos SEO generados con Claude Haiku 4.5 (Anthropic).
- **Editor con IA:** edición con ajustes rápidos o instrucciones propias usando
  Gemini 3.1 Flash Lite Image (Google), con comparador antes/después y datos SEO.
- **Descargas:** cada imagen con su nombre SEO, todas a la vez o los datos SEO en CSV
  (punto y coma y BOM, para que Excel lea bien las tildes).
- **Privacidad:** a la IA solo se envía una copia reducida de cada imagen y el servidor
  no guarda imágenes ni instrucciones. Estadísticas con Umami, sin cookies.
- **Accesible:** WCAG 2.2 AA (teclado, lectores de pantalla y movimiento reducido).

## Requisitos
- Node.js 22+
- pnpm (versión fijada en `packageManager` de `package.json`)
- Clave de API de Anthropic y de Google Gemini (de pago)
- Widget de Cloudflare Turnstile para el dominio

## Instalación y desarrollo
```bash
git clone https://github.com/APAInsular/altdone
cd altdone
pnpm install
cp .env.example .env   # rellena las claves (ver «Variables de entorno»)
pnpm build             # compila el frontend en public/
pnpm start             # servidor en http://localhost:3000
```

Para trabajar en el frontend con recarga en caliente:
```bash
pnpm start   # en una terminal: la API en :3000
pnpm dev     # en otra: Vite en :5173, que reenvía /api al :3000
```
En ese caso pon `ALLOWED_ORIGIN=http://localhost:5173`: el servidor solo acepta
peticiones del origen configurado.

Para probar en local sin Turnstile real, usa las claves de prueba de Cloudflare
(`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) con
`TURNSTILE_PRUEBAS=1`. Nunca actives esa variable en producción.

## Variables de entorno
Todas en `.env` (nunca en el repositorio). Plantilla completa en `.env.example`.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | Análisis SEO |
| `GEMINI_API_KEY` | Sí | Editor con IA |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Sí | Verificar que quien usa la IA es una persona |
| `SESSION_SECRET` | Sí | Firma de la cookie de sesión (cadena aleatoria larga) |
| `ALLOWED_ORIGIN` | Sí | URL de la app sin barra final; solo se aceptan peticiones desde ella |
| `ANTHROPIC_MODEL` | No | Modelo del SEO (por defecto `claude-haiku-4-5-20251001`) |
| `GEMINI_IMAGE_MODEL` | No | Modelo del editor (por defecto `gemini-3.1-flash-lite-image`) |
| `CUPO_DIARIO_SEO` / `CUPO_DIARIO_EDICION` | No | Cupos diarios globales (500 y 100) |
| `PORT` | No | Puerto del servidor (3000) |
| `TURNSTILE_PRUEBAS` | No | Solo en local: acepta las respuestas de prueba de Turnstile |

Sin las variables obligatorias, la IA falla cerrada (responde 503) y el resto de la
app sigue funcionando.

## API
El navegador nunca habla con Anthropic ni con Google: lo hace el servidor, que fija
modelos, parámetros e instrucciones.

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/config` | GET | Datos públicos que necesita el navegador (clave de sitio de Turnstile) |
| `/api/sesion` | POST | Verifica el token de Turnstile y entrega la cookie `altdone_sesion` (30 min) |
| `/api/seo` | POST | `{ imagen, tipo }` → `{ filename, title, alt, description }` |
| `/api/editar` | POST | `{ imagen, tipo, instrucciones }` → `{ imagen, tipo }` |
| `/api/csp-informe` | POST | Recibe los avisos de la CSP (en modo informe) |

`/api/seo` y `/api/editar` exigen la cookie de sesión y el mismo origen. Aceptan
imágenes PNG, JPG, WEBP o GIF en base64 de hasta 4 MB, e instrucciones de hasta 500
caracteres.

## Estructura
```
server.js            Servidor Express: API, seguridad y estáticos
src/main.jsx         App React: optimizador, editor, Turnstile y llamadas a la API
src/index.css        Estilos con los tokens de marca de Platita
src/iconos.jsx       Iconos SVG propios
src/animations.js    Aviso flotante y preferencia de movimiento reducido
src/assets/          Logos de la submarca y fuentes Exo 2 y Roboto
static/              Favicon, robots.txt, sitemap.xml, imagen social, página 404 y
                     .well-known/security.txt (se copian tal cual a public/)
public/              Salida de `pnpm build` (no está en git)
deploy/              Directivas de nginx y Apache para Plesk
```

## Seguridad
- Claves de IA solo en el servidor; el navegador no elige modelo ni parámetros.
- Cloudflare Turnstile y cookie de sesión firmada (HMAC, `HttpOnly`, `SameSite=Strict`).
- Solo peticiones del mismo origen, límites por IP y cupos diarios globales.
- Validación de entrada en el servidor y errores genéricos, sin detalles internos.
- Cabeceras de seguridad en nginx (`deploy/directivas-nginx-produccion.conf`), CSP en
  modo informe con endpoint propio, y `/.well-known/security.txt`.
- ¿Has encontrado una vulnerabilidad? Escribe a hola@platita.es.

## Despliegue
La app es un servidor Node (Express) que sirve la API y el frontend compilado en
`public/`. En Plesk con Passenger:

1. Repositorio Git del dominio apuntando a `main`, con estas acciones de despliegue:
   ```
   pnpm install --frozen-lockfile && pnpm build && touch tmp/restart.txt
   ```
   (con el `node`/`pnpm` de Plesk en el `PATH`).
2. Node.js activado con `server.js` como archivo de inicio y `public/` como raíz del
   documento.
3. `.env` en la raíz de la app con las variables de arriba.
4. Directivas de `deploy/` pegadas en «Configuración de Apache y nginx».

`pnpm build` solo limpia `public/assets`, para no borrar los ficheros que el panel
guarda en `public/`. Para actualizar basta con hacer «Pull» del repositorio.

## Documentación relacionada
- [CHANGELOG.md](CHANGELOG.md) — cambios por versión
- [ROADMAP.md](ROADMAP.md) — fases previstas
- Privacidad: https://platita.es/privacidad/#platita-altdone-altdoneplatitaes

## Licencia
MIT — Platita Software 2026
