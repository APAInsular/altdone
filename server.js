import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { readFileSync } from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: [
        "'self'",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com"
      ],
      workerSrc: ["'self'", "blob:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
}));

app.use(express.json({ limit: '20mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);


const IMAGE_B64_LIMIT = 4 * 1024 * 1024;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const RETRY_DELAYS = [2000, 5000, 10000];

async function callAnthropicWithRetry(headers, body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body,
    });
    if (res.status !== 529) return res;
    if (i < retries - 1) {
      const wait = RETRY_DELAYS[i];
      console.log(`[anthropic] Reintento ${i + 1}/3 en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  return fetchWithTimeout('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body });
}

const ANTHROPIC_ALLOWED_FIELDS = new Set(['model', 'max_tokens', 'messages', 'system']);

app.post('/api/anthropic', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[anthropic] KEY cargada:', !!apiKey);
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  const extraFields = Object.keys(req.body).filter(k => !ANTHROPIC_ALLOWED_FIELDS.has(k));
  if (extraFields.length) {
    return res.status(400).json({ error: `Unexpected fields: ${extraFields.join(', ')}` });
  }

  for (const msg of messages) {
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const part of content) {
      if (part.type === 'image') {
        if (part.source?.type !== 'base64') {
          return res.status(400).json({ error: 'Image source type must be base64' });
        }
        if ((part.source.data?.length ?? 0) > IMAGE_B64_LIMIT) {
          return res.status(413).json({ error: 'Image exceeds 4MB limit' });
        }
      }
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  try {
    const upstream = await callAnthropicWithRetry(headers, JSON.stringify(req.body));
    console.log('[anthropic] Status upstream:', upstream.status);
    const data = await upstream.json();
    if (!upstream.ok) console.error('[anthropic] Error upstream:', upstream.status);
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[anthropic] Error:', err.message);
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
});

const GEMINI_RETRY_DELAYS = [3000, 8000, 15000];

async function callGeminiWithRetry(url, body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status !== 429 && res.status !== 529) return res;
    if (i < retries - 1) {
      const wait = GEMINI_RETRY_DELAYS[i];
      console.log(`[gemini] Reintento ${i + 1}/3 en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  return fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}

app.post('/api/gemini', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('[gemini] KEY cargada:', !!apiKey);
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  if (!Array.isArray(req.body.contents)) {
    return res.status(400).json({ error: 'contents must be an array' });
  }

  for (const item of req.body.contents) {
    for (const part of (item?.parts || [])) {
      if ((part?.inline_data?.data?.length ?? 0) > IMAGE_B64_LIMIT) {
        return res.status(413).json({ error: 'Image exceeds 4MB limit' });
      }
    }
  }

  const { model: modelField, ...bodyWithoutModel } = req.body;
  const model = modelField || 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  if (!bodyWithoutModel.generationConfig) {
    bodyWithoutModel.generationConfig = {};
  }
  if (!bodyWithoutModel.generationConfig.responseModalities) {
    bodyWithoutModel.generationConfig.responseModalities = ['TEXT', 'IMAGE'];
  }

  try {
    const upstream = await callGeminiWithRetry(url, JSON.stringify(bodyWithoutModel));
    console.log('[gemini] Status upstream:', upstream.status);
    const data = await upstream.json();
    if (!upstream.ok) console.error('[gemini] Error upstream:', upstream.status);
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[gemini] Error:', err.message);
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
});

const serveIndex = (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
};
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', serveIndex);

app.listen(PORT, () => {
  console.log(`altdone running at http://localhost:${PORT}`);
});
