'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

app.disable('x-powered-by');
app.set('trust proxy', 1);
// /adminpanel и /adminpanel/ — разные маршруты, иначе редирект зацикливается
app.enable('strict routing');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

/* ------------------------------------------------------------------ */
/*  Telegram                                                          */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(lead) {
  const lines = [
    '<b>HAVEX — новая заявка с сайта</b>',
    '',
    `<b>Имя:</b> ${esc(lead.name)}`,
    `<b>Телефон:</b> ${esc(lead.phone)}`,
  ];

  if (lead.email) lines.push(`<b>Email:</b> ${esc(lead.email)}`);
  if (lead.product) lines.push(`<b>Интересует:</b> ${esc(lead.product)}`);
  if (lead.comment) lines.push(`<b>Комментарий:</b> ${esc(lead.comment)}`);

  lines.push('');
  lines.push(`<i>${esc(lead.meta)}</i>`);

  return lines.join('\n');
}

async function sendToTelegram(text) {
  if (!BOT_TOKEN || BOT_TOKEN.includes('PUT_YOUR')) {
    const err = new Error('Telegram is not configured');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    const err = new Error(data.description || `Telegram API error ${res.status}`);
    err.code = 'TELEGRAM_ERROR';
    throw err;
  }

  return data;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validate(body) {
  const lead = {
    name: clean(body.name, 80),
    phone: clean(body.phone, 32),
    email: clean(body.email, 120),
    product: clean(body.product, 120),
    comment: clean(body.comment, 1000),
    meta: 'Форма с сайта havex',
  };

  const errors = [];

  if (lead.name.length < 2) errors.push('Укажите имя');

  const digits = lead.phone.replace(/\D/g, '');
  if (digits.length < 10) errors.push('Укажите корректный телефон');

  if (lead.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(lead.email)) {
    errors.push('Некорректный email');
  }

  // honeypot — silently accepted, never sent
  if (clean(body.company, 100)) lead.spam = true;

  return { lead, errors };
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Слишком много заявок. Попробуйте позже.' },
});

app.post('/api/lead', leadLimiter, async (req, res) => {
  const { lead, errors } = validate(req.body || {});

  if (errors.length) {
    return res.status(400).json({ ok: false, error: errors[0] });
  }

  if (lead.spam) {
    return res.json({ ok: true }); // pretend success for bots
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '—';
  const stamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  lead.meta = `Форма с сайта Havex · ${stamp} МСК · IP ${ip}`;

  try {
    await sendToTelegram(buildMessage(lead));
    console.log(`[lead] sent -> ${lead.name} ${lead.phone}`);
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') {
      console.warn('[lead] Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
      console.warn('[lead] payload that would have been sent:\n' + buildMessage(lead));
      // In dev the lead is captured in the console; the visitor still gets a clear result.
      return res.status(503).json({
        ok: false,
        error: 'Приём заявок временно недоступен. Напишите нам в Telegram.',
      });
    }

    console.error('[lead] telegram failed:', err.message);
    return res.status(502).json({
      ok: false,
      error: 'Не удалось отправить заявку. Попробуйте ещё раз или напишите в Telegram.',
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    telegram: Boolean(BOT_TOKEN && CHAT_ID && !BOT_TOKEN.includes('PUT_YOUR')),
  });
});

const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ */
/*  Админ-панель (вне public/, не индексируется)                      */
/* ------------------------------------------------------------------ */

const ADMIN_DIR = path.join(__dirname, '_admin');

app.use('/adminpanel', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

app.get('/adminpanel', (_req, res) => res.redirect(301, '/adminpanel/'));
app.get('/adminpanel/', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));

// Файлы панели: только имя без слэшей, чтобы исключить traversal
app.get('/adminpanel/:file', (req, res, next) => {
  const file = req.params.file;
  if (!file || !/^[a-zA-Z0-9._-]+$/.test(file)) return next();
  res.sendFile(path.join(ADMIN_DIR, file), (err) => {
    if (err) next();
  });
});

// Ловушки для типовых адресов панели
['/adminpanel.html', '/admin', '/admin/'].forEach((trap) => {
  app.get(trap, (_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.sendFile(path.join(ADMIN_DIR, 'redirect.html'));
  });
});

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (/\.(woff2|jpg|jpeg|png|webp|svg|mp4)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'), (err) => {
    if (err) res.type('text').send('404');
  });
});

app.listen(PORT, () => {
  const ready = BOT_TOKEN && CHAT_ID && !BOT_TOKEN.includes('PUT_YOUR');
  console.log('');
  console.log('  HAVEX  ·  сайт запущен');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Telegram: ${ready ? 'подключён ✓' : 'НЕ настроен — заполните .env'}`);
  console.log('');
});
