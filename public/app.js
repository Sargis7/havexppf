'use strict';

/* ============================================================
   HAVEX — сайт. Данные берутся из /data/catalog.js (window.HAVEX_DATA)
   и правятся через админку /adminpanel/
   ============================================================ */

const DATA = window.HAVEX_DATA || { products: [], settings: {}, gallery: [], videos: [] };
const SETTINGS = DATA.settings || {};
const ALL_PRODUCTS = Array.isArray(DATA.products) ? DATA.products : [];
const PRODUCTS = ALL_PRODUCTS.filter((p) => !p.hidden);

/* ---------- helpers ---------- */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const n = Number(value);
  if (!n || n <= 0) return 'Цена по запросу';
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

/* ---------- render catalog ---------- */
function rollMarkup(p) {
  return `
    <div class="roll" style="--accent:${esc(p.accent || '#8CD117')}">
      <div class="roll__box"></div>
      <div class="roll__label">
        <b>HAVE<i>X</i></b>
        <em>PPF</em>
        <div class="roll__bars"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="roll__sub">Paint<br>Protection<br>Film</div>
      <div class="roll__mark">HAVE<span>X</span></div>
    </div>`;
}

function cardMarkup(p) {
  const tag = p.tag
    ? `<div class="card__tag${p.tagAlt ? ' card__tag--alt' : ''}">${esc(p.tag)}</div>`
    : '';

  const specs = (p.specs || [])
    .map((s) => `<div><dt>${esc(s[0])}</dt><dd>${esc(s[1])}</dd></div>`)
    .join('');

  const media = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" class="card__photo">`
    : rollMarkup(p);

  return `
    <article class="card reveal" data-product="${esc(p.name)}" data-code="${esc(p.code)}">
      ${tag}
      <div class="card__media">${media}</div>
      <div class="card__body">
        <p class="card__code">${esc(p.code)}</p>
        <h3 class="card__name">${esc(p.name)}</h3>
        <p class="card__desc">${esc(p.desc)}</p>
        <dl class="card__specs">${specs}</dl>
        <div class="card__foot">
          <div class="card__price">${esc(money(p.price))}<small>${esc(p.unit)}</small></div>
          <button type="button" class="card__btn" data-order>Заказать</button>
        </div>
      </div>
    </article>`;
}

function renderCatalog() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = PRODUCTS.map(cardMarkup).join('');
}

/* ---------- settings applied to the page ---------- */
function applySettings() {
  const s = SETTINGS;

  const setText = (sel, value) => {
    document.querySelectorAll(sel).forEach((el) => { if (value) el.textContent = value; });
  };
  const setLink = (sel, href) => {
    if (!href) return;
    document.querySelectorAll(sel).forEach((el) => { el.href = href; });
  };

  const words = document.querySelectorAll('.hero__word');
  if (words[0] && s.heroTitle1) words[0].textContent = s.heroTitle1;
  if (words[1] && s.heroTitle2) words[1].textContent = s.heroTitle2;
  if (words[2] && s.heroTitle3) words[2].textContent = s.heroTitle3;

  const lead = document.querySelector('.hero__lead');
  if (lead && s.heroLead) lead.textContent = s.heroLead;

  setText('[data-site-phone]', s.phone);
  setText('[data-site-hours]', s.hours);

  document.querySelectorAll('[data-site-phone]').forEach((el) => {
    if (el.tagName === 'A' && s.phone) el.href = 'tel:' + String(s.phone).replace(/[^\d+]/g, '');
  });
  document.querySelectorAll('[data-site-email]').forEach((el) => {
    if (el.tagName === 'A' && s.email) el.href = 'mailto:' + s.email;
  });

  setLink('[data-social="instagram"]', s.instagram);
  setLink('[data-social="telegram"]', s.telegram);
  setLink('[data-social="youtube"]', s.youtube);

  /* hero eyebrow + contacts block are optional extras */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

/* ---------- gallery ---------- */
function renderGallery() {
  const section = document.getElementById('gallery');
  if (!section) return;

  const items = Array.isArray(DATA.gallery) ? DATA.gallery : [];
  if (!SETTINGS.galleryShow || !items.length) {
    section.remove();
    return;
  }

  const titleEl = section.querySelector('[data-gallery-title]');
  const leadEl = section.querySelector('[data-gallery-lead]');
  if (titleEl && SETTINGS.galleryTitle) titleEl.textContent = SETTINGS.galleryTitle;
  if (leadEl && SETTINGS.galleryLead) leadEl.textContent = SETTINGS.galleryLead;

  const grid = section.querySelector('[data-gallery-grid]');
  if (!grid) return;

  grid.innerHTML = items.map((it) => `
    <figure class="shot reveal">
      <img src="${esc(it.image)}" alt="${esc(it.caption || 'Работа HAVEX')}" loading="lazy">
      ${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ''}
    </figure>`).join('');
}

function fillProductOptions() {
  const select = document.getElementById('f-product');
  if (!select) return;
  PRODUCTS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = `${p.name} (${p.code})`;
    opt.textContent = `${p.name} — ${p.code}`;
    select.appendChild(opt);
  });
  const other = document.createElement('option');
  other.value = 'Другое / нужна консультация';
  other.textContent = 'Другое — нужна консультация';
  select.appendChild(other);
}

/* ============================================================
   UI behaviour
   ============================================================ */
function initHeader() {
  const header = document.getElementById('header');
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  if (!header) return;

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

function initReveal() {
  const items = document.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        setTimeout(() => entry.target.classList.add('in'), Math.min(i * 70, 350));
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  items.forEach((el) => io.observe(el));
}

function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow || window.matchMedia('(pointer: coarse)').matches) return;

  let x = 0, y = 0, tx = 0, ty = 0, raf = null;

  const loop = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    glow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    raf = Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4 ? requestAnimationFrame(loop) : null;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX; ty = e.clientY;
      glow.classList.add('on');
      if (!raf) raf = requestAnimationFrame(loop);
    },
    { passive: true }
  );
}

function initOrderButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-order]');
    if (!btn) return;

    const card = btn.closest('.card');
    const code = card ? card.dataset.code : '';
    const name = card ? card.dataset.product : '';
    const select = document.getElementById('f-product');

    if (select && (code || name)) {
      const match = [...select.options].find((o) =>
        (code && o.value.includes(code)) || (name && o.value.startsWith(name))
      );
      if (match) select.value = match.value;
    }

    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('f-name')?.focus({ preventScroll: true }), 620);
  });
}

/* ============================================================
   Lead form -> POST /api/lead -> Telegram
   ============================================================ */
function initForm() {
  const form = document.getElementById('leadForm');
  if (!form) return;

  const status = document.getElementById('formStatus');
  const submit = document.getElementById('submitBtn');

  const showStatus = (type, text) => {
    status.className = `form__status show ${type}`;
    status.textContent = text;
  };

  const clearErrors = () => {
    form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    form.querySelectorAll('.field__err').forEach((s) => { s.textContent = ''; });
  };

  const fail = (fieldName, message) => {
    const input = form.elements[fieldName];
    const wrap = input?.closest('.field');
    if (wrap) {
      wrap.classList.add('invalid');
      const box = wrap.querySelector('.field__err');
      if (box) box.textContent = message;
    }
    input?.focus();
    return false;
  };

  const validate = () => {
    clearErrors();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim();

    if (name.length < 2) return fail('name', 'Укажите имя');
    if (phone.replace(/\D/g, '').length < 10) return fail('phone', 'Укажите корректный номер телефона');
    if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail('email', 'Некорректный email');
    return true;
  };

  // light phone formatting
  form.elements.phone?.addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d+]/g, '');
    if (v.startsWith('8') && v.length > 1) v = '+7' + v.slice(1);
    e.target.value = v;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.classList.contains('loading')) return;

    status.className = 'form__status';
    if (!validate()) return;

    submit.classList.add('loading');
    submit.disabled = true;

    const payload = Object.fromEntries(new FormData(form).entries());

    // Локальный сервер: свой же origin. Демо на статике: window.HAVEX_API не задан
    if (!window.HAVEX_API) {
      form.reset();
      showStatus('ok', 'Это демо-версия сайта. Форма заработает после подключения сервера и Telegram — напишите нам напрямую в Telegram.');
      submit.classList.remove('loading');
      submit.disabled = false;
      return;
    }

    try {
      const res = await fetch(window.HAVEX_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Не удалось отправить заявку');
      }

      form.reset();
      showStatus('ok', 'Заявка отправлена! Менеджер свяжется с вами в течение 15 минут в рабочее время.');
    } catch (err) {
      showStatus('err', err.message || 'Ошибка сети. Попробуйте ещё раз или напишите нам в Telegram.');
    } finally {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();
  renderGallery();
  fillProductOptions();
  applySettings();
  initHeader();
  initCursorGlow();
  initOrderButtons();
  initForm();
  initReveal(); // must run after dynamic content is injected
});
