'use strict';

/* ============================================================
   HAVEX — каталог продукции (PPF бронеплёнки)
   ============================================================ */

const PRODUCTS = [
  {
    code: 'HX-PPF-GL5',
    tag: 'Хит продаж',
    tagAlt: false,
    name: 'Gloss Guard 200',
    accent: '#8CD117',
    desc: 'Базовый глянцевый PPF для повседневной защиты. Полностью прозрачное покрытие, которое сохраняет заводской блеск и берёт на себя удары гравия на трассе.',
    specs: [
      ['Толщина', '200 мкм'],
      ['Рулон', '1.52 × 15 м'],
      ['Гарантия', '8 лет'],
      ['Эффект', 'Глянец'],
    ],
    price: '24 900 ₽',
    unit: 'за рулон 1.52 × 15 м',
  },
  {
    code: 'HX-PPF-MT8',
    tag: 'Новинка',
    tagAlt: true,
    name: 'Matte Satin 8',
    accent: '#A8C94A',
    desc: 'Матовый PPF для полной смены характера кузова. Превращает глянцевый лак в благородный сатиновый финиш и одновременно защищает его от сколов.',
    specs: [
      ['Толщина', '215 мкм'],
      ['Рулон', '1.52 × 15 м'],
      ['Гарантия', '8 лет'],
      ['Эффект', 'Мат / сатин'],
    ],
    price: '31 400 ₽',
    unit: 'за рулон 1.52 × 15 м',
  },
  {
    code: 'HX-PPF-CR10',
    tag: 'Premium',
    tagAlt: false,
    name: 'Ceramic Shield 10',
    accent: '#7AB800',
    desc: 'Топовый продукт с интегрированным керамическим слоем. Гидрофобная поверхность отталкивает грязь и воду, а гарантия достигает 10 лет.',
    specs: [
      ['Толщина', '230 мкм'],
      ['Рулон', '1.52 × 15 м'],
      ['Гарантия', '10 лет'],
      ['Эффект', 'Глянец + керамика'],
    ],
    price: '42 800 ₽',
    unit: 'за рулон 1.52 × 15 м',
  },
  {
    code: 'HX-PPF-TN35',
    tag: '',
    tagAlt: false,
    name: 'Tint Guard 35',
    accent: '#6E9E14',
    desc: 'Тонировочная защитная плёнка для стёкол и оптики. Снижает нагрев салона, блокирует UV и защищает фары от пескоструя, оставаясь прозрачной изнутри.',
    specs: [
      ['Толщина', '150 мкм'],
      ['Рулон', '1.52 × 30 м'],
      ['Гарантия', '7 лет'],
      ['Светопропускание', '35%'],
    ],
    price: '18 600 ₽',
    unit: 'за рулон 1.52 × 30 м',
  },
  {
    code: 'HX-PPF-HL4',
    tag: '',
    tagAlt: false,
    name: 'Headlight Armor',
    accent: '#B4E03A',
    desc: 'Комплект плёнки для фар и фонарей. Защищает дорогостоящую оптику от мелких камней и помутнения, выдерживает нагрев и мойку под давлением.',
    specs: [
      ['Толщина', '180 мкм'],
      ['Комплект', '2 фары + 2 фонаря'],
      ['Гарантия', '7 лет'],
      ['Эффект', 'Прозрачный'],
    ],
    price: '6 400 ₽',
    unit: 'за готовый комплект',
  },
];

/* ---------- render catalog ---------- */
function rollMarkup(p) {
  return `
    <div class="roll" style="--accent:${p.accent}">
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
    ? `<div class="card__tag${p.tagAlt ? ' card__tag--alt' : ''}">${p.tag}</div>`
    : '';

  const specs = p.specs
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  return `
    <article class="card reveal" data-product="${p.name}">
      ${tag}
      <div class="card__media">${rollMarkup(p)}</div>
      <div class="card__body">
        <p class="card__code">${p.code}</p>
        <h3 class="card__name">${p.name}</h3>
        <p class="card__desc">${p.desc}</p>
        <dl class="card__specs">${specs}</dl>
        <div class="card__foot">
          <div class="card__price">${p.price}<small>${p.unit}</small></div>
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
    const name = card ? card.dataset.product : '';
    const select = document.getElementById('f-product');

    if (select && name) {
      const match = [...select.options].find((o) => o.value.startsWith(name));
      if (match) select.value = match.value;
    }

    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('f-name')?.focus({ preventScroll: true }), 620);
  });
}

function initYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = String(new Date().getFullYear());
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

    try {
      const res = await fetch('/api/lead', {
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
  fillProductOptions();
  initHeader();
  initReveal();
  initCursorGlow();
  initOrderButtons();
  initForm();
  initYear();
  initReveal(); // pick up dynamically injected cards
});
