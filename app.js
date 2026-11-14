/* Próximo — news from reliable Portuguese outlets, plus strikes on Lisbon public transport.
 * news.json: headlines collected every hour from the outlets' public feeds (news-data branch).
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

const SECTIONS = [
  { key: 'inicio', pt: 'Início', en: 'Home' },
  { key: 'transportes', pt: 'Transportes', en: 'Transport' },
  { key: 'portugal', pt: 'Portugal & Mundo', en: 'Portugal & World' },
  { key: 'economia', pt: 'Economia & Trabalho', en: 'Economy & Work' },
  { key: 'tecnologia', pt: 'Tecnologia & Ciência', en: 'Tech & Science' },
  { key: 'desporto', pt: 'Desporto', en: 'Sport' },
];
const NEWS_KEYS = ['portugal', 'economia', 'tecnologia', 'desporto'];

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
    newsAbout: 'Títulos e excertos dos feeds públicos de RTP, Observador, ECO, O Jornal Económico, Pplware e Record, atualizados a cada hora. Só fontes que se leem sem pagar; artigos exclusivos para assinantes ficam de fora. Toca numa notícia para a ler no site do jornal.',
    offline: 'Sem ligação: a mostrar a última versão guardada.',
    loadError: 'Não foi possível carregar.', loadErrorSub: 'Verifica a ligação e toca em Atualizar.',
    emptySection: 'Sem notícias recentes nesta secção.',
    minAgo: m => m < 1 ? 'agora' : `há ${m} min`, hAgo: h => `há ${h} h`,
    at: 'às', and: ' e ',
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
    newsAbout: 'Headlines and excerpts from the public feeds of RTP, Observador, ECO, O Jornal Económico, Pplware and Record, updated every hour. Only outlets you can read without paying; subscriber-only articles are left out. Tap a story to read it on the outlet’s site. Stories are in Portuguese.',
    offline: 'Offline: showing the last saved version.',
    loadError: 'Couldn’t load.', loadErrorSub: 'Check your connection and tap Refresh.',
    emptySection: 'No recent news in this section.',
    minAgo: m => m < 1 ? 'now' : `${m} min ago`, hAgo: h => `${h} h ago`,
    at: 'at', and: ' and ',
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
  renderTabs();
  const key = current();
  const view = $('#view');
  if (key === 'inicio') view.replaceChildren(...homeView());
  else if (key === 'transportes') view.replaceChildren(...transportView());
  else view.replaceChildren(...newsView(key));
  document.title = key === 'inicio' ? 'Próximo' : `${secName(key)} · Próximo`;
}

function homeView() {
  const parts = [];
  // Transport status: the one urgent thing, if any.
  const st = strikeStatus();
  const tr = el('a', 'status ' + st.tone); tr.href = '#transportes';
  tr.append(el('span', 'status-kicker', t('transportKicker')), el('span', 'status-title', state.strikes.error && !state.strikes.data ? t('loadError') : st.title));
  if (st.sub) tr.append(el('span', 'status-sub', st.sub));
  parts.push(el('p', 'date-line', cap(new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))));
  parts.push(tr);

  const fr = freshness(state.news, NEWS_STALE_H, 'newsChecked', 'newsStale');
  if (fr.warn) parts.push(note(fr.warn));
  if (!state.news.data) parts.push(note(state.news.error ? `${t('loadError')} ${t('loadErrorSub')}` : t('loading'), 'muted-note'));

  NEWS_KEYS.forEach(k => {
    const items = newsItems(k);
    if (!items.length) return;
    const sec = el('section', 'home-sec');
    const head = el('div', 'home-head');
    const h = el('h2', null, secName(k));
    const more = el('a', 'see-all', t('seeAll')); more.href = '#' + k;
    head.append(h, more);
    const ul = el('ul', 'headlines');
    items.slice(0, HOME_PER_SECTION).forEach((it, i) => ul.append(headline(it, i === 0)));
    sec.append(head, ul);
    parts.push(sec);
  });
  parts.push(foot([fr.checked, t('newsAbout')]));
  return parts;
}

function newsView(key) {
  const parts = [el('h1', 'sec-title', secName(key))];
  const fr = freshness(state.news, NEWS_STALE_H, 'newsChecked', 'newsStale');
  if (fr.warn) parts.push(note(fr.warn));
  const items = newsItems(key);
  if (!state.news.data) parts.push(note(state.news.error ? `${t('loadError')} ${t('loadErrorSub')}` : t('loading'), 'muted-note'));
  else if (!items.length) parts.push(note(t('emptySection'), 'muted-note'));
  else {
    const ul = el('ul', 'headlines full');
    items.forEach(it => ul.append(headline(it, false, true)));
    parts.push(ul);
  }
  parts.push(foot([fr.checked, t('newsAbout')]));
  return parts;
}

function headline(it, lead, withSummary = false) {
  const li = el('li', 'hl' + (lead ? ' lead' : ''));
  const a = el('a'); a.href = it.link; a.target = '_blank'; a.rel = 'noopener';
  const meta = el('span', 'hl-meta');
  meta.append(el('span', 'hl-source', it.source));
  if (it.time) meta.append(el('span', 'hl-time', ago(Date.parse(it.time) / 1000)));
  a.append(meta, el('span', 'hl-title', it.title));
  if ((withSummary || lead) && it.summary) a.append(el('span', 'hl-sum', it.summary));
  li.append(a);
  return li;
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
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); });
$('#refreshBtn').addEventListener('click', load);
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'pt' ? 'en' : 'pt';
  store.set('px_lang', state.lang);
  applyStaticText(); render();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 60 * 1000); // times and "now" move on

applyStaticText();
render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
