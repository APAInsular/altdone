Regla permanente: usar siempre pnpm, nunca npm ni yarn

# Platita AltDone — guía para Claude

Herramienta web de Platita Software (https://altdone.platita.es): convierte imágenes a
WebP en el navegador y genera datos SEO con Claude Haiku; editor con Gemini.
Detalle funcional, variables y API en README.md; historial en CHANGELOG.md.

## Estructura
- `server.js` — Express: `/api/config`, `/api/sesion` (Turnstile → cookie `altdone_sesion`),
  `/api/seo`, `/api/editar`, `/api/csp-informe` y estáticos de `public/`.
- `src/main.jsx` — toda la app React (optimizador, editor, pestañas, Turnstile, Umami).
- `src/index.css` — tokens de marca de Platita al principio; no escribir colores sueltos.
- `src/iconos.jsx` — iconos SVG (trazo 1,8). Nada de emojis en la interfaz.
- `static/` — favicon, robots.txt, sitemap.xml (actualizar `lastmod` si cambia la portada), imagen
  social, 404.html y `.well-known/security.txt`; Vite los copia a `public/`. La app solo tiene `/`:
  cualquier otra ruta da 404.
- `public/` — salida de `pnpm build`, fuera de git.
- `deploy/` — directivas de nginx y Apache que hay que pegar a mano en Plesk.

## Comandos
- `pnpm build` · `pnpm start` (servidor en :3000) · `pnpm dev` (Vite en :5173)
- `pnpm audit` antes de publicar.
- No hay tests automatizados: verificar con Playwright
  (~/.claude/skills/playwright-skill/node_modules) y axe-core (descargarlo en el
  scratchpad; la CSP impide inyectarlo, usar `bypassCSP: true`).

## Reglas del proyecto
- Español en textos, comentarios y commits (Conventional Commits). Voz de tú.
- Identidad de Platita: azul `#006cb5`, Exo 2 + Roboto locales, botones en píldora de
  48 px, una sola elevación por tarjeta, hexágono del isotipo.
- Accesibilidad WCAG 2.2 AA: comprobar con axe (0 violaciones) tras cambios de interfaz.
- El servidor fija modelos y parámetros; el navegador solo envía la imagen (y las
  instrucciones al editar). No reintroducir proxies genéricos a Anthropic o Google.
- A la IA va una copia reducida (`copiaParaIA`), nunca la imagen completa.
- Si cambian los datos enviados a la IA, los límites o los eventos de Umami, avisar de
  que hay que revisar la sección de AltDone en platita.es/privacidad (repo platita-software).
- Nunca escribir valores reales de claves en ningún archivo.

## Probar sin gastar cupo
- La clave de Gemini solo funciona desde la IP del servidor: en local, usar claves falsas
  (la API responde 502) o simular `/api/seo` y `/api/editar` con `page.route` de Playwright.
- Turnstile en local: claves de prueba de Cloudflare y `TURNSTILE_PRUEBAS=1`.

## Despliegue
- Plesk → Git → «Pull ahora» (modo automático): instala, compila y reinicia.
- No usar los botones «pnpm install» ni «Ejecutar script» de la extensión Node.js de Plesk
  (su pnpm 12 rompió node_modules el 2026-10-11).
- Cambios en `deploy/` no se aplican solos: pegarlos en «Configuración de Apache y nginx».
- Problemas del servidor (permisos, registros de Passenger): repo hosting-platita.
- Procedimiento interno completo en DEPLOY_INTERNAL.md (fuera de git).
