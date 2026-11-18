'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Пароль панели хранится ТОЛЬКО здесь, в переменных окружения.
// В браузер он не попадает ни в каком виде — ни открытым, ни хешем.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);
const ADMIN_COOKIE = 'havex_admin';

// Админка не работает без явно заданного пароля — лучше упасть громко,
// чем запустить панель с дефолтным доступом.
if (!ADMIN_PASSWORD) {
  console.warn('  [admin] ADMIN_PASSWORD не задан — вход в панель заблокирован');
}
if (!ADMIN_SESSION_SECRET) {
  console.warn('  [admin] ADMIN_SESSION_SECRET не задан — токены будут сбрасываться при рестарте');
}

// Секрет, которым подписывается cookie. Если не задан — генерируем случайный
// на время жизни процесса (сессии просто не переживут перезапуск).
const SESSION_SECRET = ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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

/* ------------------------------------------------------------------ */
/*  Авторизация панели: пароль проверяется на сервере                 */
/* ------------------------------------------------------------------ */

// Сравнение без утечки по времени
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Токен сессии = "срок.подпись", подпись считается от срока секретом сервера.
// Так не нужна ни база, ни память: подделать токен без секрета нельзя.
function signSession(exp) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex');
}

function makeSessionToken() {
  const exp = Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000;
  return exp + '.' + signSession(exp);
}

function isValidSessionToken(token) {
  if (!token || token.indexOf('.') === -1) return false;
  const parts = token.split('.');
  const exp = Number(parts[0]);
  const sig = parts[1];
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, signSession(exp));
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const pairs = raw.split(';');
  for (let i = 0; i < pairs.length; i++) {
    const idx = pairs[i].indexOf('=');
    if (idx === -1) continue;
    if (pairs[i].slice(0, idx).trim() === name) {
      return decodeURIComponent(pairs[i].slice(idx + 1).trim());
    }
  }
  return '';
}

function hasAdminSession(req) {
  return isValidSessionToken(readCookie(req, ADMIN_COOKIE));
}

function setAdminCookie(res, token) {
  const maxAge = ADMIN_SESSION_HOURS * 3600;
  // X-Forwarded-Proto учитываем через trust proxy: на Railway сайт за HTTPS
  const secure = isHttps(res.req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    ADMIN_COOKIE + '=' + encodeURIComponent(token) +
      '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + secure
  );
}

function clearAdminCookie(res) {
  const secure = isHttps(res.req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    ADMIN_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure
  );
}

function isHttps(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'] || '';
  return String(proto).split(',')[0].trim() === 'https';
}

// Тормоз для перебора: 8 попыток за 15 минут на IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Слишком много попыток. Попробуйте через 15 минут.' },
});

// Текущее состояние: авторизован ли браузер
app.get('/api/admin/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, auth: hasAdminSession(req), configured: Boolean(ADMIN_PASSWORD) });
});

// Вход
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ ok: false, error: 'Пароль панели не настроен на сервере.' });
  }

  const pass = String((req.body && req.body.password) || '');
  if (!pass) return res.status(400).json({ ok: false, error: 'Введите пароль' });

  if (!safeEqual(pass, ADMIN_PASSWORD)) {
    // Небольшая задержка, чтобы перебор не был мгновенным даже при лимите
    return setTimeout(
      () => res.status(401).json({ ok: false, error: 'Неверный пароль' }),
      250
    );
  }

  setAdminCookie(res, makeSessionToken());
  res.json({ ok: true });
});

// Выход
app.post('/api/admin/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

// Файлы панели отдаём только авторизованным — хеша пароля в исходниках больше нет.
// Без сессии отдаём автономную страницу входа (login-required.html): у неё
// стили и скрипт внутри, поэтому она работает, даже когда admin.js закрыт.
function requireAdminSession(req, res, next) {
  if (hasAdminSession(req)) return next();
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).sendFile(path.join(ADMIN_DIR, 'login-required.html'));
}

app.use('/adminpanel', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/adminpanel', (_req, res) => res.redirect(301, '/adminpanel/'));
app.get('/adminpanel/', requireAdminSession, (_req, res) =>
  res.sendFile(path.join(ADMIN_DIR, 'index.html'))
);

// Файлы панели: только имя без слэшей, чтобы исключить traversal
app.get('/adminpanel/:file', (req, res, next) => {
  const file = req.params.file;
  if (!file || !/^[a-zA-Z0-9._-]+$/.test(file)) return next();
  if (file === 'login-required.html') return next();
  requireAdminSession(req, res, () => {
    res.sendFile(path.join(ADMIN_DIR, file), (err) => {
      if (err) next();
    });
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
