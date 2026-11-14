/* Próximo — strikes and disruptions on Lisbon public transport.
 * Reads disruptions.json (updated every morning from the news by a GitHub Action)
 * and shows what's happening now and in the coming days. Plain JS, no build step.
 */
'use strict';

const TZ = 'Europe/Lisbon';
const STALE_AFTER_H = 36;          // warn when the list hasn't been checked for this long
const REFRESH_MS = 15 * 60 * 1000;  // look for an updated list every 15 minutes while open

/* Operators: name, colour, official site (to confirm before travelling). */
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
    kicker: 'Transportes de Lisboa', refresh: 'Atualizar', sourceCode: 'Código e contacto no GitHub',
    about: 'A lista é atualizada todas as manhãs a partir das notícias. Confirma sempre no site do operador antes de saíres.',
    loading: 'A carregar…',
    nowStrike: n => `Hoje há greve: ${n}.`,
    nowDisruption: n => `Perturbações agora: ${n}.`,
    allClear: 'Sem greves a decorrer.',
    next: (op, when) => `Próxima: ${op}, ${when}.`,
    nothingAhead: 'Nada anunciado para os próximos 7 dias.',
    sectionNow: 'Agora', today: 'Hoje', tomorrow: 'Amanhã', allDay: 'todo o dia',
    range: (a, b) => `de ${a} a ${b}`, until: x => `até ${x}`,
    strike: 'Greve', disruption: 'Perturbação',
    full: 'Sem serviço', partial: 'Serviço afetado',
    minimum: 'Serviços mínimos',
    readNews: 'Ver notícia', opSite: 'Site do operador',
    checked: x => `Notícias verificadas ${x}.`,
    stale: x => `Esta lista não é atualizada desde ${x}. Pode faltar informação recente.`,
    offline: 'Sem ligação: a mostrar a última lista guardada.',
    loadError: 'Não foi possível carregar a lista.',
    loadErrorSub: 'Verifica a ligação e toca em Atualizar.',
    at: 'às', and: ' e ',
  },
  en: {
    kicker: 'Lisbon public transport', refresh: 'Refresh', sourceCode: 'Source code and contact on GitHub',
    about: 'The list is updated every morning from the news. Always check the operator’s website before you leave.',
    loading: 'Loading…',
    nowStrike: n => `On strike today: ${n}.`,
    nowDisruption: n => `Disruption now: ${n}.`,
    allClear: 'No strikes right now.',
    next: (op, when) => `Next: ${op}, ${when}.`,
    nothingAhead: 'Nothing announced for the next 7 days.',
    sectionNow: 'Now', today: 'Today', tomorrow: 'Tomorrow', allDay: 'all day',
    range: (a, b) => `${a} to ${b}`, until: x => `until ${x}`,
    strike: 'Strike', disruption: 'Disruption',
    full: 'No service', partial: 'Service affected',
    minimum: 'Minimum services',
    readNews: 'Read the news', opSite: 'Operator website',
    checked: x => `News checked ${x}.`,
    stale: x => `This list hasn’t been updated since ${x}. Recent news may be missing.`,
    offline: 'Offline: showing the last saved list.',
    loadError: 'Couldn’t load the list.',
    loadErrorSub: 'Check your connection and tap Refresh.',
    at: 'at', and: ' and ',
  },
};

/* ---------- Storage (safe) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
// Data from the old travel version is no longer used.
['px_trips', 'px_places', 'px_net', 'px_plan', 'px_map_open', 'px_journey', 'px_avoid'].forEach(store.del);

const state = {
  lang: store.get('px_lang', (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'),
  data: null, offline: false, error: false, loading: true,
};
const t = (k, ...a) => { const v = TEXT[state.lang][k]; return typeof v === 'function' ? v(...a) : v; };
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nowS = () => Date.now() / 1000;
const opName = k => OPS[k] ? OPS[k][state.lang] : k;

/* ---------- Dates, always in Lisbon time ---------- */
const locale = () => state.lang === 'pt' ? 'pt-PT' : 'en-GB';
const dayKey = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
const clock = ts => new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));
function dayLabel(ts, long = false) {
  const k = dayKey(ts);
  if (k === dayKey(nowS())) return t('today');
  if (k === dayKey(nowS() + 86400)) return t('tomorrow');
  const s = new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short' }).format(new Date(ts * 1000));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
// 00:00 starts and 00:00 / 23:59 ends count as whole days.
const isDayStart = ts => clock(ts) === '00:00';
const isDayEnd = ts => ['00:00', '23:59'].includes(clock(ts));
const lastDayTs = e => clock(e) === '00:00' ? e - 60 : e;

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Built in lower case, then capitalised: callers lower-case it again when it sits mid-sentence.
function windowText(x) {
  const s = x.s, e = x.e, e1 = lastDayTs(e);
  const d = ts => lc(dayLabel(ts));
  const oneDay = dayKey(s) === dayKey(e1);
  let out;
  if (oneDay && isDayStart(s) && isDayEnd(e)) out = `${d(s)}, ${t('allDay')}`;
  else if (oneDay) out = `${d(s)}, ${clock(s)}–${clock(e)}`;
  else if (isDayStart(s) && isDayEnd(e)) out = t('range', d(s), d(e1));
  else out = t('range', `${d(s)} ${clock(s)}`, `${d(e1)} ${clock(e)}`);
  return cap(out);
}
// For something already happening: when it ends.
function untilText(x) {
  const e1 = lastDayTs(x.e);
  if (dayKey(e1) === dayKey(nowS())) return isDayEnd(x.e) ? `${t('today')}, ${t('allDay')}` : cap(t('until', clock(x.e)));
  return cap(t('until', lc(dayLabel(e1)) + (isDayEnd(x.e) ? '' : ` ${clock(x.e)}`)));
}

/* ---------- Data ---------- */
async function load() {
  state.loading = true; $('#refreshBtn').classList.add('spin');
  try {
    const r = await fetch('disruptions.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.items)) throw new Error('bad file');
    state.data = j; state.offline = false; state.error = false;
    store.set('px_disruptions', j);
  } catch {
    const saved = store.get('px_disruptions', null);
    if (saved) { state.data = saved; state.offline = true; state.error = false; } else state.error = true;
  }
  state.loading = false; $('#refreshBtn').classList.remove('spin');
  render();
}

function items() {
  const now = nowS();
  return (state.data?.items || [])
    .filter(x => x && x.operator && x.start && x.end)
    .map(x => ({ ...x, s: Date.parse(x.start) / 1000, e: Date.parse(x.end) / 1000 }))
    .filter(x => x.s && x.e && x.e > now)
    .sort((a, b) => a.s - b.s || a.operator.localeCompare(b.operator));
}

/* ---------- Render ---------- */
function applyStaticText() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); n.setAttribute('aria-label', n.title); });
  $('#langBtn').textContent = state.lang === 'pt' ? 'EN' : 'PT';
}

const joinNames = list => {
  const u = [...new Set(list)];
  return u.length <= 1 ? (u[0] || '') : `${u.slice(0, -1).join(', ')}${t('and')}${u.at(-1)}`;
};

function render() {
  const now = nowS();
  const list = items();
  const current = list.filter(x => x.s <= now);
  const upcoming = list.filter(x => x.s > now);

  // Hero: the one thing to know right now.
  const hero = $('.hero'), title = $('#heroTitle'), sub = $('#heroSub');
  hero.classList.remove('alert', 'clear', 'warn');
  if (!state.data && state.loading) { title.textContent = t('loading'); sub.textContent = ''; }
  else if (state.error) { hero.classList.add('warn'); title.textContent = t('loadError'); sub.textContent = t('loadErrorSub'); }
  else {
    const strikes = current.filter(x => x.kind !== 'disruption');
    const others = current.filter(x => x.kind === 'disruption');
    if (strikes.length) {
      hero.classList.add('alert');
      title.textContent = t('nowStrike', joinNames(strikes.map(x => opName(x.operator))));
    } else if (others.length) {
      hero.classList.add('warn');
      title.textContent = t('nowDisruption', joinNames(others.map(x => opName(x.operator))));
    } else {
      hero.classList.add('clear');
      title.textContent = t('allClear');
    }
    const nxt = upcoming[0];
    sub.textContent = nxt ? t('next', opName(nxt.operator), lc(windowText(nxt))) : (current.length ? '' : t('nothingAhead'));
  }

  // Notices: offline, or a list that hasn't been refreshed for a while.
  const notice = $('#notice');
  const upd = state.data?.updated ? Date.parse(state.data.updated) / 1000 : null;
  let msg = '';
  if (state.offline) msg = t('offline');
  else if (upd && now - upd > STALE_AFTER_H * 3600) msg = t('stale', `${lc(dayLabel(upd))} ${t('at')} ${clock(upd)}`);
  notice.hidden = !msg; notice.textContent = msg;
  $('#checked').textContent = upd ? t('checked', `${lc(dayLabel(upd))} ${t('at')} ${clock(upd)}`) : '';

  // List: what's happening now, then one group per day.
  const parts = [];
  if (current.length) {
    parts.push(el('h2', 'day now', t('sectionNow')));
    current.forEach(x => parts.push(card(x, true)));
  }
  let lastDay = null;
  upcoming.forEach(x => {
    const k = dayKey(x.s);
    if (k !== lastDay) { parts.push(el('h2', 'day', dayLabel(x.s, true))); lastDay = k; }
    parts.push(card(x, false));
  });
  $('#list').replaceChildren(...parts);
}

function card(x, isNow) {
  const op = OPS[x.operator] || { c: '#1F3A8A', t: '#fff', url: '' };
  const a = el('article', 'card' + (isNow ? ' is-now' : ''));
  a.style.setProperty('--op', op.c);

  const head = el('div', 'card-head');
  const badge = el('span', 'op', opName(x.operator));
  badge.style.background = op.c; badge.style.color = op.t;
  const full = (x.scope || 'full') === 'full';
  head.append(badge, el('span', 'pill ' + (full ? 'full' : 'partial'), full ? t('full') : t('partial')));

  const title = el('h3', 'card-title', x.title || (x.kind === 'disruption' ? t('disruption') : t('strike')));
  const when = el('p', 'card-when', isNow ? untilText(x) : windowText(x));
  a.append(head, title, when);

  if (x.minimum) {
    const m = el('p', 'card-min');
    m.append(el('strong', null, t('minimum') + ': '), x.minimum);
    a.append(m);
  }

  const links = el('p', 'card-links');
  if (x.source) {
    const l = el('a', null, t('readNews'));
    l.href = x.source; l.target = '_blank'; l.rel = 'noopener';
    try { l.append(el('span', 'host', ` (${new URL(x.source).hostname.replace(/^www\./, '')})`)); } catch {}
    links.append(l);
  }
  if (op.url) {
    const l = el('a', null, t('opSite')); l.href = op.url; l.target = '_blank'; l.rel = 'noopener';
    links.append(l);
  }
  if (links.childNodes.length) a.append(links);
  return a;
}

/* ---------- Wire up ---------- */
$('#refreshBtn').addEventListener('click', load);
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'pt' ? 'en' : 'pt';
  store.set('px_lang', state.lang);
  applyStaticText(); render();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 60 * 1000); // "now" moves on

const cached = store.get('px_disruptions', null);
if (cached) state.data = cached; // show the last list straight away, then refresh
applyStaticText();
render();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
