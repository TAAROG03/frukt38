/* ================= СМЕНА ТЕМЫ ================= */
const themeToggleBtn = document.getElementById('themeToggle');
const htmlElement = document.documentElement;

function applyTheme(theme) {
  htmlElement.setAttribute('data-theme', theme);
  localStorage.setItem('fruitShopTheme', theme);
  if (theme === 'dark') themeToggleBtn.textContent = '☀️';
  else themeToggleBtn.textContent = '🌙';
}

const savedTheme = localStorage.getItem('fruitShopTheme');
if (savedTheme) applyTheme(savedTheme);
else {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

themeToggleBtn.addEventListener('click', () => {
  const currentTheme = htmlElement.getAttribute('data-theme');
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
});

/* ================= НАСТРОЙКА БАЗЫ ДАННЫХ ================= */
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1tcat8Mlo8Fq31xRMWY9AJs84mcpH-AKhiEv6VvAbBn0/export?format=csv";
/* ========================================================= */

const DEFAULT_COLORS = { fruits: ['#ff416c', '#ff4b2b'], vegetables: ['#f7971e', '#ffd200'], greens: ['#56ab2f', '#a8e063'] };
const DEFAULT_EMOJI = { fruits: '🍎', vegetables: '🥦', greens: '🌿' };

let PRODUCTS = []; 
const state = { query: '', category: 'all', sort: 'name' };
let currentProduct = null;
let swipeGuard = false;
let pointerStart = null;

const $ = s => document.querySelector(s);

const els = {
  grid: $('#grid'), count: $('#count'), search: $('#search'),
  chips: $('#chips'), sort: $('#sort'), modal: $('#modal'),
  modalBody: $('#modalBody'), catalog: $('#catalog'),
  backToTop: $('#backToTop')
};

function plural(n, forms) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return forms[0];
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return forms[1];
  return forms[2];
}

/* ================= ПАРСЕР CSV ================= */
function parseCSV(text) {
  const lines = [];
  let currentLine = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i], nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') { currentCell += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentCell); currentCell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentLine.push(currentCell);
      if (currentLine.length > 1 || currentLine[0] !== '') lines.push(currentLine);
      currentLine = []; currentCell = '';
    } else { currentCell += char; }
  }
  if (currentCell !== '' || currentLine.length > 0) {
    currentLine.push(currentCell); lines.push(currentLine);
  }
  return lines;
}

/* ================= ЗАГРУЗКА ДАННЫХ ================= */
async function loadData() {
  renderSkeletons();
  try {
    const noCacheUrl = GOOGLE_SHEET_CSV_URL + '&_=' + new Date().getTime();
    const response = await fetch(noCacheUrl);
    if (!response.ok) throw new Error('Ошибка сети');
    
    const csvText = await response.text();
    if (csvText.trim().startsWith('<!DOCTYPE html>')) throw new Error('Ошибка доступа.');

    const rows = parseCSV(csvText);
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i].map(c => String(c).trim().toLowerCase().replace(/^\uFEFF/, ''));
      if (row.includes('id') || row.includes('name_ru') || row.includes('наименование')) { headerRowIndex = i; break; }
    }
    if (headerRowIndex === -1) throw new Error('Не найдены заголовки.');

    const headers = rows[headerRowIndex].map(h => String(h).trim().toLowerCase().replace(/^\uFEFF/, ''));
    const dataRows = rows.slice(headerRowIndex + 1);

    const findIdx = (names) => {
      for (const n of names) {
        const idx = headers.findIndex(h => h === n || h.includes(n));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idx = {
      id: findIdx(['id']), name: findIdx(['name_ru', 'наименование']),
      cat: findIdx(['category', 'категория']), asm: findIdx(['assortment', 'описание']),
      stock: findIdx(['unit', 'наличие', 'остаток', 'вес']), man: findIdx(['manufacturer', 'производитель']),
      price: findIdx(['desc', 'price', 'цена']), img1: findIdx(['img1']), img2: findIdx(['img2']), img3: findIdx(['img3'])
    };

    PRODUCTS = dataRows.map(row => {
      const getVal = (i) => (i !== -1 && row[i] !== undefined) ? String(row[i]).trim() : '';
      const id = getVal(idx.id), name = getVal(idx.name);
      if (!id && !name) return null;

      const rawCat = getVal(idx.cat).toLowerCase().replace(/[^a-zа-яё]/g, ''); 
      let cat = 'fruits'; 
      if (rawCat.includes('veg') || rawCat.includes('овощ')) cat = 'vegetables';
      else if (rawCat.includes('green') || rawCat.includes('зелен')) cat = 'greens';

      const rawPrice = getVal(idx.price);
      const matchPrice = rawPrice.match(/[\d.,]+/); 
      const cleanPrice = matchPrice ? matchPrice[0].replace(',', '.') : '';
      
      const rawImgs = [getVal(idx.img1), getVal(idx.img2), getVal(idx.img3)].filter(Boolean);
      const colors = DEFAULT_COLORS[cat] || DEFAULT_COLORS.fruits;
      
      const images = rawImgs.length ? rawImgs.map((val, index) => {
        const isUrl = val.startsWith('http');
        return { url: isUrl ? val : null, emoji: !isUrl ? val : null, c1: colors[0], c2: colors[1] };
      }) : [{ emoji: DEFAULT_EMOJI[cat], c1: colors[0], c2: colors[1] }];

      return { 
        id, name, category: cat, 
        assortment: getVal(idx.asm), 
        stock: getVal(idx.stock), 
        manufacturer: getVal(idx.man), 
        price: !isNaN(parseFloat(cleanPrice)) && cleanPrice !== '' ? parseFloat(cleanPrice) : null, 
        images 
      };
    }).filter(p => p !== null);

    renderCatalog();
  } catch (error) {
    console.error(error);
    els.grid.innerHTML = `<div class="empty"><div class="empty__icon">⚠️</div><p style="color: #ff4b2b;">${error.message}</p></div>`;
  }
}

function renderSkeletons() {
  let skeletonsHTML = '';
  for (let i = 0; i < 8; i++) {
    skeletonsHTML += `
      <div class="card skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="card__body" style="align-items: flex-start; padding: 24px;">
          <div class="skeleton skeleton-line short" style="margin-bottom: 15px;"></div>
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-line"></div>
        </div>
      </div>`;
  }
  els.grid.innerHTML = skeletonsHTML;
  els.count.textContent = 'Загрузка ассортимента...';
}

function slideHTML(im) {
  if (im.url) {
    return `<div class="slide"><img src="${im.url}" style="width:100%; height:100%; object-fit:cover;" loading="lazy"></div>`;
  }
  return `<div class="slide" style="--c1:${im.c1};--c2:${im.c2}"><span class="slide__emoji">${im.emoji}</span></div>`;
}

function dotsHTML(images) {
  return images.map((_, i) => `<button class="dot${i === 0 ? ' is-active' : ''}" data-dot="${i}" type="button"></button>`).join('');
}

function sliderHTML(p, big) {
  const many = p.images.length > 1;
  const stockText = p.stock ? `Наличие: ${p.stock}` : 'Нет в наличии';
  
  return `<div class="slider${big ? ' slider--lg' : ''}" data-slider data-count="${p.images.length}" data-index="0">
    <div class="slider__track" data-track>${p.images.map(slideHTML).join('')}</div>
    ${many ? `
      <button class="slider__arrow slider__arrow--prev" data-slide="-1" type="button">‹</button>
      <button class="slider__arrow slider__arrow--next" data-slide="1" type="button">›</button>
      <div class="slider__dots">${dotsHTML(p.images)}</div>` : ''}
    ${!big ? `<span class="slider__unit">${stockText}</span>` : ''}
  </div>`;
}

function goSlide(slider, index) {
  const count = Number(slider.dataset.count);
  const i = ((index % count) + count) % count;
  slider.dataset.index = i;
  slider.querySelector('[data-track]').style.transform = `translateX(-${i * 100}%)`;
  slider.querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('is-active', k === i));
}
function shiftSlide(slider, dir) { goSlide(slider, (Number(slider.dataset.index) || 0) + dir); }

function handleSliderClick(e) {
  const slider = e.target.closest('[data-slider]');
  if (!slider) return false;
  const arrow = e.target.closest('[data-slide]');
  if (arrow) { e.stopPropagation(); shiftSlide(slider, Number(arrow.dataset.slide)); return true; }
  const dot = e.target.closest('[data-dot]');
  if (dot) { e.stopPropagation(); goSlide(slider, Number(dot.dataset.dot)); return true; }
  return false;
}

const CATEGORIES = [{ id: 'all', name: 'Все' }, { id: 'fruits', name: 'Фрукты' }, { id: 'vegetables', name: 'Овощи' }, { id: 'greens', name: 'Зелень' }];
const CAT_NAME = Object.fromEntries(CATEGORIES.map(c => [c.id, c.name]));

function hasStock(p) {
  if (!p.stock) return false;
  const s = p.stock.toLowerCase().trim();
  return s !== '' && s !== 'нет' && s !== 'нет в наличии';
}

function getVisible() {
  const q = state.query.trim().toLowerCase();
  const list = PRODUCTS.filter(p => {
    const byCat = state.category === 'all' || p.category === state.category;
    const byQuery = !q || p.name.toLowerCase().includes(q) || p.assortment.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q);
    return byCat && byQuery;
  });

  if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (state.sort === 'manufacturer') list.sort((a, b) => a.manufacturer.localeCompare(b.manufacturer, 'ru'));
  if (state.sort === 'assortment') list.sort((a, b) => a.assortment.localeCompare(b.assortment, 'ru'));

  list.sort((a, b) => {
    const aStock = hasStock(a), bStock = hasStock(b);
    if (aStock && !bStock) return -1;
    if (!aStock && bStock) return 1;
    return 0;
  });

  return list;
}

function cardHTML(p) {
  return `<article class="card card--${p.category}" data-id="${p.id}" tabindex="0" role="button">
    ${sliderHTML(p, false)}
    <div class="card__body">
      <span class="card__cat">${CAT_NAME[p.category] || p.category}</span>
      <h3 class="card__name">${p.name}</h3>
      <div class="card__divider"></div>
      <p class="card__asm">${p.assortment || 'Описание ассортимента уточняется'}</p>
    </div>
  </article>`;
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px 50px 0px' });

function renderCatalog() {
  const items = getVisible();
  const q = state.query.trim();

  els.count.textContent = q
    ? `По запросу «${q}» — ${items.length} ${plural(items.length, ['позиция', 'позиции', 'позиций'])}`
    : `${items.length} ${plural(items.length, ['позиция', 'позиции', 'позиций'])} в каталоге`;

  if (!items.length) {
    els.grid.innerHTML = `<div class="empty"><div class="empty__icon">🔍</div><p>По вашему запросу ничего не нашлось</p></div>`;
    return;
  }
  
  els.grid.innerHTML = items.map(cardHTML).join('');
  document.querySelectorAll('.card').forEach(card => observer.observe(card));
}

function renderChips() {
  els.chips.innerHTML = CATEGORIES.map(c => `
    <button class="chip${c.id === state.category ? ' is-active' : ''}" data-cat="${c.id}" type="button">${c.name}</button>`).join('');
}

function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  currentProduct = p;

  const availability = p.stock ? p.stock : 'Нет в наличии';
  let priceBlock;
  if (p.price !== null) {
    const formattedPrice = new Intl.NumberFormat('ru-RU').format(p.price);
    priceBlock = `<div class="m-price-block">${formattedPrice} <span class="m-price-currency">₽ / кг</span></div>`;
  } else {
    priceBlock = `<div class="m-price-empty">Скоро</div>`;
  }

  els.modalBody.innerHTML = `
    <div class="m-media">${sliderHTML(p, true)}</div>
    <button class="m-close" data-close type="button">✕</button>
    <div class="m-body">
      <span class="card__cat">${CAT_NAME[p.category] || p.category}</span>
      <h2>${p.name}</h2>
      <h3 class="m-title">Характеристики</h3>
      <div class="specs">
        <div><span>Описание</span><b>${p.assortment || '—'}</b></div>
        <div><span>Свободный остаток</span><b>${availability}</b></div>
        <div><span>Производитель</span><b>${p.manufacturer || '—'}</b></div>
      </div>
      <h3 class="m-title">Цена</h3>
      ${priceBlock}
      <p class="m-note">Объёмы поставки, минимальная партия и график отгрузок уточняются у менеджера.</p>
    </div>`;
  els.modal.classList.add('is-open');
  document.body.classList.add('is-locked');
}

function closeModal() {
  els.modal.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  currentProduct = null;
}

function scrollToCatalog() { els.catalog.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

els.search.addEventListener('input', e => { state.query = e.target.value; renderCatalog(); });
document.querySelectorAll('[data-scroll-catalog]').forEach(btn => btn.addEventListener('click', scrollToCatalog));

els.chips.addEventListener('click', e => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  state.category = chip.dataset.cat;
  renderChips();
  renderCatalog();
});

els.sort.addEventListener('change', e => { state.sort = e.target.value; renderCatalog(); });

els.grid.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  if (handleSliderClick(e)) return;
  if (swipeGuard) return;
  openProduct(card.dataset.id);
});

els.grid.addEventListener('pointerdown', e => {
  const slider = e.target.closest('[data-slider]');
  if (slider) pointerStart = { x: e.clientX, slider };
});
els.grid.addEventListener('pointerup', e => {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  if (Math.abs(dx) > 40 && Number(pointerStart.slider.dataset.count) > 1) {
    shiftSlide(pointerStart.slider, dx < 0 ? 1 : -1);
    swipeGuard = true;
    setTimeout(() => { swipeGuard = false; }, 60);
  }
  pointerStart = null;
});

els.modal.addEventListener('click', e => {
  if (e.target === els.modal || e.target.closest('[data-close]')) { closeModal(); return; }
  handleSliderClick(e);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && els.modal.classList.contains('is-open')) closeModal(); });

/* ================= ИНТЕРАКТИВНОСТЬ ================= */

// 3D Параллакс при движении мыши
const heroSection = document.getElementById('hero-section');
const heroLogoWrapper = document.getElementById('hero-logo-wrapper');
const bgFruits = document.querySelectorAll('.hero__bg-fruit');

if (heroSection && window.matchMedia('(hover: hover)').matches) {
  heroSection.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 30;
    
    heroLogoWrapper.style.transform = `translate(${x * 0.8}px, ${y * 0.8}px)`;
    
    bgFruits.forEach((fruit, index) => {
      const speed = index % 2 === 0 ? 1.5 : -1.5;
      fruit.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
    });
  });

  heroSection.addEventListener('mouseleave', () => {
    heroLogoWrapper.style.transform = `translate(0, 0)`;
    bgFruits.forEach(fruit => fruit.style.transform = `translate(0, 0)`);
  });
}

// Кнопка "Наверх"
window.addEventListener('scroll', () => {
  if (window.scrollY > 500) {
    els.backToTop.classList.add('is-visible');
  } else {
    els.backToTop.classList.remove('is-visible');
  }
});

els.backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ================= СКАЧИВАНИЕ В EXCEL (ПРАЙС + БЛАНК) ================= */
document.getElementById('downloadExcelBtn').addEventListener('click', () => {
  if (typeof XLSX === 'undefined') {
    alert("Библиотека для скачивания Excel не загрузилась. Проверьте интернет-соединение и обновите страницу.");
    return;
  }

  const items = getVisible();
  if (!items.length) {
    alert("Нет товаров для выгрузки. Измените фильтры поиска.");
    return;
  }

  // 1. Формируем данные для листа "Прайс"
  const priceData = items.map(p => ({
    "Наименование": p.name,
    "Цена (руб/кг)": p.price !== null ? p.price : 'Скоро',
    "Свободный остаток": p.stock || 'Нет в наличии'
  }));

  // 2. Формируем данные для листа "Бланк заказа" (добавляем пустые колонки для заполнения)
  const orderData = items.map(p => ({
    "Наименование": p.name,
    "Цена (руб/кг)": p.price !== null ? p.price : 'Скоро',
    "Свободный остаток": p.stock || 'Нет в наличии',
    "Количество (кг/шт)": "", // Клиент заполнит сам
    "Сумма (руб)": ""         // Клиент заполнит сам (или вставит формулу)
  }));

  // Создаем новую книгу
  const wb = XLSX.utils.book_new();
  
  // Создаем лист Прайс
  const wsPrice = XLSX.utils.json_to_sheet(priceData);
  wsPrice['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsPrice, "Прайс");

  // Создаем лист Бланк заказа
  const wsOrder = XLSX.utils.json_to_sheet(orderData);
  wsOrder['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsOrder, "Бланк заказа");

  // Сохраняем файл
  const date = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
  XLSX.writeFile(wb, `Прайс_и_Бланк_Фруктовая_лавка_${date}.xlsx`);
});
/* ======================================================= */

/* ================= Старт ================= */
renderChips();
loadData();
