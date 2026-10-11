# AltDone — Roadmap

> Herramienta de optimización de imágenes con IA para WordPress,
> parte del ecosistema Platita Software.

## Estado actual — v1.1.0

En producción: https://altdone.platita.es

- Optimizador por lotes a WebP (en el navegador) con datos SEO generados con Claude
  Haiku 4.5: título, texto alternativo, nombre de archivo y descripción
- Editor con IA (Gemini 3.1 Flash Lite Image) con ajustes rápidos y comparador
  antes/después
- Exportación de los datos SEO a CSV
- Identidad de Platita Software, accesibilidad WCAG 2.2 AA y estadísticas sin cookies
- Servidor que protege las claves: modelos fijos, Turnstile, límites y cupos

---

## Fase 1 — Identidad, analítica y experiencia ✅
> Completada en la v1.1.0 (octubre de 2026)

- [x] Identidad visual de Platita (logo de la submarca, paleta, tipografía, favicon)
- [x] Estadísticas con Umami propio, sin cookies, con eventos de uso
      (sustituye a Google Analytics 4: no necesita aviso de cookies)
- [x] Mejora de UI/UX: la herramienta primero, móvil, accesibilidad WCAG 2.2 AA
- [x] Seguridad: claves solo en el servidor, Turnstile, cabeceras y CSP

## Fase 2 — Landing page y contenido

- [ ] Google Search Console
- [ ] Home page con propuesta de valor, cómo funciona y ejemplos
- [ ] Separación de rutas: / (landing) y /app (herramienta)
- [ ] Sección de tutoriales y documentación de uso
- [ ] Vídeo demo corto (< 2 minutos)
- [ ] FAQ

## Fase 3 — Monetización y usuarios
> Estimación: 1-2 meses

- [ ] Sistema de autenticación (login con Google/email)
- [ ] Modelo de créditos por uso
- [ ] Planes de suscripción (Free, Pro, Agency)
- [ ] Plugin WordPress oficial
- [ ] API pública para desarrolladores

## Fase 4 — Crecimiento
> Estimación: 3-6 meses

- [ ] Lanzamiento en Product Hunt
- [ ] Integración con Elementor y WooCommerce
- [ ] Programa de afiliados para agencias WordPress
- [ ] Internacionalización (inglés)
- [ ] Procesado de vídeo con IA

---

## Contribuir

Las contribuciones son bienvenidas. Si quieres proponer
una funcionalidad, abre un Issue en GitHub.

Repositorio: https://github.com/APAInsular/altdone
