/* =========================================================================
   HAVEX ADMIN PANEL
   Пароль -> GitHub PAT -> редактирование public/data/catalog.js
   ========================================================================= */
(function () {
    'use strict';

    /* ---------- КОНСТАНТЫ ---------- */

    // SHA-256 от пароля 'havex2026' — замените на свой (см. README)
    const PASS_HASH = 'ed97e31fde4ac2a0f235b3cae1b8ff4efbc21f566011563a994967edded676dd';

    const LS_TRUST     = 'havex_admin_trust_v1';
    const LS_SETTINGS  = 'havex_admin_settings_v1';
    const TRUST_DAYS   = 30;

    const DEFAULT_SETTINGS = {
        owner : 'Sargis7',
        repo  : 'havexppf',
        branch: 'main',
        token : ''
    };

    const PATHS = {
        catalog: 'public/data/catalog.js'
    };

    const API = 'https://api.github.com';

    /* ---------- УТИЛИТЫ ---------- */

    const $  = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function money(n) {
        n = Number(n) || 0;
        if (!n) return 'по запросу';
        return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
    }

    function slug(s) {
        const map = {
            а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i',
            й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t',
            у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'',
            э:'e', ю:'yu', я:'ya'
        };
        return String(s || '')
            .toLowerCase()
            .split('')
            .map((c) => (map[c] !== undefined ? map[c] : c))
            .join('')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'item';
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function today() {
        const d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    async function sha256(text) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /* ---------- TOASTS / BUSY ---------- */

    function toast(msg, kind) {
        const colors = {
            ok  : 'border-[#8CD117]/40 text-[#8CD117]',
            err : 'border-red-500/40 text-red-400',
            info: 'border-white/15 text-gray-300'
        };
        const el = document.createElement('div');
        el.className =
            'toast-in pointer-events-auto max-w-xs bg-[#141414] border rounded-xl px-4 py-3 text-sm shadow-2xl ' +
            (colors[kind] || colors.info);
        el.textContent = msg;
        $('#toasts').appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity .25s, transform .25s';
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            setTimeout(() => el.remove(), 260);
        }, 3800);
    }

    function busy(on, text) {
        $('#busy-text').textContent = text || 'Сохраняем…';
        $('#busy').classList.toggle('hidden', !on);
    }

    /* ---------- НАСТРОЙКИ И СЕССИЯ ---------- */

    function loadSettings() {
        try {
            const raw = localStorage.getItem(LS_SETTINGS);
            if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
            return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
        } catch (e) {
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings(s) {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
    }

    function isTrusted() {
        try {
            const until = Number(localStorage.getItem(LS_TRUST) || 0);
            return until > Date.now();
        } catch (e) {
            return false;
        }
    }

    function grantTrust(days) {
        localStorage.setItem(LS_TRUST, String(Date.now() + days * 86400000));
    }

    function revokeTrust() {
        localStorage.removeItem(LS_TRUST);
    }

    function showScreen(id) {
        ['#screen-gate', '#screen-setup', '#screen-panel'].forEach((sel) => {
            $(sel).classList.toggle('hidden', sel !== id);
        });
        window.scrollTo(0, 0);
    }

    /* ---------- BASE64 С КИРИЛЛИЦЕЙ ---------- */

    function b64encode(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return btoa(bin);
    }

    function b64decode(b64) {
        const bin = atob(String(b64 || '').replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    }

    /* ---------- GITHUB API ---------- */

    function ghHeaders(cfg) {
        return {
            Accept        : 'application/vnd.github+json',
            Authorization : 'Bearer ' + cfg.token,
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    function ghUrl(cfg, path) {
        return API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
               '/contents/' + path.split('/').map(encodeURIComponent).join('/') +
               '?ref=' + encodeURIComponent(cfg.branch || 'main');
    }

    async function ghGet(cfg, path) {
        const res = await fetch(ghUrl(cfg, path), { headers: ghHeaders(cfg), cache: 'no-store' });
        if (res.status === 404) return null;
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error('GitHub ' + res.status + ': ' + t.slice(0, 160));
        }
        return res.json();
    }

    // Читает файл -> { text, sha } или null, если файла нет
    async function readFile(cfg, path) {
        const data = await ghGet(cfg, path);
        if (!data || !data.content) return null;
        return { text: b64decode(data.content), sha: data.sha };
    }

    async function writeFile(cfg, path, text, sha, message) {
        const body = {
            message: message || ('admin: update ' + path),
            content: b64encode(text),
            branch : cfg.branch || 'main'
        };
        if (sha) body.sha = sha;

        const res = await fetch(ghUrl(cfg, path).replace(/\?ref=.*$/, ''), {
            method : 'PUT',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(cfg)),
            body   : JSON.stringify(body)
        });

        if (!res.ok) {
            const t = await res.text().catch(() => '');
            if (res.status === 409) throw new Error('Файл изменился на GitHub. Обновите данные и повторите.');
            if (res.status === 401) throw new Error('Токен недействителен или истёк.');
            if (res.status === 403) throw new Error('Нет прав на запись. Проверьте Contents: Read and write.');
            throw new Error('GitHub ' + res.status + ': ' + t.slice(0, 160));
        }
        return res.json();
    }

    // Загружает бинарник (base64) в репозиторий
    async function uploadBinary(cfg, path, base64, message) {
        const existing = await ghGet(cfg, path);
        const body = {
            message: message || ('admin: upload ' + path),
            content: base64,
            branch : cfg.branch || 'main'
        };
        if (existing && existing.sha) body.sha = existing.sha;

        const res = await fetch(ghUrl(cfg, path).replace(/\?ref=.*$/, ''), {
            method : 'PUT',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(cfg)),
            body   : JSON.stringify(body)
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error('Загрузка не удалась (GitHub ' + res.status + '): ' + t.slice(0, 160));
        }
        return res.json();
    }

    async function testConnection(cfg) {
        const res = await fetch(API + '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo), {
            headers: ghHeaders(cfg),
            cache  : 'no-store'
        });
        if (res.status === 401) throw new Error('Токен недействителен');
        if (res.status === 404) throw new Error('Репозиторий не найден или токен без доступа к нему');
        if (!res.ok) throw new Error('GitHub ' + res.status);
        return res.json();
    }

    /* ---------- КАТАЛОГ: ЧТЕНИЕ / ЗАПИСЬ ---------- */

    const EMPTY_DATA = {
        updated : '',
        settings: {},
        products: [],
        gallery : [],
        videos  : []
    };

    function normalizeData(raw) {
        const d = Object.assign({}, EMPTY_DATA, raw || {});
        d.settings = Object.assign({}, d.settings || {});
        d.products = Array.isArray(d.products) ? d.products : [];
        d.gallery  = Array.isArray(d.gallery)  ? d.gallery  : [];
        d.videos   = Array.isArray(d.videos)   ? d.videos   : [];
        return d;
    }

    // Выполняет содержимое catalog.js в изолированной области видимости
    function parseCatalog(text) {
        const sandbox = { window: {} };
        // eslint-disable-next-line no-new-func
        const fn = new Function('window', text + '\nreturn window.HAVEX_DATA;');
        const data = fn(sandbox.window);
        return normalizeData(data);
    }

    function serializeCatalog(data) {
        const clean = {
            updated : today(),
            settings: data.settings || {},
            products: data.products || [],
            gallery : data.gallery || [],
            videos  : data.videos || []
        };
        return (
            '/* HAVEX — каталог и настройки сайта.\n' +
            '   Файл управляется админ-панелью (/adminpanel/).\n' +
            '   При ручном редактировании соблюдайте формат JSON. */\n\n' +
            'window.HAVEX_DATA = ' + JSON.stringify(clean, null, 4) + ';\n'
        );
    }

    // Читает файл с GitHub, при ошибке (например, нет сети) оставляет данные как есть
    async function loadCatalog(cfg) {
        busy(true, 'Загружаем каталог…');
        try {
            const file = await readFile(cfg, PATHS.catalog);
            if (!file) {
                busy(false);
                throw new Error('Файл ' + PATHS.catalog + ' не найден в репозитории');
            }
            state.data = parseCatalog(file.text);
            state.sha  = file.sha;
            busy(false);
            return state.data;
        } catch (e) {
            busy(false);
            throw e;
        }
    }

    // Перечитывает sha перед записью, чтобы не перетереть чужие правки
    async function persist(cfg, message) {
        busy(true, 'Сохраняем в GitHub…');
        try {
            const fresh = await readFile(cfg, PATHS.catalog);
            const sha = fresh ? fresh.sha : state.sha;
            const text = serializeCatalog(state.data);
            await writeFile(cfg, PATHS.catalog, text, sha, message || 'admin: обновление каталога');
            state.sha = (await readFile(cfg, PATHS.catalog) || {}).sha || sha;
            busy(false);
            toast('Сохранено в GitHub', 'ok');
            return true;
        } catch (e) {
            busy(false);
            toast(e.message, 'err');
            return false;
        }
    }

    /* ---------- СОСТОЯНИЕ ---------- */

    const state = {
        cfg       : loadSettings(),
        data      : null,
        sha       : '',
        productId : null,   // индекс редактируемого товара (null = новый)
        videoId   : null,
        tab       : 'products'
    };

    function catalogUrl() {
        const c = state.cfg;
        return 'https://github.com/' + c.owner + '/' + c.repo + '/blob/' + (c.branch || 'main') + '/' + PATHS.catalog;
    }

    function repoLabel() {
        const c = state.cfg;
        $('#repo-label').textContent = c.owner + '/' + c.repo + ' @ ' + (c.branch || 'main');
    }

    /* ---------- ТОВАРЫ: ТАБЛИЦА ---------- */

    function renderProducts() {
        const list = state.data.products;
        const body = $('#products-body');

        $('#products-count').textContent =
            list.length + ' ' + plural(list.length, ['товар', 'товара', 'товаров']) +
            ' · ' + list.filter((p) => !p.hidden).length + ' на сайте';

        if (!list.length) {
            body.innerHTML = '<tr><td colspan="5" class="px-4 py-10 text-center text-sm text-gray-500">' +
                'Товаров пока нет. Нажмите «Новый товар».</td></tr>';
            return;
        }

        body.innerHTML = list.map((p, i) => {
            const thumb = p.image
                ? '<img src="/' + esc(p.image.replace(/^\/+/, '')) + '" class="w-9 h-9 rounded-lg object-cover border border-white/10" alt="">'
                : '<div class="w-9 h-9 rounded-lg border border-white/10" style="background:' + esc(p.accent || '#8CD117') + '22"></div>';
            const tag = p.tag
                ? '<span class="text-[11px] px-2 py-0.5 rounded-full border" style="border-color:' +
                  esc(p.accent || '#8CD117') + '55;color:' + esc(p.accent || '#8CD117') + '">' + esc(p.tag) + '</span>'
                : '<span class="text-gray-600">—</span>';

            return (
                '<tr class="border-b border-white/5 hover:bg-white/[0.03] transition' + (p.hidden ? ' opacity-45' : '') + '">' +
                    '<td class="px-4 py-3 max-w-0 w-[46%]">' +
                        '<div class="flex items-center gap-3">' + thumb +
                            '<div class="min-w-0">' +
                                '<div class="font-medium truncate">' + esc(p.name || 'Без названия') + '</div>' +
                                '<div class="text-[11px] text-gray-500 truncate">' + esc(p.desc || '') + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td class="px-4 py-3 hidden sm:table-cell font-mono text-xs text-gray-400">' + esc(p.code || '—') + '</td>' +
                    '<td class="px-4 py-3 hidden md:table-cell">' + tag + '</td>' +
                    '<td class="px-4 py-3 text-right whitespace-nowrap">' + esc(money(p.price)) + '</td>' +
                    '<td class="px-4 py-3 text-right whitespace-nowrap">' +
                        '<button data-edit="' + i + '" class="text-xs text-[#8CD117] hover:underline whitespace-nowrap">Изменить</button>' +
                        '<button data-del="' + i + '" class="text-xs text-red-400 hover:underline whitespace-nowrap ml-3">Удалить</button>' +
                    '</td>' +
                '</tr>'
            );
        }).join('');

        body.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => editProduct(Number(btn.dataset.edit)));
        });
        body.querySelectorAll('[data-del]').forEach((btn) => {
            btn.addEventListener('click', () => deleteProduct(Number(btn.dataset.del)));
        });
    }

    function plural(n, forms) {
        const a = Math.abs(n) % 100;
        const b = a % 10;
        if (a > 10 && a < 20) return forms[2];
        if (b > 1 && b < 5) return forms[1];
        if (b === 1) return forms[0];
        return forms[2];
    }

    /* ---------- ТОВАРЫ: ФОРМА ---------- */

    function specRow(k, v) {
        const row = document.createElement('div');
        row.className = 'spec-row flex gap-2';
        row.innerHTML =
            '<input class="fld spec-k text-xs" placeholder="Параметр" value="' + esc(k || '') + '">' +
            '<input class="fld spec-v text-xs" placeholder="Значение" value="' + esc(v || '') + '">' +
            '<button type="button" class="btn btn-ghost btn-sm spec-del shrink-0" title="Удалить">×</button>';
        row.querySelector('.spec-del').addEventListener('click', () => row.remove());
        return row;
    }

    function addSpecRow(k, v) {
        $('#spec-rows').appendChild(specRow(k, v));
    }

    function resetProductForm() {
        state.productId = null;
        $('#product-form-title').textContent = 'Новый товар';
        $('#product-form-id').textContent = 'Заполните поля и сохраните';

        $('#prod-name').value = '';
        $('#prod-code').value = '';
        $('#prod-price').value = '';
        $('#prod-unit').value = 'рулон';
        $('#prod-accent').value = '#8CD117';
        $('#prod-accent-text').value = '#8CD117';
        $('#prod-tag').value = '';
        $('#prod-tag-alt').checked = false;
        $('#prod-desc').value = '';
        $('#prod-image').value = '';
        $('#prod-hidden').checked = false;

        const rows = $('#spec-rows');
        rows.innerHTML = '';
        addSpecRow('', '');
        addSpecRow('', '');

        updateImagePreview();
        $('#product-delete').classList.add('hidden');
    }

    function editProduct(i) {
        const p = state.data.products[i];
        if (!p) return;

        state.productId = i;
        $('#product-form-title').textContent = 'Изменить товар';
        $('#product-form-id').textContent = '#' + (i + 1) + ' · ' + (p.code || 'без кода');

        $('#prod-name').value = p.name || '';
        $('#prod-code').value = p.code || '';
        $('#prod-price').value = p.price || '';
        $('#prod-unit').value = p.unit || '';
        $('#prod-accent').value = p.accent || '#8CD117';
        $('#prod-accent-text').value = p.accent || '#8CD117';
        $('#prod-tag').value = p.tag || '';
        $('#prod-tag-alt').checked = !!p.tagAlt;
        $('#prod-desc').value = p.desc || '';
        $('#prod-image').value = p.image || '';
        $('#prod-hidden').checked = !!p.hidden;

        const rows = $('#spec-rows');
        rows.innerHTML = '';
        const specs = Array.isArray(p.specs) ? p.specs : [];
        if (specs.length) {
            specs.forEach((pair) => addSpecRow(pair[0], pair[1]));
        } else {
            addSpecRow('', '');
        }

        updateImagePreview();
        $('#product-delete').classList.remove('hidden');
        $('#product-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateImagePreview() {
        const box = $('#prod-image-preview');
        const src = ($('#prod-image').value || '').trim().replace(/^\/+/, '');
        if (src) {
            box.innerHTML = '<img src="/' + esc(src) + '" alt="" class="w-full h-full object-cover">';
        } else {
            box.textContent = 'нет';
        }
    }

    function collectSpecs() {
        return $$('#spec-rows .spec-row')
            .map((row) => [
                row.querySelector('.spec-k').value.trim(),
                row.querySelector('.spec-v').value.trim()
            ])
            .filter((pair) => pair[0] || pair[1]);
    }

    async function saveProduct() {
        const name = $('#prod-name').value.trim();
        if (!name) { toast('Укажите название товара', 'err'); return; }

        const accent = ($('#prod-accent-text').value.trim() || $('#prod-accent').value || '#8CD117');
        if (!/^#[0-9a-fA-F]{6}$/.test(accent)) { toast('Цвет должен быть в формате #RRGGBB', 'err'); return; }

        const product = {
            code  : $('#prod-code').value.trim() || ('HX-' + slug(name).toUpperCase().slice(0, 10)),
            name  : name,
            accent: accent,
            tag   : $('#prod-tag').value.trim(),
            tagAlt: $('#prod-tag-alt').checked,
            desc  : $('#prod-desc').value.trim(),
            specs : collectSpecs(),
            price : Number($('#prod-price').value) || 0,
            unit  : $('#prod-unit').value.trim() || 'рулон',
            image : $('#prod-image').value.trim().replace(/^\/+/, ''),
            hidden: $('#prod-hidden').checked
        };

        if (state.productId === null) {
            state.data.products.push(product);
        } else {
            state.data.products[state.productId] = product;
        }

        const isNew = state.productId === null;
        const ok = await persist(state.cfg, 'admin: ' + (isNew ? 'добавлен товар ' : 'обновлён товар ') + product.code);
        if (ok) {
            renderProducts();
            resetProductForm();
        }
    }

    async function deleteProduct(i) {
        const p = state.data.products[i];
        if (!p) return;
        if (!confirm('Удалить товар «' + (p.name || 'без названия') + '»? Действие нельзя отменить.')) return;

        state.data.products.splice(i, 1);
        const ok = await persist(state.cfg, 'admin: удалён товар ' + (p.code || ''));
        if (ok) {
            renderProducts();
            resetProductForm();
        }
    }


    /* ---------- ЗАГРУЗКА ИЗОБРАЖЕНИЙ ---------- */

    const MAX_EDGE  = 1600;
    const JPEG_Q    = 0.85;

    // Сжимает файл до MAX_EDGE по длинной стороне, возвращает { dataUrl, base64, ext }
    function compressImage(file, maxEdge) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('Это не изображение'));
                return;
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Не удалось открыть изображение'));
                img.onload = () => {
                    const limit = maxEdge || MAX_EDGE;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    const scale = Math.min(1, limit / Math.max(w, h));
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, w, h);

                    const keepPng = file.type === 'image/png' && file.size < 400 * 1024;
                    const mime = keepPng ? 'image/png' : 'image/jpeg';
                    const dataUrl = canvas.toDataURL(mime, JPEG_Q);
                    resolve({
                        dataUrl: dataUrl,
                        base64 : dataUrl.split(',')[1],
                        ext    : keepPng ? 'png' : 'jpg',
                        width  : w,
                        height : h
                    });
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function uploadImage(file, folder, baseName) {
        const packed = await compressImage(file);
        const name = slug(baseName || file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now().toString(36) + '.' + packed.ext;
        const path = folder.replace(/\/+$/, '') + '/' + name;

        busy(true, 'Загружаем фото…');
        try {
            await uploadBinary(state.cfg, path, packed.base64, 'admin: загружено фото ' + name);
            busy(false);
            toast('Фото загружено', 'ok');
            return path;
        } catch (e) {
            busy(false);
            toast(e.message, 'err');
            return null;
        }
    }

    /* ---------- ПРИМЕРЫ РАБОТ ---------- */

    function renderGallery() {
        const grid = $('#gallery-grid');
        const items = state.data.gallery;

        const addCard =
            '<button id="gal-tile-add" class="aspect-[4/3] rounded-xl border-2 border-dashed border-white/15 ' +
            'hover:border-[#8CD117]/60 hover:bg-[#8CD117]/5 transition flex flex-col items-center justify-center gap-2 text-gray-500">' +
                '<span class="text-2xl leading-none">+</span>' +
                '<span class="text-xs">Добавить фото</span>' +
            '</button>';

        if (!items.length) {
            grid.innerHTML = addCard;
        } else {
            grid.innerHTML = items.map((it, i) => (
                '<div class="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40">' +
                    '<img src="/' + esc(String(it.src || '').replace(/^\/+/, '')) + '" alt="" class="w-full aspect-[4/3] object-cover">' +
                    '<div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-3">' +
                        '<input data-title="' + i + '" value="' + esc(it.title || '') + '" placeholder="Подпись"' +
                        ' class="bg-black/60 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white mb-2 outline-none focus:border-[#8CD117]">' +
                        '<div class="flex gap-2">' +
                            '<button data-save="' + i + '" class="flex-1 text-xs bg-[#8CD117] text-black font-semibold rounded-lg py-1.5">Подпись</button>' +
                            '<button data-rm="' + i + '" class="text-xs border border-red-500/50 text-red-400 rounded-lg px-2.5 py-1.5">Удалить</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            )).join('') + addCard;

            grid.querySelectorAll('[data-save]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const i = Number(btn.dataset.save);
                    const input = grid.querySelector('[data-title="' + i + '"]');
                    state.data.gallery[i].title = input ? input.value.trim() : '';
                    await persist(state.cfg, 'admin: подпись фото');
                });
            });

            grid.querySelectorAll('[data-rm]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const i = Number(btn.dataset.rm);
                    if (!confirm('Удалить это фото из блока «Примеры работ»?')) return;
                    state.data.gallery.splice(i, 1);
                    if (!state.data.gallery.length) state.data.settings.galleryShow = false;
                    if (await persist(state.cfg, 'admin: удалено фото')) renderGallery();
                });
            });
        }

        const addBtn = document.getElementById('gal-tile-add');
        if (addBtn) addBtn.addEventListener('click', () => $('#gal-file').click());
    }

    async function uploadGalleryFiles(files) {
        if (!files || !files.length) return;
        const added = [];
        for (const file of Array.from(files)) {
            const path = await uploadImage(file, 'public/assets/gallery', file.name.replace(/\.[^.]+$/, ''));
            if (path) added.push({ src: path, title: '' });
        }
        if (!added.length) return;
        state.data.gallery = state.data.gallery.concat(added);
        state.data.settings.galleryShow = true;
        if (await persist(state.cfg, 'admin: добавлено ' + added.length + ' фото')) {
            renderGallery();
            $('#cfg-gallery-show').checked = true;
            toast('Добавлено фото: ' + added.length, 'ok');
        }
    }

    /* ---------- ВИДЕО ---------- */

    function renderVideos() {
        const list = $('#videos-list');
        const items = state.data.videos;

        if (!items.length) {
            list.innerHTML = '<div class="px-5 py-10 text-center text-sm text-gray-500">Видео пока нет.</div>';
            return;
        }

        list.innerHTML = items.map((v, i) => (
            '<div class="px-5 py-4 flex items-start gap-4' + (v.hidden ? ' opacity-45' : '') + '">' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="font-medium truncate">' + esc(v.title || 'Без названия') + '</div>' +
                    '<a href="' + esc(v.url || '#') + '" target="_blank" rel="noopener"' +
                    ' class="text-xs text-gray-500 hover:text-[#8CD117] truncate block mt-1">' + esc(v.url || '') + '</a>' +
                '</div>' +
                '<button data-vedit="' + i + '" class="text-xs text-[#8CD117] hover:underline shrink-0">Изменить</button>' +
                '<button data-vdel="' + i + '" class="text-xs text-red-400 hover:underline shrink-0">Удалить</button>' +
            '</div>'
        )).join('');

        list.querySelectorAll('[data-vedit]').forEach((btn) => {
            btn.addEventListener('click', () => editVideo(Number(btn.dataset.vedit)));
        });
        list.querySelectorAll('[data-vdel]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.vdel);
                if (!confirm('Удалить видео?')) return;
                state.data.videos.splice(i, 1);
                if (await persist(state.cfg, 'admin: удалено видео')) renderVideos();
            });
        });
    }

    function resetVideoForm() {
        state.videoId = null;
        $('#video-form-title').textContent = 'Новое видео';
        $('#vid-title').value = '';
        $('#vid-url').value = '';
        $('#vid-thumb').value = '';
        $('#vid-hidden').checked = false;
    }

    function editVideo(i) {
        const v = state.data.videos[i];
        if (!v) return;
        state.videoId = i;
        $('#video-form-title').textContent = 'Изменить видео';
        $('#vid-title').value = v.title || '';
        $('#vid-url').value = v.url || '';
        $('#vid-thumb').value = v.thumb || '';
        $('#vid-hidden').checked = !!v.hidden;
    }

    async function saveVideo() {
        const title = $('#vid-title').value.trim();
        const url = $('#vid-url').value.trim();
        if (!title) { toast('Укажите название', 'err'); return; }
        if (!/^https?:\/\/.+/i.test(url)) { toast('Ссылка должна начинаться с http(s)://', 'err'); return; }

        const video = {
            title : title,
            url   : url,
            thumb : $('#vid-thumb').value.trim().replace(/^\/+/, ''),
            hidden: $('#vid-hidden').checked
        };

        if (state.videoId === null) state.data.videos.push(video);
        else state.data.videos[state.videoId] = video;

        if (await persist(state.cfg, 'admin: видео ' + title)) {
            renderVideos();
            resetVideoForm();
        }
    }

    /* ---------- КОНТАКТЫ ---------- */

    function fillContacts() {
        const s = state.data.settings || {};
        $('#cfg-phone').value     = s.phone || '';
        $('#cfg-email').value     = s.email || '';
        $('#cfg-hours').value     = s.hours || '';
        $('#cfg-instagram').value = s.instagram || '';
        $('#cfg-telegram').value  = s.telegram || '';
        $('#cfg-youtube').value   = s.youtube || '';
    }

    async function saveContacts() {
        const s = state.data.settings;
        s.phone     = $('#cfg-phone').value.trim();
        s.email     = $('#cfg-email').value.trim();
        s.hours     = $('#cfg-hours').value.trim();
        s.instagram = $('#cfg-instagram').value.trim();
        s.telegram  = $('#cfg-telegram').value.trim();
        s.youtube   = $('#cfg-youtube').value.trim();

        const bad = ['instagram', 'telegram', 'youtube'].filter((k) => s[k] && !/^https?:\/\/.+/i.test(s[k]));
        if (bad.length) { toast('Ссылки соцсетей должны начинаться с https://', 'err'); return; }

        await persist(state.cfg, 'admin: контакты');
    }

    /* ---------- ТЕКСТЫ САЙТА ---------- */

    function fillContent() {
        const s = state.data.settings || {};
        $('#cfg-hero1').value      = s.heroTitle1 || '';
        $('#cfg-hero2').value      = s.heroTitle2 || '';
        $('#cfg-hero3').value      = s.heroTitle3 || '';
        $('#cfg-herolead').value   = s.heroLead || '';
        $('#cfg-gallery-show').checked = s.galleryShow !== false;
        $('#cfg-gallery-title').value  = s.galleryTitle || '';
        $('#cfg-gallery-lead').value   = s.galleryLead || '';
    }

    async function saveContent() {
        const s = state.data.settings;
        s.heroTitle1   = $('#cfg-hero1').value.trim();
        s.heroTitle2   = $('#cfg-hero2').value.trim();
        s.heroTitle3   = $('#cfg-hero3').value.trim();
        s.heroLead     = $('#cfg-herolead').value.trim();
        s.galleryShow  = $('#cfg-gallery-show').checked;
        s.galleryTitle = $('#cfg-gallery-title').value.trim();
        s.galleryLead  = $('#cfg-gallery-lead').value.trim();

        await persist(state.cfg, 'admin: тексты сайта');
    }

    /* ---------- ТАБЫ ---------- */

    const TABS = ['products', 'gallery', 'videos', 'contacts', 'content'];

    function switchTab(name) {
        if (TABS.indexOf(name) === -1) return;
        state.tab = name;

        $$('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
        TABS.forEach((t) => {
            const view = document.getElementById('view-' + t);
            if (view) view.classList.toggle('hidden', t !== name);
        });

        if (name === 'gallery') renderGallery();
        if (name === 'videos') renderVideos();
        if (name === 'contacts') fillContacts();
        if (name === 'content') fillContent();
        if (name === 'products' && state.productId !== null) resetProductForm();
    }

    /* ---------- ЗАГРУЗКА ПАНЕЛИ ---------- */

    async function enterPanel() {
        repoLabel();
        try {
            await loadCatalog(state.cfg);
        } catch (e) {
            toast(e.message, 'err');
            showScreen('#screen-setup');
            return;
        }
        renderProducts();
        resetProductForm();
        resetVideoForm();
        fillContacts();
        fillContent();
        renderGallery();
        renderVideos();
        switchTab('products');
        showScreen('#screen-panel');
    }

    /* ---------- ЭКРАН ПАРОЛЯ ---------- */

    async function onGateSubmit(e) {
        e.preventDefault();
        const pass = $('#gate-pass').value;
        const err = $('#gate-error');

        if (!pass) {
            err.textContent = 'Введите пароль';
            err.classList.remove('hidden');
            return;
        }

        const hash = await sha256(pass);
        if (hash !== PASS_HASH) {
            err.textContent = 'Неверный пароль';
            err.classList.remove('hidden');
            $('#gate-pass').value = '';
            $('#gate-pass').focus();
            return;
        }

        err.classList.add('hidden');
        if ($('#gate-remember').checked) grantTrust(TRUST_DAYS);

        const cfg = loadSettings();
        if (!cfg.token) {
            showScreen('#screen-setup');
            $('#set-owner').value  = cfg.owner;
            $('#set-repo').value   = cfg.repo;
            $('#set-branch').value = cfg.branch;
            return;
        }
        enterPanel();
    }

    /* ---------- ПОДКЛЮЧЕНИЕ ---------- */

    function readSetupForm() {
        return {
            owner : $('#set-owner').value.trim() || DEFAULT_SETTINGS.owner,
            repo  : $('#set-repo').value.trim() || DEFAULT_SETTINGS.repo,
            branch: $('#set-branch').value.trim() || 'main',
            token : $('#set-token').value.trim()
        };
    }

    function setupStatus(msg, kind) {
        const box = $('#setup-status');
        box.className = 'text-sm rounded-xl px-4 py-3 mb-4 ' + (
            kind === 'ok'  ? 'bg-[#8CD117]/10 border border-[#8CD117]/40 text-[#8CD117]' :
            kind === 'err' ? 'bg-red-500/10 border border-red-500/40 text-red-400' :
                             'bg-white/5 border border-white/15 text-gray-300'
        );
        box.textContent = msg;
        box.classList.remove('hidden');
    }

    async function onSetupTest() {
        const cfg = readSetupForm();
        if (!cfg.token) { setupStatus('Вставьте токен', 'err'); return; }

        setupStatus('Проверяем…', 'info');
        try {
            const info = await testConnection(cfg);
            setupStatus('Подключено: ' + info.full_name + ' (ветка ' + cfg.branch + ')', 'ok');
        } catch (e) {
            setupStatus(e.message, 'err');
        }
    }

    async function onSetupSave() {
        const cfg = readSetupForm();
        if (!cfg.token) { setupStatus('Вставьте токен', 'err'); return; }

        setupStatus('Проверяем доступ…', 'info');
        try {
            await testConnection(cfg);
        } catch (e) {
            setupStatus(e.message, 'err');
            return;
        }

        state.cfg = cfg;
        saveSettings(cfg);

        setupStatus('Готово. Загружаем каталог…', 'ok');
        await enterPanel();
    }

    /* ---------- ВЫХОД ---------- */

    function onLogout() {
        if (!confirm('Выйти из панели? Пароль потребуется ввести снова.')) return;
        revokeTrust();
        $('#gate-pass').value = '';
        showScreen('#screen-gate');
    }

    /* ---------- ИНИЦИАЛИЗАЦИЯ ---------- */

    function bindEvents() {
        // пароль
        $('#gate-form').addEventListener('submit', onGateSubmit);

        // подключение
        $('#setup-test').addEventListener('click', onSetupTest);
        $('#setup-save').addEventListener('click', onSetupSave);
        $('#btn-conn').addEventListener('click', () => {
            const cfg = loadSettings();
            $('#set-owner').value  = cfg.owner;
            $('#set-repo').value   = cfg.repo;
            $('#set-branch').value = cfg.branch;
            $('#set-token').value  = cfg.token;
            $('#setup-status').classList.add('hidden');
            showScreen('#screen-setup');
        });
        $('#btn-logout').addEventListener('click', onLogout);

        // табы
        $$('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
        if (location.hash && location.hash.length > 1) {
            switchTab(location.hash.slice(1));
        }

        // товары
        $('#product-new').addEventListener('click', () => {
            resetProductForm();
            $('#prod-name').focus();
        });
        $('#product-save').addEventListener('click', saveProduct);
        $('#product-cancel').addEventListener('click', resetProductForm);
        $('#product-delete').addEventListener('click', () => {
            if (state.productId !== null) deleteProduct(state.productId);
        });
        $('#spec-add').addEventListener('click', () => addSpecRow('', ''));

        // цвет: синхронизация двух полей
        $('#prod-accent').addEventListener('input', () => {
            $('#prod-accent-text').value = $('#prod-accent').value;
            updateImagePreview();
        });
        $('#prod-accent-text').addEventListener('input', () => {
            const v = $('#prod-accent-text').value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) $('#prod-accent').value = v;
        });

        // фото товара
        $('#prod-image').addEventListener('input', updateImagePreview);
        $('#prod-upload').addEventListener('click', () => $('#prod-file').click());
        $('#prod-file').addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const name = $('#prod-name').value.trim() || file.name.replace(/\.[^.]+$/, '');
            const path = await uploadImage(file, 'public/assets/products', name);
            if (path) {
                $('#prod-image').value = path;
                updateImagePreview();
            }
            e.target.value = '';
        });

        // галерея
        $('#gal-upload').addEventListener('click', () => $('#gal-file').click());
        $('#gal-file').addEventListener('change', async (e) => {
            await uploadGalleryFiles(e.target.files);
            e.target.value = '';
        });

        // видео
        $('#video-save').addEventListener('click', saveVideo);
        $('#video-cancel').addEventListener('click', resetVideoForm);

        // контакты / тексты
        $('#contacts-save').addEventListener('click', saveContacts);
        $('#content-save').addEventListener('click', saveContent);

        // Ctrl+S — сохранить текущее
        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
            e.preventDefault();
            if ($('#screen-panel').classList.contains('hidden')) return;
            if (state.tab === 'products') saveProduct();
            else if (state.tab === 'videos') saveVideo();
            else if (state.tab === 'contacts') saveContacts();
            else if (state.tab === 'content') saveContent();
        });
    }

    function boot() {
        bindEvents();
        if (isTrusted()) {
            const cfg = loadSettings();
            if (cfg.token) {
                enterPanel();
                return;
            }
        }
        showScreen('#screen-gate');
        $('#gate-pass').focus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
