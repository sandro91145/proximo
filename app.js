/* Próximo — news from reliable Portuguese outlets, plus strikes on Lisbon public transport.
 * news.json: headlines collected every hour from the outlets' public feeds (news-data branch),
 *   plus the IPMA weather forecast and warnings for Lisboa and Almada.
 * disruptions.json: strikes and disruptions, checked every morning from the news.
 * Plain JS, no build step.
 */
'use strict';

const TZ = 'Europe/Lisbon';
const NEWS_URL = 'https://raw.githubusercontent.com/sandro91145/proximo/news-data/news.json';
const STRIKES_STALE_H = 36;
const NEWS_STALE_H = 4;
const REFRESH_MS = 15 * 60 * 1000;
const HOME_PER_SECTION = 3;

// accent: each section's colour (CSS variable names defined in styles.css, light + dark)
const SECTIONS = [
  { key: 'inicio', pt: 'Início', en: 'Home', accent: '--ink' },
  { key: 'transportes', pt: 'Transportes', en: 'Transport', accent: '--sec-transportes' },
  { key: 'local', pt: 'Lisboa & Margem Sul', en: 'Lisbon & South Bank', accent: '--sec-local' },
  { key: 'portugal', pt: 'Portugal & Mundo', en: 'Portugal & World', accent: '--sec-portugal' },
  { key: 'economia', pt: 'Economia & Trabalho', en: 'Economy & Work', accent: '--sec-economia' },
  { key: 'tecnologia', pt: 'Tecnologia & Ciência', en: 'Tech & Science', accent: '--sec-tecnologia' },
  { key: 'desporto', pt: 'Desporto', en: 'Sport', accent: '--sec-desporto' },
];
const accentOf = k => `var(${(SECTIONS.find(x => x.key === k) || SECTIONS[0]).accent})`;
const NEWS_KEYS = ['local', 'portugal', 'economia', 'tecnologia', 'desporto'];

/* Transport operators: name, colour, official site (to confirm before travelling). */
const OPS = {
  metro:    { pt: 'Metro de Lisboa', en: 'Lisbon Metro', c: '#D5202E', t: '#fff', url: 'https://www.metrolisboa.pt' },
  mts:      { pt: 'Metro Sul do Tejo', en: 'Metro Sul do Tejo', c: '#4E9A3A', t: '#fff', url: 'https://www.mts.pt' },
  boat:     { pt: 'Barcos Transtejo/Soflusa', en: 'Transtejo/Soflusa ferries', c: '#0E6EB8', t: '#fff', url: 'https://ttsl.pt' },
  cp:       { pt: 'CP Comboios', en: 'CP trains', c: '#2F7D4F', t: '#fff', url: 'https://www.cp.pt' },
  fertagus: { pt: 'Fertagus', en: 'Fertagus', c: '#5A2D82', t: '#fff', url: 'https://www.fertagus.pt' },
  cm:       { pt: 'Carris Metropolitana', en: 'Carris Metropolitana', c: '#F2B705', t: '#14213D', url: 'https://www.carrismetropolitana.pt' },
  carris:   { pt: 'Carris', en: 'Carris', c: '#E58A00', t: '#14213D', url: 'https://www.carris.pt' },
  tcb:      { pt: 'TCB Barreiro', en: 'TCB Barreiro', c: '#1B75BB', t: '#fff', url: 'https://www.tcbarreiro.pt' },
};

const TEXT = {
  pt: {
    refresh: 'Atualizar', sourceCode: 'Código e contacto no GitHub', seeAll: 'Ver tudo', loading: 'A carregar…',
    transportKicker: 'Transportes de Lisboa',
    nowStrike: n => `Hoje há greve: ${n}.`, nowDisruption: n => `Perturbações agora: ${n}.`,
    allClear: 'Sem greves a decorrer.', next: (op, when) => `Próxima: ${op}, ${when}.`,
    nothingAhead: 'Nada anunciado para os próximos 7 dias.',
    sectionNow: 'Agora', today: 'Hoje', tomorrow: 'Amanhã', yesterday: 'Ontem', allDay: 'todo o dia',
    range: (a, b) => `de ${a} a ${b}`, until: x => `até ${x}`,
    strike: 'Greve', disruption: 'Perturbação', full: 'Sem serviço', partial: 'Serviço afetado',
    minimum: 'Serviços mínimos', readNews: 'Ver notícia', opSite: 'Site do operador',
    strikesChecked: x => `Greves verificadas ${x}.`,
    strikesStale: x => `A lista de greves não é atualizada desde ${x}. Pode faltar informação recente.`,
    strikesAbout: 'A lista de greves é atualizada todas as manhãs a partir das notícias. Confirma sempre no site do operador antes de saíres.',
    newsChecked: x => `Notícias atualizadas ${x}.`,
    newsStale: x => `As notícias não são atualizadas desde ${x}.`,
    newsAbout: 'Títulos e excertos dos feeds públicos de RTP, SIC Notícias, CNN Portugal, SAPO 24, Observador, ECO, O Jornal Económico, SAPO Tek, Pplware, Record, A Mensagem de Lisboa, Lisboa Para Pessoas, Almadense e O Setubalense, atualizados a cada hora. Tempo: IPMA. Só fontes que se leem sem pagar; artigos exclusivos para assinantes ficam de fora. Toca numa notícia para a ler no site do jornal.',
    offline: 'Sem ligação: a mostrar a última versão guardada.',
    loadError: 'Não foi possível carregar.', loadErrorSub: 'Verifica a ligação e toca em Atualizar.',
    emptySection: 'Sem notícias recentes nesta secção.',
    minAgo: m => m < 1 ? 'agora' : `há ${m} min`, hAgo: h => `há ${h} h`,
    at: 'às', and: ' e ',
    wxMax: 'Máx', wxMin: 'Mín', wxRain: 'Chuva', wxFeels: x => `Sensação ${x}°`, wxWind: x => `Vento ${x} km/h`,
    wxSource: 'Previsão IPMA', wxNone: 'Previsão do tempo indisponível de momento.',
    wxLevel: { yellow: 'Aviso amarelo', orange: 'Aviso laranja', red: 'Aviso vermelho' },
    wxArea: a => `distrito de ${a}`, wxFrom: x => `a partir de ${x}`,
    wxPlaces: 'Escolher local da previsão', wxOther: 'Outro local', wxClose: 'Fechar',
    wxSearch: 'Procurar localidade (ex.: Seixal, Porto…)', wxMyLoc: 'Usar a minha localização', wxNoMatch: 'Nenhuma localidade encontrada.',
    wxGeoWait: 'A obter a tua localização…', wxGeoNo: 'Não foi possível obter a localização. Procura pelo nome.',
    wxListErr: 'Não foi possível carregar a lista de localidades.', wxSaved: 'Os teus locais (até 5):', wxRemove: x => `Remover ${x}`,
  },
  en: {
    refresh: 'Refresh', sourceCode: 'Source code and contact on GitHub', seeAll: 'See all', loading: 'Loading…',
    transportKicker: 'Lisbon public transport',
    nowStrike: n => `On strike today: ${n}.`, nowDisruption: n => `Disruption now: ${n}.`,
    allClear: 'No strikes right now.', next: (op, when) => `Next: ${op}, ${when}.`,
    nothingAhead: 'Nothing announced for the next 7 days.',
    sectionNow: 'Now', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', allDay: 'all day',
    range: (a, b) => `${a} to ${b}`, until: x => `until ${x}`,
    strike: 'Strike', disruption: 'Disruption', full: 'No service', partial: 'Service affected',
    minimum: 'Minimum services', readNews: 'Read the news', opSite: 'Operator website',
    strikesChecked: x => `Strikes checked ${x}.`,
    strikesStale: x => `The strike list hasn’t been updated since ${x}. Recent news may be missing.`,
    strikesAbout: 'The strike list is updated every morning from the news. Always check the operator’s website before you leave.',
    newsChecked: x => `News updated ${x}.`,
    newsStale: x => `The news hasn’t been updated since ${x}.`,
    newsAbout: 'Headlines and excerpts from the public feeds of RTP, SIC Notícias, CNN Portugal, SAPO 24, Observador, ECO, O Jornal Económico, SAPO Tek, Pplware, Record, A Mensagem de Lisboa, Lisboa Para Pessoas, Almadense and O Setubalense, updated every hour. Weather: IPMA. Only outlets you can read without paying; subscriber-only articles are left out. Tap a story to read it on the outlet’s site. Stories are in Portuguese.',
    offline: 'Offline: showing the last saved version.',
    loadError: 'Couldn’t load.', loadErrorSub: 'Check your connection and tap Refresh.',
    emptySection: 'No recent news in this section.',
    minAgo: m => m < 1 ? 'now' : `${m} min ago`, hAgo: h => `${h} h ago`,
    at: 'at', and: ' and ',
    wxMax: 'High', wxMin: 'Low', wxRain: 'Rain', wxFeels: x => `Feels like ${x}°`, wxWind: x => `Wind ${x} km/h`,
    wxSource: 'IPMA forecast', wxNone: 'Weather forecast unavailable right now.',
    wxLevel: { yellow: 'Yellow warning', orange: 'Orange warning', red: 'Red warning' },
    wxArea: a => `${a} district`, wxFrom: x => `from ${x}`,
    wxPlaces: 'Choose forecast place', wxOther: 'Other place', wxClose: 'Close',
    wxSearch: 'Search a town (e.g. Seixal, Porto…)', wxMyLoc: 'Use my location', wxNoMatch: 'No place found.',
    wxGeoWait: 'Getting your location…', wxGeoNo: 'Couldn’t get your location. Search by name instead.',
    wxListErr: 'Couldn’t load the list of places.', wxSaved: 'Your places (up to 5):', wxRemove: x => `Remove ${x}`,
  },
};

/* ---------- Storage (safe) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
['px_trips', 'px_places', 'px_net', 'px_plan', 'px_map_open', 'px_journey', 'px_avoid'].forEach(store.del); // old travel data

const state = {
  lang: store.get('px_lang', (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'),
  strikes: { data: store.get('px_disruptions', null), offline: false, error: false },
  news: { data: store.get('px_news', null), offline: false, error: false },
  loading: false,
};
const t = (k, ...a) => { const v = TEXT[state.lang][k]; return typeof v === 'function' ? v(...a) : v; };
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nowS = () => Date.now() / 1000;
const opName = k => OPS[k] ? OPS[k][state.lang] : k;
const secName = k => { const s = SECTIONS.find(x => x.key === k); return s ? s[state.lang] : k; };
const current = () => { const h = location.hash.replace('#', ''); return SECTIONS.some(s => s.key === h) ? h : 'inicio'; };

/* ---------- Dates, always in Lisbon time ---------- */
const locale = () => state.lang === 'pt' ? 'pt-PT' : 'en-GB';
const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
const clock = ts => new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
function dayLabel(ts, long = false) {
  const k = dayKey(ts);
  if (k === dayKey(nowS())) return t('today');
  if (k === dayKey(nowS() + 86400)) return t('tomorrow');
  if (k === dayKey(nowS() - 86400)) return t('yesterday');
  return cap(new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short' }).format(new Date(ts * 1000)));
}
const stamp = ts => `${lc(dayLabel(ts))} ${t('at')} ${clock(ts)}`;
function ago(ts) {
  const m = Math.floor((nowS() - ts) / 60);
  if (m < 60) return t('minAgo', Math.max(0, m));
  if (m < 12 * 60) return t('hAgo', Math.floor(m / 60));
  return `${dayLabel(ts)} ${clock(ts)}`;
}
const isDayStart = ts => clock(ts) === '00:00';
const isDayEnd = ts => ['00:00', '23:59'].includes(clock(ts));
const lastDayTs = e => clock(e) === '00:00' ? e - 60 : e;
function windowText(x) {
  const s = x.s, e = x.e, e1 = lastDayTs(e), d = ts => lc(dayLabel(ts));
  const oneDay = dayKey(s) === dayKey(e1);
  let out;
  if (oneDay && isDayStart(s) && isDayEnd(e)) out = `${d(s)}, ${t('allDay')}`;
  else if (oneDay) out = `${d(s)}, ${clock(s)}–${clock(e)}`;
  else if (isDayStart(s) && isDayEnd(e)) out = t('range', d(s), d(e1));
  else out = t('range', `${d(s)} ${clock(s)}`, `${d(e1)} ${clock(e)}`);
  return cap(out);
}
function untilText(x) {
  const e1 = lastDayTs(x.e);
  if (dayKey(e1) === dayKey(nowS())) return isDayEnd(x.e) ? `${t('today')}, ${t('allDay')}` : cap(t('until', clock(x.e)));
  return cap(t('until', lc(dayLabel(e1)) + (isDayEnd(x.e) ? '' : ` ${clock(x.e)}`)));
}

/* ---------- Data ---------- */
async function fetchJson(url, slot, storeKey, valid) {
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!valid(j)) throw new Error('bad file');
    slot.data = j; slot.offline = false; slot.error = false;
    store.set(storeKey, j);
  } catch {
    if (slot.data) { slot.offline = true; slot.error = false; } else slot.error = true;
  }
}
async function load() {
  if (state.loading) return;
  state.loading = true; $('#refreshBtn').classList.add('spin');
  await Promise.all([
    fetchJson('disruptions.json', state.strikes, 'px_disruptions', j => Array.isArray(j.items)),
    fetchJson(NEWS_URL, state.news, 'px_news', j => j && typeof j.sections === 'object'),
  ]);
  state.loading = false; $('#refreshBtn').classList.remove('spin');
  if (current() === 'inicio') fetchPlace(wx.sel);
  render();
}

function strikeItems() {
  const now = nowS();
  return (state.strikes.data?.items || [])
    .filter(x => x && x.operator && x.start && x.end)
    .map(x => ({ ...x, s: Date.parse(x.start) / 1000, e: Date.parse(x.end) / 1000 }))
    .filter(x => x.s && x.e && x.e > now)
    .sort((a, b) => a.s - b.s || a.operator.localeCompare(b.operator));
}
function newsItems(key) {
  return (state.news.data?.sections?.[key]?.items || []).filter(x => x && x.title && x.link);
}

/* ---------- Render: shared pieces ---------- */
function applyStaticText() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); n.setAttribute('aria-label', n.title); });
  $('#langBtn').textContent = state.lang === 'pt' ? 'EN' : 'PT';
  renderTabs();
}
function renderTabs() {
  const cur = current();
  const nav = $('#tabs');
  nav.replaceChildren(...SECTIONS.map(s => {
    const a = el('a', 'tab', s[state.lang]); a.href = '#' + s.key;
    a.style.setProperty('--acc', accentOf(s.key));
    if (s.key === cur) a.setAttribute('aria-current', 'page');
    if (s.key === 'transportes' && strikeItems().some(x => x.s <= nowS())) a.append(el('span', 'tab-dot'));
    return a;
  }));
  nav.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
const joinNames = list => {
  const u = [...new Set(list)];
  return u.length <= 1 ? (u[0] || '') : `${u.slice(0, -1).join(', ')}${t('and')}${u.at(-1)}`;
};
// The transport status in one sentence, with a colour for urgency.
function strikeStatus() {
  const list = strikeItems(), now = nowS();
  const cur = list.filter(x => x.s <= now), up = list.filter(x => x.s > now);
  const strikes = cur.filter(x => x.kind !== 'disruption'), others = cur.filter(x => x.kind === 'disruption');
  let tone, title;
  if (strikes.length) { tone = 'alert'; title = t('nowStrike', joinNames(strikes.map(x => opName(x.operator)))); }
  else if (others.length) { tone = 'warn'; title = t('nowDisruption', joinNames(others.map(x => opName(x.operator)))); }
  else { tone = 'clear'; title = t('allClear'); }
  const sub = up[0] ? t('next', opName(up[0].operator), lc(windowText(up[0]))) : (cur.length ? '' : t('nothingAhead'));
  return { tone, title, sub, cur, up };
}
function note(text, cls = 'notice') { return el('p', cls, text); }
function foot(lines) {
  const f = el('footer', 'foot');
  lines.filter(Boolean).forEach(l => f.append(el('p', null, l)));
  const a = el('a', null, t('sourceCode')); a.href = 'https://github.com/sandro91145/proximo'; a.target = '_blank'; a.rel = 'noopener';
  f.append(a);
  return f;
}
function freshness(slot, staleH, checkedKey, staleKey) {
  const upd = slot.data?.updated ? Date.parse(slot.data.updated) / 1000 : null;
  let warn = '';
  if (slot.offline) warn = t('offline');
  else if (upd && nowS() - upd > staleH * 3600) warn = t(staleKey, stamp(upd));
  return { warn, checked: upd ? t(checkedKey, stamp(upd)) : '' };
}

/* ---------- Render: views ---------- */
function render() {
  if (document.activeElement?.id === 'wxSearch' && wx.picker) return;  // don't rebuild while typing a place name
  renderTabs();
  const key = current();
  const view = $('#view');
  view.style.setProperty('--acc', accentOf(key));
  if (key === 'inicio') view.replaceChildren(...homeView());
  else if (key === 'transportes') view.replaceChildren(...transportView());
  else view.replaceChildren(...newsView(key));
  document.title = key === 'inicio' ? 'Próximo' : `${secName(key)} · Próximo`;
}

function homeView() {
  const parts = [];
  parts.push(el('p', 'date-line', cap(new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))));

  // Transport status: the one urgent thing, if any.
  const st = strikeStatus();
  const tr = el('a', 'status ' + st.tone); tr.href = '#transportes';
  const ico = el('span', 'status-icon'); ico.innerHTML = TRANSPORT_ICON;
  const txt = el('span', 'status-text');
  txt.append(el('span', 'status-kicker', t('transportKicker')), el('span', 'status-title', state.strikes.error && !state.strikes.data ? t('loadError') : st.title));
  if (st.sub) txt.append(el('span', 'status-sub', st.sub));
  tr.append(ico, txt, el('span', 'status-go', '›'));
  const top = el('div', 'top-cards');
  top.append(tr);
  const wx = weatherCard();
  if (wx) top.append(wx);
  parts.push(top);

  const fr = freshness(state.news, NEWS_STALE_H, 'newsChecked', 'newsStale');
  if (fr.warn) parts.push(note(fr.warn));
  if (!state.news.data) {
    if (state.news.error) parts.push(note(`${t('loadError')} ${t('loadErrorSub')}`, 'muted-note'));
    else parts.push(skeleton(true), skeleton(), skeleton());
    parts.push(foot([t('newsAbout')]));
    return parts;
  }

  // Lead story: the newest story with a picture from Portugal & Mundo (or any section).
  const used = new Set();
  const lead = newsItems('portugal').find(i => i.image) || NEWS_KEYS.map(k => newsItems(k).find(i => i.image)).find(Boolean);
  if (lead) { used.add(lead.link); parts.push(storyCard(lead, 'lead', 'portugal')); }

  const grid = el('div', 'home-grid');
  NEWS_KEYS.forEach(k => {
    const items = newsItems(k).filter(i => !used.has(i.link));  // a story already shown higher up isn't repeated
    if (!items.length) return;
    const sec = el('section', 'home-sec');
    sec.style.setProperty('--acc', accentOf(k));
    const head = el('div', 'home-head');
    const h = el('h2', null, secName(k));
    const more = el('a', 'see-all', t('seeAll')); more.href = '#' + k;
    head.append(h, more);
    sec.append(head);
    const first = items.find(i => i.image) || items[0];
    sec.append(storyCard(first, 'feature', k));
    const ul = el('ul', 'rows');
    const rest = items.filter(i => i !== first).slice(0, HOME_PER_SECTION);
    rest.forEach(it => ul.append(storyRow(it)));
    [first, ...rest].forEach(i => used.add(i.link));
    sec.append(ul);
    grid.append(sec);
  });
  parts.push(grid);
  parts.push(foot([fr.checked, t('newsAbout')]));
  return parts;
}

function newsView(key) {
  const parts = [];
  const title = el('h1', 'sec-title', secName(key));
  parts.push(title);
  const fr = freshness(state.news, NEWS_STALE_H, 'newsChecked', 'newsStale');
  if (fr.warn) parts.push(note(fr.warn));
  const items = newsItems(key);
  if (!state.news.data) {
    if (state.news.error) parts.push(note(`${t('loadError')} ${t('loadErrorSub')}`, 'muted-note'));
    else parts.push(skeleton(true), skeleton(), skeleton(), skeleton());
  } else if (!items.length) parts.push(note(t('emptySection'), 'muted-note'));
  else {
    const first = items.find(i => i.image) || items[0];
    parts.push(storyCard(first, 'lead', key));
    const ul = el('ul', 'rows full');
    items.filter(i => i !== first).forEach(it => ul.append(storyRow(it, true)));
    parts.push(ul);
  }
  parts.push(foot([fr.checked, t('newsAbout')]));
  return parts;
}

/* A picture from the outlet's feed or article page; hidden again if it fails to load. */
function picture(src, cls) {
  const f = el('span', 'pic ' + cls);
  const img = document.createElement('img');
  img.src = src; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { f.closest('.has-pic')?.classList.replace('has-pic', 'no-pic'); f.remove(); });
  img.addEventListener('load', () => f.classList.add('loaded'));
  f.append(img);
  return f;
}
function meta(it) {
  const m = el('span', 'meta');
  m.append(el('span', 'source', it.source));
  if (it.time) m.append(el('span', 'time', ago(Date.parse(it.time) / 1000)));
  return m;
}
function link(it, cls) {
  const a = el('a', cls); a.href = it.link; a.target = '_blank'; a.rel = 'noopener';
  return a;
}
// Big story with picture: 'lead' (top of a page) or 'feature' (lead of a home section).
function storyCard(it, size, secKey) {
  const a = link(it, `story ${size} ${it.image ? 'has-pic' : 'no-pic'}`);
  a.style.setProperty('--acc', accentOf(secKey));
  if (it.image) a.append(picture(it.image, 'wide'));
  const body = el('span', 'story-body');
  body.append(meta(it), el('span', 'story-title', it.title));
  if (it.summary && size === 'lead') body.append(el('span', 'story-sum', it.summary));
  a.append(body);
  return a;
}
// Compact row: title on the left, small picture on the right when there is one.
function storyRow(it, withSummary = false) {
  const li = el('li');
  const a = link(it, `row ${it.image ? 'has-pic' : 'no-pic'}`);
  const body = el('span', 'row-body');
  body.append(meta(it), el('span', 'row-title', it.title));
  if (withSummary && it.summary) body.append(el('span', 'row-sum', it.summary));
  a.append(body);
  if (it.image) a.append(picture(it.image, 'thumb'));
  li.append(a);
  return li;
}
function skeleton(big = false) {
  const s = el('div', 'skel' + (big ? ' big' : ''));
  if (big) s.append(el('span', 'skel-pic'));
  s.append(el('span', 'skel-line short'), el('span', 'skel-line'), el('span', 'skel-line mid'));
  return s;
}
const TRANSPORT_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="3.5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 10.5h14M8 17.5 6.5 20.5M16 17.5l1.5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="14" r="1.2" fill="currentColor"/><circle cx="15" cy="14" r="1.2" fill="currentColor"/></svg>';

/* ---------- Weather (IPMA, via news.json) ---------- */
// IPMA weather type -> icon. 1 clear · 2,3,25 some cloud · 4,5,24,27 cloudy · rain · heavy rain · fog · snow · thunder.
const WX_KIND = { 1: 'clear', 2: 'partly', 3: 'partly', 25: 'partly', 4: 'cloud', 5: 'cloud', 24: 'cloud', 27: 'cloud',
  6: 'rain', 7: 'rain', 9: 'rain', 10: 'rain', 12: 'rain', 13: 'rain', 15: 'rain', 8: 'heavy', 11: 'heavy', 14: 'heavy', 21: 'heavy',
  16: 'fog', 17: 'fog', 26: 'fog', 18: 'snow', 28: 'snow', 29: 'snow', 30: 'snow', 19: 'storm', 20: 'storm', 23: 'storm', 22: 'clear' };
// Rough sunrise / sunset in Lisbon (UTC hours, mid-month) to show a moon at night.
const SUN_UTC = [[7.9, 17.6], [7.5, 18.2], [6.9, 18.7], [6.2, 19.2], [5.6, 19.7], [5.2, 20.1], [5.4, 20.1], [5.8, 19.6], [6.3, 18.8], [6.8, 18.0], [7.3, 17.4], [7.8, 17.3]];
function isNight(ts) {
  const d = new Date(ts * 1000), h = d.getUTCHours() + d.getUTCMinutes() / 60, [r, st] = SUN_UTC[d.getUTCMonth()];
  return h < r || h >= st;
}
const SUN_SVG = (cx, cy, r) => `<g class="i-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
  const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
  return `<line x1="${(cx + c * (r + 2.2)).toFixed(1)}" y1="${(cy + s * (r + 2.2)).toFixed(1)}" x2="${(cx + c * (r + 4.6)).toFixed(1)}" y2="${(cy + s * (r + 4.6)).toFixed(1)}"/>`;
}).join('')}</g>`;
const MOON_SVG = (x, y, k) => `<path class="i-moon" transform="translate(${x} ${y}) scale(${k})" d="M12.5 2.2A9.5 9.5 0 1 0 21.8 13.6 7.6 7.6 0 0 1 12.5 2.2z"/>`;
const CLOUD_SVG = (x, y, k, cls = 'i-cloud') => `<path class="${cls}" transform="translate(${x} ${y}) scale(${k})" d="M7.5 21h15.2a5.3 5.3 0 0 0 .7-10.55A7.4 7.4 0 0 0 9.3 11.6 4.75 4.75 0 0 0 7.5 21z"/>`;
const DROPS = n => `<g class="i-drop">${[[11, 25], [16, 26.5], [21, 25], [13.5, 29], [18.5, 30.5]].slice(0, n).map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 1.4}" y2="${y + 3}"/>`).join('')}</g>`;
function wxIcon(type, night = false, size = 32) {
  const k = WX_KIND[type] || 'cloud';
  let g;
  if (k === 'clear') g = night ? MOON_SVG(4, 4, 1.05) : SUN_SVG(16, 16, 6.5);
  else if (k === 'partly') g = (night ? MOON_SVG(2, 1, 0.75) : SUN_SVG(11.5, 11, 5)) + CLOUD_SVG(4, 5, 0.95);
  else if (k === 'cloud') g = CLOUD_SVG(2, 3, 1.05);
  else if (k === 'fog') g = CLOUD_SVG(3, -1, 0.95) + '<g class="i-fog"><line x1="6" y1="24" x2="26" y2="24"/><line x1="9" y1="28.5" x2="23" y2="28.5"/></g>';
  else if (k === 'snow') g = CLOUD_SVG(3, -3, 0.95) + '<g class="i-snow"><circle cx="11" cy="25.5" r="1.6"/><circle cx="16.5" cy="28.5" r="1.6"/><circle cx="21.5" cy="25.5" r="1.6"/></g>';
  else if (k === 'storm') g = CLOUD_SVG(3, -3, 0.95, 'i-cloud dark') + '<path class="i-bolt" d="M17.5 19.5 12.5 26.5h4l-1.8 5 6-7.5h-4l1.8-4.5z"/>';
  else g = CLOUD_SVG(3, -3, 0.95, k === 'heavy' ? 'i-cloud dark' : 'i-cloud') + DROPS(k === 'heavy' ? 5 : 3);
  return `<svg class="wx-ico" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${g}</svg>`;
}
const wxDesc = (w, type) => (w.types?.[String(type)] || [])[state.lang === 'pt' ? 0 : 1] || '';
const WARN_EN = { 'Precipitação': 'Rain', 'Vento': 'Wind', 'Agitação Marítima': 'Rough seas', 'Nevoeiro': 'Fog', 'Tempo Quente': 'Hot weather',
  'Tempo Frio': 'Cold weather', 'Trovoada': 'Thunderstorms', 'Neve': 'Snow' };
const warnType = x => state.lang === 'en' ? (WARN_EN[x] || x) : x;
const temp = v => v == null ? '–' : `${v}°`;
const lisbonDate = ts => dayKey(ts);

/* Places: any of IPMA's 423 forecast locations. Lisboa and Almada come with news.json;
 * the app reads the chosen place's forecast straight from IPMA (it allows browsers to). */
const IPMA = 'https://api.ipma.pt/public-data/forecast';
const WX_DEFAULT = [{ id: 1110600, name: 'Lisboa', area: 'LSB' }, { id: 1150300, name: 'Almada', area: 'STB' }];
const WX_MAX_PLACES = 5;
const AREA_NAMES = { AVR: 'Aveiro', BJA: 'Beja', BRG: 'Braga', BGC: 'Bragança', CBO: 'Castelo Branco', CBR: 'Coimbra', EVR: 'Évora',
  FAR: 'Faro', GDA: 'Guarda', LRA: 'Leiria', LSB: 'Lisboa', PTG: 'Portalegre', PTO: 'Porto', STM: 'Santarém', STB: 'Setúbal',
  VCT: 'Viana do Castelo', VRL: 'Vila Real', VIS: 'Viseu', MCN: 'Madeira', MCS: 'Madeira', MRM: 'Madeira', MPS: 'Porto Santo',
  AOR: 'Açores', ACE: 'Açores', AOC: 'Açores' };
const fold = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const wx = {
  places: (() => { const p = store.get('px_wx_places', null); return Array.isArray(p) && p.length ? p : WX_DEFAULT.slice(); })(),
  sel: (() => { const v = store.get('px_wx_place', 1110600); return v === 'almada' ? 1150300 : v === 'lisboa' ? 1110600 : v; })(),
  live: {},            // id -> { at, days, hours }
  busy: {}, failed: {},   // id -> time of the last failed fetch (wait 5 min before retrying)
  locs: store.get('px_wx_locs', null),   // IPMA location list, cached
  picker: false, q: '', geo: '',
};
WX_DEFAULT.concat(wx.places).forEach(p => { const c = store.get('px_wx_' + p.id, null); if (c) wx.live[p.id] = c; });
const saveWx = () => { store.set('px_wx_places', wx.places); store.set('px_wx_place', wx.sel); };

function parseAggregate(rows, now = nowS()) {
  const n = v => { const f = parseFloat(v); return Number.isFinite(f) && f > -99 ? Math.round(f) : null; };
  const days = [], hours = [];
  const iso = s => s && !/[zZ]|[+-]\d\d:\d\d$/.test(s) ? lisbonToUtc(s) : Date.parse(s) / 1000;
  rows.forEach(r => {
    if (r.idPeriodo === 24) days.push({ date: (r.dataPrev || '').slice(0, 10), min: n(r.tMin), max: n(r.tMax), type: n(r.idTipoTempo), rain: n(r.probabilidadePrecipita) });
    else if (r.idPeriodo === 1) {
      const ts = iso(r.dataPrev);
      if (ts && ts >= now - 3600) hours.push({ t: new Date(ts * 1000).toISOString(), temp: n(r.tMed), feels: n(r.utci), type: n(r.idTipoTempo), rain: n(r.probabilidadePrecipita), wind: n(r.ffVento) });
    }
  });
  days.sort((x, y) => x.date.localeCompare(y.date)); hours.sort((x, y) => x.t.localeCompare(y.t));
  return { days: days.slice(0, 7), hours: hours.slice(0, 36) };
}
// IPMA writes times in Lisbon local time without an offset.
function lisbonToUtc(s) {
  const guess = Date.parse(s + 'Z') / 1000;
  if (!guess) return null;
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(guess * 1000)).replace(', ', 'T');
  return guess - (Date.parse(local + ':00Z') / 1000 - guess);
}
async function fetchPlace(id, force = false) {
  const cur = wx.live[id];
  if (wx.busy[id] || (!force && cur && nowS() - cur.at < 30 * 60) || (!force && nowS() - (wx.failed[id] || 0) < 300)) return;
  wx.busy[id] = true;
  try {
    const r = await fetch(`${IPMA}/aggregate/${id}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const parsed = parseAggregate(await r.json());
    if (!parsed.days.length) throw new Error('empty');
    wx.live[id] = { at: nowS(), ...parsed };
    store.set('px_wx_' + id, wx.live[id]);
  } catch { wx.failed[id] = nowS(); /* keep what we have */ }
  wx.busy[id] = false;
  if (current() === 'inicio') render();
}
async function loadLocations() {
  if (wx.locs) return wx.locs;
  try {
    const r = await fetch(`${IPMA}/locations.json`);
    const j = await r.json();
    wx.locs = j.filter(x => x.globalIdLocal && x.local).map(x => ({ id: x.globalIdLocal, name: x.local, area: x.idAreaAviso, lat: +x.latitude, lon: +x.longitude }));
    store.set('px_wx_locs', wx.locs);
  } catch { wx.locs = null; }
  return wx.locs;
}
// The forecast to show for a place: fetched live, else the copy in news.json.
function placeForecast(p) {
  const live = wx.live[p.id];
  const fromNews = Object.values(state.news.data?.weather?.places || {}).find(x => x.id === p.id || (!x.id && x.name === p.name));
  if (live && (!fromNews || live.at >= Date.parse(state.news.data?.weather?.updated || 0) / 1000)) return live;
  return fromNews || live || null;
}
function addPlace(loc) {
  if (!wx.places.some(p => p.id === loc.id)) {
    wx.places.push({ id: loc.id, name: loc.name, area: loc.area });
    if (wx.places.length > WX_MAX_PLACES) wx.places.splice(0, wx.places.length - WX_MAX_PLACES);
  }
  wx.sel = loc.id; wx.picker = false; wx.q = ''; wx.geo = '';
  saveWx(); fetchPlace(loc.id); render();
}
function removePlace(id) {
  wx.places = wx.places.filter(p => p.id !== id);
  if (!wx.places.length) wx.places = WX_DEFAULT.slice();
  if (!wx.places.some(p => p.id === wx.sel)) wx.sel = wx.places[0].id;
  saveWx(); render();
}
function useMyLocation() {
  if (!navigator.geolocation) { wx.geo = t('wxGeoNo'); render(); return; }
  wx.geo = t('wxGeoWait'); render();
  navigator.geolocation.getCurrentPosition(async pos => {
    const locs = await loadLocations();
    if (!locs) { wx.geo = t('wxListErr'); render(); return; }
    const { latitude: la, longitude: lo } = pos.coords, k = Math.cos(la * Math.PI / 180);
    const best = locs.reduce((b, x) => { const d = (x.lat - la) ** 2 + ((x.lon - lo) * k) ** 2; return !b || d < b.d ? { x, d } : b; }, null);
    if (best) addPlace(best.x);
  }, () => { wx.geo = t('wxGeoNo'); render(); }, { timeout: 15000, maximumAge: 30 * 60 * 1000 });
}

// Short facts separated by dots (the separator is drawn by CSS so the spacing is even).
function dots(cls, list) {
  const s = el('span', cls + ' dots');
  list.filter(Boolean).forEach(x => s.append(el('span', null, x)));
  return s;
}
function weatherPicker() {
  const box = el('div', 'wx-picker');
  const input = el('input', 'wx-search'); input.id = 'wxSearch'; input.type = 'search'; input.value = wx.q;
  input.placeholder = t('wxSearch'); input.setAttribute('aria-label', t('wxSearch')); input.autocomplete = 'off';
  const list = el('ul', 'wx-results');
  const fill = () => {
    const q = fold(wx.q.trim());
    list.replaceChildren();
    if (!wx.locs) { list.append(el('li', 'wx-hint', t('loading'))); return; }
    if (!q) return;
    const hits = wx.locs.filter(x => fold(x.name).includes(q))
      .sort((a, b) => (fold(b.name).startsWith(q) - fold(a.name).startsWith(q)) || a.name.localeCompare(b.name, 'pt')).slice(0, 8);
    if (!hits.length) list.append(el('li', 'wx-hint', t('wxNoMatch')));
    hits.forEach(x => {
      const li = el('li'); const b = el('button', 'wx-hit'); b.type = 'button';
      b.append(el('span', null, x.name), el('span', 'wx-hit-area', AREA_NAMES[x.area] || ''));
      b.addEventListener('click', () => addPlace(x));
      li.append(b); list.append(li);
    });
  };
  input.addEventListener('input', () => { wx.q = input.value; fill(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') list.querySelector('button')?.click(); if (e.key === 'Escape') { wx.picker = false; render(); } });
  const geo = el('button', 'wx-geo', t('wxMyLoc')); geo.type = 'button'; geo.addEventListener('click', useMyLocation);
  box.append(input, geo);
  if (wx.geo) box.append(el('p', 'wx-hint', wx.geo));
  box.append(list);
  // Saved places, with a remove button each
  const saved = el('ul', 'wx-saved');
  wx.places.forEach(p => {
    const li = el('li'); li.append(el('span', null, p.name));
    const x = el('button', 'wx-del', '×'); x.type = 'button'; x.title = t('wxRemove', p.name); x.setAttribute('aria-label', x.title);
    x.addEventListener('click', () => removePlace(p.id));
    li.append(x); saved.append(li);
  });
  box.append(el('p', 'wx-hint', t('wxSaved')), saved);
  if (!wx.locs) loadLocations().then(fill); else fill();
  setTimeout(() => { if (wx.picker && document.activeElement !== input && !wx.geo) input.focus({ preventScroll: true }); }, 0);
  return box;
}

function weatherCard() {
  if (!state.news.data && !Object.keys(wx.live).length) return null;
  const w = state.news.data?.weather || {};
  const card = el('section', 'wx' + (wx.picker ? ' picking' : ''));
  const place = wx.places.find(p => p.id === wx.sel) || wx.places[0];
  const p = placeForecast(place);
  if (!wx.live[place.id] || nowS() - wx.live[place.id].at > 30 * 60) fetchPlace(place.id);
  const now = nowS();

  // Place switch, + to choose another place, source
  const head = el('div', 'wx-head');
  const sw = el('div', 'wx-switch'); sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', t('wxPlaces'));
  wx.places.forEach(pl => {
    const b = el('button', 'wx-place', pl.name); b.type = 'button';
    b.setAttribute('aria-pressed', String(pl.id === place.id && !wx.picker));
    b.addEventListener('click', () => { wx.sel = pl.id; wx.picker = false; saveWx(); render(); });
    sw.append(b);
  });
  const add = el('button', 'wx-place wx-add', wx.picker ? '×' : '+'); add.type = 'button';
  add.title = wx.picker ? t('wxClose') : t('wxOther'); add.setAttribute('aria-label', add.title);
  add.setAttribute('aria-expanded', String(wx.picker));
  add.addEventListener('click', () => { wx.picker = !wx.picker; wx.q = ''; wx.geo = ''; render(); });
  sw.append(add);
  const src = el('a', 'wx-src', t('wxSource'));
  src.href = 'https://www.ipma.pt/pt/otempo/prev.localidade.hora/'; src.target = '_blank'; src.rel = 'noopener';
  head.append(sw);
  const main = el('div', 'wx-main'), fore = el('div', 'wx-fore');
  main.append(head);
  if (wx.picker) { main.append(weatherPicker(), src); card.append(main); return card; }
  if (!p) {
    main.append(el('p', 'wx-none', wx.busy[place.id] ? t('loading') : t('wxNone')), src);
    card.append(main); return card;
  }

  // Now: the hourly forecast for the current hour; today's high / low / rain.
  const hours = (p.hours || []).map(h => ({ ...h, ts: Date.parse(h.t) / 1000 })).filter(h => h.ts);
  const cur = hours.filter(h => h.ts <= now).at(-1) || hours[0];
  const today = (p.days || []).find(d => d.date === lisbonDate(now)) || (p.days || [])[0];
  const nowRow = el('div', 'wx-now');
  const type = cur?.type ?? today?.type;
  const ico = el('span', 'wx-now-ico'); ico.innerHTML = wxIcon(type, cur ? isNight(cur.ts) : false, 56);
  const big = el('span', 'wx-temp', cur ? temp(cur.temp) : `${temp(today?.max)}`);
  const info = el('div', 'wx-info');
  info.append(el('span', 'wx-desc', wxDesc(w, type) || ''));
  const bits = [];
  if (today) bits.push(`${t('wxMax')} ${temp(today.max)}`, `${t('wxMin')} ${temp(today.min)}`);
  if (today?.rain != null) bits.push(`${t('wxRain')} ${today.rain}%`);
  info.append(dots('wx-sub', bits));
  const extra = [];
  if (cur?.feels != null && cur.temp != null && Math.abs(cur.feels - cur.temp) >= 2) extra.push(t('wxFeels', cur.feels));
  if (cur?.wind != null && cur.wind >= 20) extra.push(t('wxWind', cur.wind));
  if (extra.length) info.append(dots('wx-sub', extra));
  nowRow.append(ico, big, info);
  main.append(nowRow);

  // IPMA warnings for this place's warning area (e.g. Almada is in the Setúbal district).
  (w.warnings || [])
    .filter(x => (x.code ? x.code === place.area : x.area === AREA_NAMES[place.area]) && Date.parse(x.end) / 1000 > now)
    .forEach(x => {
      const s = Date.parse(x.start) / 1000, e = Date.parse(x.end) / 1000;
      const when = s > now ? t('wxFrom', `${lc(dayLabel(s))} ${clock(s)}`) : t('until', (dayKey(e) === dayKey(now) ? '' : lc(dayLabel(e)) + ' ') + clock(e));
      const box = el('p', 'wx-warn ' + x.level);
      const areaTxt = /^[A-Z]{3}$/.test(place.area) && !['MCN', 'MCS', 'MRM', 'MPS', 'AOR', 'ACE', 'AOC'].includes(place.area) ? t('wxArea', x.area) : x.area;
      box.append(el('strong', null, `${t('wxLevel')[x.level] || ''}: ${warnType(x.type)}`), dots('wx-warn-when', [areaTxt, when]));
      if (x.text) box.append(el('span', 'wx-warn-text', x.text));
      main.append(box);
    });

  // Next 12 hours
  const next = hours.filter(h => h.ts > now - 1800).slice(cur && cur.ts <= now ? 1 : 0, 13);
  if (next.length) {
    const strip = el('ol', 'wx-hours');
    next.forEach(h => {
      const li = el('li');
      li.append(el('span', 'wx-h', clock(h.ts).slice(0, 2) + 'h'));
      const i = el('span'); i.innerHTML = wxIcon(h.type, isNight(h.ts), 28); li.append(i);
      li.append(el('span', 'wx-t', temp(h.temp)));
      li.append(el('span', 'wx-r' + (h.rain >= 50 ? ' hi' : ''), h.rain != null && h.rain >= 10 ? `${h.rain}%` : ''));
      li.title = wxDesc(w, h.type);
      strip.append(li);
    });
    if (!next.some(h => h.rain != null && h.rain >= 10)) strip.classList.add('no-rain');
    fore.append(strip);
  }

  // Next days
  const days = (p.days || []).filter(d => d.date >= lisbonDate(now)).slice(0, 5);
  if (days.length > 1) {
    const ul = el('ol', 'wx-days');
    days.forEach(d => {
      const ts = Date.parse(d.date + 'T12:00:00Z') / 1000;
      const li = el('li');
      const name = d.date === lisbonDate(now) ? t('today') : cap(new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: 'short' }).format(new Date(ts * 1000)).replace('.', ''));
      li.append(el('span', 'wx-d', name));
      const i = el('span'); i.innerHTML = wxIcon(d.type, false, 28); li.append(i);
      const tt = el('span', 'wx-mm'); tt.append(el('b', null, temp(d.max)), ' ', el('span', null, temp(d.min)));
      li.append(tt);
      li.append(el('span', 'wx-r' + (d.rain >= 50 ? ' hi' : ''), d.rain != null && d.rain >= 10 ? `${d.rain}%` : ''));
      li.title = wxDesc(w, d.type);
      ul.append(li);
    });
    fore.append(ul);
  }
  (fore.childNodes.length ? fore : main).append(src);
  card.append(main);
  if (fore.childNodes.length) card.append(fore);
  return card;
}

function transportView() {
  const parts = [];
  const st = strikeStatus();
  const hero = el('section', 'hero ' + (state.strikes.error && !state.strikes.data ? 'warn' : st.tone));
  hero.append(el('p', 'hero-kicker', t('transportKicker')));
  if (state.strikes.error && !state.strikes.data) {
    hero.append(el('h1', 'hero-title', t('loadError')), el('p', 'hero-sub', t('loadErrorSub')));
  } else {
    hero.append(el('h1', 'hero-title', st.title));
    if (st.sub) hero.append(el('p', 'hero-sub', st.sub));
  }
  parts.push(hero);
  const fr = freshness(state.strikes, STRIKES_STALE_H, 'strikesChecked', 'strikesStale');
  if (fr.warn) parts.push(note(fr.warn));

  const list = el('div', 'list');
  if (st.cur.length) {
    list.append(el('h2', 'day now', t('sectionNow')));
    st.cur.forEach(x => list.append(card(x, true)));
  }
  let lastDay = null;
  st.up.forEach(x => {
    const k = dayKey(x.s);
    if (k !== lastDay) { list.append(el('h2', 'day', dayLabel(x.s, true))); lastDay = k; }
    list.append(card(x, false));
  });
  parts.push(list);
  parts.push(foot([fr.checked, t('strikesAbout')]));
  return parts;
}

function card(x, isNow) {
  const op = OPS[x.operator] || { c: '#1F3A8A', t: '#fff', url: '' };
  const a = el('article', 'card' + (isNow ? ' is-now' : ''));
  a.style.setProperty('--op', op.c);
  const head = el('div', 'card-head');
  const badge = el('span', 'op', opName(x.operator)); badge.style.background = op.c; badge.style.color = op.t;
  const full = (x.scope || 'full') === 'full';
  head.append(badge, el('span', 'pill ' + (full ? 'full' : 'partial'), full ? t('full') : t('partial')));
  a.append(head, el('h3', 'card-title', x.title || (x.kind === 'disruption' ? t('disruption') : t('strike'))),
    el('p', 'card-when', isNow ? untilText(x) : windowText(x)));
  if (x.minimum) { const m = el('p', 'card-min'); m.append(el('strong', null, t('minimum') + ': '), x.minimum); a.append(m); }
  const links = el('p', 'card-links');
  if (x.source) {
    const l = el('a', null, t('readNews')); l.href = x.source; l.target = '_blank'; l.rel = 'noopener';
    try { l.append(el('span', 'host', ` (${new URL(x.source).hostname.replace(/^www\./, '')})`)); } catch {}
    links.append(l);
  }
  if (op.url) { const l = el('a', null, t('opSite')); l.href = op.url; l.target = '_blank'; l.rel = 'noopener'; links.append(l); }
  if (links.childNodes.length) a.append(links);
  return a;
}

/* ---------- Wire up ---------- */
window.addEventListener('hashchange', () => { wx.picker = false; document.activeElement?.blur(); render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); });
$('#refreshBtn').addEventListener('click', load);
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'pt' ? 'en' : 'pt';
  store.set('px_lang', state.lang);
  document.activeElement?.blur();
  applyStaticText(); render();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 60 * 1000); // times and "now" move on

applyStaticText();
render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
