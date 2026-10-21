/* Próximo — live departures for your Carris Metropolitana stops.
 * Plain JS, no build step. Works as an installable PWA on phone and PC.
 */
'use strict';

const CONFIG = {
  // Official Carris Metropolitana API (open data, no key needed).
  API: 'https://api.carrismetropolitana.pt/v2',
  // Optional fallback if the browser blocks direct calls (CORS).
  // Set to your Supabase Edge Function URL, e.g.
  // 'https://YOUR-PROJECT.supabase.co/functions/v1/cm-proxy'
  PROXY: '',
  REFRESH_MS: 30_000,          // fetch new arrivals every 30 s
  STOPS_MAX_AGE_MS: 86_400_000, // refresh the stop list once a day
  DEPS_SHOWN: 4,
  STALE_AFTER_S: 120,           // warn if data is older than this
  // Street search (OpenStreetMap Nominatim). Their policy: max 1 request/s, search on submit only.
  GEOCODER: 'https://nominatim.openstreetmap.org',
  // Walking routes (OpenStreetMap / FOSSGIS, foot profile ~5 km/h).
  WALK_ROUTER: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  // Fallback estimate when routing fails: straight line x detour factor at 80 m/min.
  WALK_M_PER_MIN: 80, DETOUR: 1.3,
};

/* ---------- Text (PT / EN) ---------- */
const TEXT = {
  pt: {
    addTrip: 'Nova viagem', editTrip: 'Editar viagem', addFirst: 'Adicionar a primeira viagem',
    emptyTitle: 'Quando sai o teu autocarro?',
    emptyText: 'Guarda as paragens que usas e vê as próximas partidas em tempo real, com o momento certo para saíres de casa.',
    stopLabel: 'Paragem', stopPh: 'Nome da paragem ou número', nearMe: 'Paragens perto de mim',
    change: 'Mudar', linesLabel: 'Linhas a mostrar', linesHint: 'Sem nenhuma escolhida, mostra todas.',
    nameLabel: 'Nome da viagem', namePh: 'Casa → trabalho', walkLabel: 'Minutos a pé até à paragem',
    save: 'Guardar', delete: 'Apagar', confirmDelete: 'Apagar esta viagem?',
    loadingStops: 'A carregar paragens…', stopsError: 'Não foi possível carregar as paragens. Verifica a ligação e tenta outra vez.',
    typeMore: 'Escreve pelo menos 2 letras.', noResults: 'Nenhuma paragem encontrada.',
    locating: 'A procurar a tua localização…', locError: 'Sem acesso à localização. Pesquisa pelo nome.',
    leaveIn: 'até saíres', leaveNow: 'Sai agora', toCatch: (l, t) => `para o ${l} das ${t}`,
    noneSoon: 'Nenhuma partida a tempo de apanhares', noDeps: 'Sem mais partidas hoje nesta paragem.',
    loadError: 'Não foi possível obter as partidas. Volta a tentar dentro de momentos.',
    now: 'agora', min: 'min', sched: 'horário', live: 'em tempo real',
    updatedAgo: s => s < 5 ? 'atualizado agora' : `atualizado há ${fmtAgo(s, 'pt')}`,
    stale: s => `sem dados há ${fmtAgo(s, 'pt')}`,
    alertsCount: n => n === 1 ? '1 aviso ativo nas tuas linhas' : `${n} avisos ativos nas tuas linhas`,
    stopNo: 'n.º', all: 'todas',
    fromLabel: 'De onde sais?', fromPh: 'Rua e número, localidade', search: 'Procurar',
    fromHint: 'Escreve a rua (com número, se quiseres) e carrega em Procurar.',
    useHere: 'Usar a minha localização atual', fromShort: 'Partida', searching: 'A procurar…',
    noPlaces: 'Nenhuma morada encontrada. Experimenta acrescentar a localidade, por exemplo “Almada”.',
    geoError: 'Não foi possível procurar a morada. Verifica a ligação e tenta outra vez.',
    currentLoc: 'Localização atual', nearest: 'Paragens mais próximas deste ponto:',
    fromLine: a => `Partida: ${a}`, fromTo: a => `De ${a}`,
    walkCalcing: 'A calcular o percurso a pé…',
    walkCalc: (m, d) => `Calculado pelo percurso a pé: ${m} min (${d}). Podes ajustar.`,
    walkEst: (m, d) => `Estimativa: cerca de ${m} min (${d} em linha reta). Podes ajustar.`,
  },
  en: {
    addTrip: 'New trip', editTrip: 'Edit trip', addFirst: 'Add your first trip',
    emptyTitle: 'When does your bus leave?',
    emptyText: 'Save the stops you use and see the next departures live, with the right moment to leave home.',
    stopLabel: 'Stop', stopPh: 'Stop name or number', nearMe: 'Stops near me',
    change: 'Change', linesLabel: 'Lines to show', linesHint: 'With none selected, all lines are shown.',
    nameLabel: 'Trip name', namePh: 'Home → work', walkLabel: 'Walking minutes to the stop',
    save: 'Save', delete: 'Delete', confirmDelete: 'Delete this trip?',
    loadingStops: 'Loading stops…', stopsError: 'Couldn’t load the stops. Check your connection and try again.',
    typeMore: 'Type at least 2 letters.', noResults: 'No stops found.',
    locating: 'Finding your location…', locError: 'No location access. Search by name instead.',
    leaveIn: 'until you leave', leaveNow: 'Leave now', toCatch: (l, t) => `for the ${l} at ${t}`,
    noneSoon: 'No departure you can still catch', noDeps: 'No more departures today at this stop.',
    loadError: 'Couldn’t get departures. Retrying shortly.',
    now: 'now', min: 'min', sched: 'timetable', live: 'live',
    updatedAgo: s => s < 5 ? 'updated just now' : `updated ${fmtAgo(s, 'en')} ago`,
    stale: s => `no data for ${fmtAgo(s, 'en')}`,
    alertsCount: n => n === 1 ? '1 active alert on your lines' : `${n} active alerts on your lines`,
    stopNo: 'no.', all: 'all',
    fromLabel: 'Where do you leave from?', fromPh: 'Street and number, town', search: 'Search',
    fromHint: 'Type the street (with a number if you like) and press Search.',
    useHere: 'Use my current location', fromShort: 'Starting point', searching: 'Searching…',
    noPlaces: 'No address found. Try adding the town, for example “Almada”.',
    geoError: 'Couldn’t search for the address. Check your connection and try again.',
    currentLoc: 'Current location', nearest: 'Stops closest to this point:',
    fromLine: a => `From: ${a}`, fromTo: a => `From ${a}`,
    walkCalcing: 'Working out the walking route…',
    walkCalc: (m, d) => `Based on the walking route: ${m} min (${d}). You can adjust it.`,
    walkEst: (m, d) => `Estimate: about ${m} min (${d} in a straight line). You can adjust it.`,
  },
};

function fmtAgo(s, lang) {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.round(s / 60);
  return lang === 'pt' ? `${m} min` : `${m} min`;
}

/* ---------- Safe storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

/* ---------- State ---------- */
const state = {
  lang: store.get('px_lang', (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'),
  trips: store.get('px_trips', []),
  places: store.get('px_places', []), // recent starting points [{label, sub, lat, lon}]
  stops: null,       // [{id, name, place, lat, lon, lines:[]}]
  lines: {},         // id -> {s, c, t, n}
  arrivals: {},      // stopId -> {list:[...], at:unixSeconds, error:bool}
  alerts: [],        // [{lines:Set, stops:Set, title, text}]
  lastOk: 0,
  editing: null,     // trip being edited (copy)
};
const t = (k, ...a) => { const v = TEXT[state.lang][k]; return typeof v === 'function' ? v(...a) : v; };
const $ = sel => document.querySelector(sel);
const nowS = () => Date.now() / 1000;

/* ---------- API ---------- */
const unwrap = j => (j && typeof j === 'object' && !Array.isArray(j) && 'data' in j && 'status' in j) ? j.data : j;

async function api(path) {
  try {
    const r = await fetch(CONFIG.API + path, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return unwrap(await r.json());
  } catch (err) {
    if (!CONFIG.PROXY) throw err;
    const r = await fetch(CONFIG.PROXY + '?path=' + encodeURIComponent(path), { cache: 'no-store' });
    if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
    return unwrap(await r.json());
  }
}

const normColor = c => !c ? null : (c.startsWith('#') ? c : '#' + c);

async function loadNetwork(force = false) {
  const cached = store.get('px_net', null);
  if (!force && cached && Date.now() - cached.at < CONFIG.STOPS_MAX_AGE_MS && cached.stops?.length) {
    state.stops = cached.stops; state.lines = cached.lines; return;
  }
  const [stops, lines, localities, municipalities] = await Promise.all([
    api('/stops'),
    api('/lines'),
    api('/locations/localities').catch(() => []),
    api('/locations/municipalities').catch(() => []),
  ]);
  const placeName = list => {
    const m = {};
    (Array.isArray(list) ? list : []).forEach(x => { m[x.id] = x.name || x.long_name || x.short_name || ''; });
    return m;
  };
  const loc = placeName(localities), mun = placeName(municipalities);
  state.stops = (stops || []).map(s => {
    const a = loc[s.locality_id], b = mun[s.municipality_id];
    return {
      id: String(s.id),
      name: s.long_name || s.name || s.short_name || String(s.id),
      place: [a, b && b !== a ? b : null].filter(Boolean).join(', '),
      lat: +s.lat, lon: +s.lon,
      lines: (s.line_ids || s.lines || []).map(String),
    };
  });
  state.lines = {};
  (lines || []).forEach(l => {
    state.lines[String(l.id)] = {
      s: l.short_name || String(l.id), n: l.long_name || '',
      c: normColor(l.color) || '#1F3A8A', t: normColor(l.text_color) || '#FFFFFF',
    };
  });
  // Keep the cache only if it fits; the app still works without it.
  store.set('px_net', { at: Date.now(), stops: state.stops, lines: state.lines });
}

async function loadArrivals(stopId) {
  try {
    const raw = await api('/arrivals/by_stop/' + encodeURIComponent(stopId));
    const list = (Array.isArray(raw) ? raw : [])
      .filter(a => !a.observed_arrival_unix)
      .map(a => {
        const est = Number(a.estimated_arrival_unix) || 0;
        const sch = Number(a.scheduled_arrival_unix) || 0;
        return {
          line: String(a.line_id), head: a.headsign || '',
          ts: est || sch, live: !!est, trip: a.trip_id,
        };
      })
      .filter(x => x.ts)
      .sort((a, b) => a.ts - b.ts);
    state.arrivals[stopId] = { list, at: nowS(), error: false };
    state.lastOk = Date.now();
  } catch (e) {
    const prev = state.arrivals[stopId];
    state.arrivals[stopId] = { list: prev ? prev.list : [], at: prev ? prev.at : 0, error: true };
  }
}

/* Service alerts (GTFS-RT style). Parsed defensively: both camelCase and snake_case. */
async function loadAlerts() {
  try {
    const raw = await api('/alerts');
    const entities = Array.isArray(raw) ? raw : (raw?.entity || raw?.entities || []);
    const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };
    const translate = obj => {
      const tr = pick(obj, 'translation', 'translations') || [];
      const want = state.lang === 'pt' ? ['pt', 'pt-PT', 'por'] : ['en', 'en-GB', 'en-US'];
      const hit = tr.find(x => want.includes(x.language)) || tr[0];
      return hit ? hit.text : (typeof obj === 'string' ? obj : '');
    };
    const now = nowS();
    state.alerts = entities.map(e => {
      const a = e.alert || e;
      const periods = pick(a, 'activePeriod', 'active_period', 'active_periods') || [];
      const active = !periods.length || periods.some(p => (!p.start || +p.start <= now) && (!p.end || +p.end >= now));
      if (!active) return null;
      const ents = pick(a, 'informedEntity', 'informed_entity', 'informed_entities') || [];
      const lines = new Set(), stops = new Set(), routes = [];
      ents.forEach(x => {
        const r = pick(x, 'routeId', 'route_id'); const l = pick(x, 'lineId', 'line_id'); const s = pick(x, 'stopId', 'stop_id');
        if (l) lines.add(String(l));
        if (r) routes.push(String(r));
        if (s) stops.add(String(s));
      });
      return {
        lines, stops, routes,
        title: translate(pick(a, 'headerText', 'header_text', 'title') || {}),
        text: translate(pick(a, 'descriptionText', 'description_text', 'description') || {}),
      };
    }).filter(Boolean);
  } catch { state.alerts = []; }
}

function alertsForTrip(trip) {
  const stopLines = trip.lines.length ? trip.lines : (stopById(trip.stopId)?.lines || []);
  return state.alerts.filter(a =>
    a.stops.has(trip.stopId) ||
    stopLines.some(l => a.lines.has(l) || a.routes.some(r => r === l || r.startsWith(l + '_'))));
}

/* ---------- Helpers ---------- */
const stopById = id => state.stops?.find(s => s.id === id);
const lineInfo = id => state.lines[id] || { s: id, c: '#1F3A8A', t: '#FFFFFF', n: '' };
const clock = ts => new Date(ts * 1000).toLocaleTimeString(state.lang === 'pt' ? 'pt-PT' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function upcomingFor(trip) {
  const a = state.arrivals[trip.stopId];
  if (!a) return null;
  const now = nowS();
  return a.list.filter(x => x.ts >= now - 30 && (!trip.lines.length || trip.lines.includes(x.line)));
}

function leavePlan(deps, walk) {
  const now = nowS();
  for (const d of deps) {
    const mins = Math.floor((d.ts - now) / 60);
    if (mins >= walk) {
      const leave = mins - walk;
      if (leave > 180) return { kind: 'none' };
      return { kind: leave <= 1 ? 'hurry' : 'go', leave, dep: d };
    }
  }
  return { kind: 'none' };
}

function badge(lineId) {
  const li = lineInfo(lineId);
  const b = document.createElement('span');
  b.className = 'badge';
  b.textContent = li.s;
  b.style.background = li.c; b.style.color = li.t;
  return b;
}

/* ---------- Render ---------- */
function applyStaticText() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $('#langBtn').textContent = state.lang === 'pt' ? 'EN' : 'PT';
  $('#addBtn').setAttribute('aria-label', t('addTrip'));
}

function render() {
  const wrap = $('#trips');
  const has = state.trips.length > 0;
  $('#empty').hidden = has;
  wrap.hidden = !has;
  wrap.replaceChildren(...state.trips.map(renderTrip));
  renderBanner();
  renderUpdated();
}

function renderTrip(trip) {
  const node = $('#tripTpl').content.firstElementChild.cloneNode(true);
  node.dataset.id = trip.id;
  const stop = stopById(trip.stopId);
  node.querySelector('.trip-name').textContent = trip.name || trip.stopName;
  const stopTxt = trip.name ? `${trip.stopName}, ${t('stopNo')} ${trip.stopId}` : `${t('stopNo')} ${trip.stopId}`;
  node.querySelector('.trip-stop').textContent = trip.from ? `${t('fromTo', trip.from.label)} \u2192 ${stopTxt}` : stopTxt;

  // Alerts
  const al = alertsForTrip(trip);
  const alBox = node.querySelector('.trip-alert');
  if (al.length) {
    alBox.hidden = false;
    al.slice(0, 3).forEach(a => {
      const d = document.createElement('details');
      const s = document.createElement('summary'); s.textContent = a.title || '⚠';
      d.append(s);
      if (a.text) { const p = document.createElement('p'); p.textContent = a.text; d.append(p); }
      alBox.append(d);
    });
  }

  const leave = node.querySelector('.leave');
  const num = node.querySelector('.leave-num');
  const txt = node.querySelector('.leave-text');
  const list = node.querySelector('.deps');
  const arr = state.arrivals[trip.stopId];
  const deps = upcomingFor(trip);

  if (!deps) {
    leave.classList.add('loading'); num.textContent = '··'; txt.textContent = '';
    return node;
  }

  const plan = leavePlan(deps, trip.walk);
  if (plan.kind === 'none') {
    leave.classList.add('none'); num.textContent = '–';
    txt.innerHTML = ''; const st = document.createElement('strong'); st.textContent = t('noneSoon'); txt.append(st);
  } else {
    leave.classList.add(plan.kind);
    num.innerHTML = '';
    num.append(String(Math.max(0, plan.leave)));
    const sm = document.createElement('small'); sm.textContent = t('min'); num.append(sm);
    txt.innerHTML = '';
    const st = document.createElement('strong');
    st.textContent = plan.kind === 'hurry' ? t('leaveNow') : t('leaveIn');
    txt.append(st, document.createTextNode(t('toCatch', lineInfo(plan.dep.line).s, clock(plan.dep.ts))));
  }

  if (arr?.error && !deps.length) {
    const li = document.createElement('li'); li.className = 'dep-error'; li.textContent = t('loadError'); list.append(li);
    return node;
  }
  if (!deps.length) {
    const li = document.createElement('li'); li.className = 'dep-empty'; li.textContent = t('noDeps'); list.append(li);
    return node;
  }

  const now = nowS();
  deps.slice(0, CONFIG.DEPS_SHOWN).forEach(d => {
    const mins = Math.floor((d.ts - now) / 60);
    const li = document.createElement('li');
    li.className = 'dep' + (mins < trip.walk ? ' missed' : '');
    const head = document.createElement('span'); head.className = 'dep-head'; head.textContent = d.head;
    const time = document.createElement('span'); time.className = 'dep-time';
    const m = document.createElement('span'); m.className = 'dep-min';
    if (d.live) { const dot = document.createElement('span'); dot.className = 'live-dot'; dot.title = t('live'); m.append(dot); }
    else { const s = document.createElement('span'); s.className = 'sched'; s.textContent = t('sched'); m.append(s); }
    m.append(mins <= 0 ? t('now') : `${mins} ${t('min')}`);
    const c = document.createElement('span'); c.className = 'dep-clock'; c.textContent = clock(d.ts);
    time.append(m, c);
    li.append(badge(d.line), head, time);
    list.append(li);
  });
  return node;
}

function renderBanner() {
  const b = $('#banner');
  const ids = new Set();
  state.trips.forEach(tr => alertsForTrip(tr).forEach(a => ids.add(a)));
  if (ids.size) { b.hidden = false; b.textContent = t('alertsCount', ids.size); }
  else b.hidden = true;
}

function renderUpdated() {
  const el = $('#updated');
  if (!state.trips.length || !state.lastOk) { el.textContent = ''; el.classList.remove('stale'); return; }
  const s = (Date.now() - state.lastOk) / 1000;
  const stale = s > CONFIG.STALE_AFTER_S;
  el.classList.toggle('stale', stale);
  el.textContent = stale ? t('stale', s) : t('updatedAgo', s);
}

/* ---------- Refresh loop ---------- */
let refreshing = false;
async function refresh() {
  if (refreshing || !state.trips.length) { render(); return; }
  refreshing = true;
  const stopIds = [...new Set(state.trips.map(tr => tr.stopId))];
  await Promise.all([...stopIds.map(loadArrivals), loadAlerts()]);
  refreshing = false;
  render();
}

let timer = null;
function startLoop() {
  clearInterval(timer);
  timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, CONFIG.REFRESH_MS);
}
setInterval(() => { if (document.visibilityState === 'visible' && !$('#editor').open) render(); }, 15_000);
setInterval(renderUpdated, 5_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

/* ---------- Editor ---------- */
const editor = $('#editor');
const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', state.lang === 'pt' ? ',' : '.')} km`;

async function openEditor(trip) {
  state.editing = trip
    ? { ...trip, lines: [...trip.lines] }
    : { id: null, from: null, stopId: null, stopName: '', lines: [], name: '', walk: 5 };
  state.editing.walkTouched = !!trip;
  $('#editorTitle').textContent = trip ? t('editTrip') : t('addTrip');
  $('#deleteBtn').hidden = !trip;
  $('#fromSearch').value = ''; $('#fromResults').replaceChildren(); $('#fromStatus').textContent = '';
  $('#stopSearch').value = ''; $('#stopResults').replaceChildren(); $('#stopStatus').textContent = '';
  $('#walkHint').textContent = '';
  renderSavedPlaces();
  showStep(trip ? 'details' : 'from');
  editor.showModal();
  if (trip) fillDetails();
  else setTimeout(() => $('#fromSearch').focus(), 50);
  if (!state.stops) {
    try { await loadNetwork(); if (trip) fillDetails(); else if (!$('#stepStop').hidden) showNearest(); }
    catch { $('#stopStatus').textContent = t('stopsError'); }
  }
}

function showStep(which) {
  $('#stepFrom').hidden = which !== 'from';
  $('#stepStop').hidden = which !== 'stop';
  $('#stepDetails').hidden = which !== 'details';
}

/* Step 1: starting point */
let lastGeo = 0;
async function nominatim(path, params) {
  const wait = 1100 - (Date.now() - lastGeo);           // respect 1 request/second
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGeo = Date.now();
  const u = new URL(CONFIG.GEOCODER + path);
  Object.entries({ format: 'jsonv2', addressdetails: 1, 'accept-language': state.lang, ...params })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function toPlace(r) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway || a.square || a.residential || r.name;
  const label = [road, a.house_number].filter(Boolean).join(' ') || (r.display_name || '').split(',')[0];
  const area = a.suburb || a.neighbourhood || a.quarter || a.city_district;
  const town = a.city || a.town || a.village || a.municipality;
  const sub = [...new Set([area, town].filter(Boolean))].join(', ');
  return { label, sub, lat: +r.lat, lon: +r.lon };
}

async function searchFrom() {
  const q = $('#fromSearch').value.trim();
  const status = $('#fromStatus');
  if (q.length < 3) { status.textContent = t('typeMore'); return; }
  status.textContent = t('searching');
  $('#fromResults').replaceChildren();
  try {
    // Bias results to the Lisbon metropolitan area, Portugal only.
    const res = await nominatim('/search', { q, countrycodes: 'pt', viewbox: '-9.55,39.05,-8.65,38.40', bounded: 0, limit: 8 });
    const places = (res || []).map(toPlace).filter(p => p.label);
    status.textContent = places.length ? '' : t('noPlaces');
    renderPlaceList($('#fromResults'), places);
  } catch { status.textContent = t('geoError'); }
}

function useHere() {
  const status = $('#fromStatus');
  if (!navigator.geolocation) { status.textContent = t('locError'); return; }
  status.textContent = t('locating');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    let place = { label: t('currentLoc'), sub: '', lat, lon };
    try { const r = await nominatim('/reverse', { lat, lon, zoom: 18 }); if (r && !r.error) place = { ...toPlace(r), lat, lon }; } catch {}
    status.textContent = '';
    chooseFrom(place);
  }, () => { status.textContent = t('locError'); }, { enableHighAccuracy: true, timeout: 10000 });
}

function renderPlaceList(ul, places) {
  ul.replaceChildren(...places.map(p => {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    const left = document.createElement('span');
    const n = document.createElement('span'); n.className = 'res-name'; n.textContent = p.label;
    const m = document.createElement('span'); m.className = 'res-meta'; m.textContent = p.sub;
    left.append(n, m); b.append(left);
    b.addEventListener('click', () => chooseFrom(p));
    li.append(b); return li;
  }));
}

function renderSavedPlaces() {
  const box = $('#savedPlaces');
  box.replaceChildren(...state.places.map(p => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip place-chip';
    b.textContent = p.label;
    if (p.sub) { const sm = document.createElement('small'); sm.textContent = p.sub; b.append(sm); }
    b.addEventListener('click', () => chooseFrom(p));
    return b;
  }));
  box.hidden = !state.places.length;
}

function rememberPlace(p) {
  const key = x => `${x.lat.toFixed(4)},${x.lon.toFixed(4)}`;
  state.places = [p, ...state.places.filter(x => key(x) !== key(p))].slice(0, 6);
  store.set('px_places', state.places);
}

function chooseFrom(place) {
  const e = state.editing;
  e.from = { label: place.label, sub: place.sub || '', lat: place.lat, lon: place.lon };
  e.walkTouched = false;
  rememberPlace(e.from);
  $('#fromName').textContent = [e.from.label, e.from.sub].filter(Boolean).join(', ');
  $('#stopSearch').value = '';
  showStep('stop');
  showNearest();
}

/* Step 2: stop */
function distFrom(stop) {
  const f = state.editing?.from;
  return f ? haversine(f.lat, f.lon, stop.lat, stop.lon) : null;
}

function showNearest() {
  const status = $('#stopStatus');
  if (!state.stops) { status.textContent = t('loadingStops'); return; }
  if (!state.editing?.from) { status.textContent = ''; $('#stopResults').replaceChildren(); return; }
  const items = state.stops.map(s => ({ stop: s, dist: distFrom(s) })).sort((a, b) => a.dist - b.dist).slice(0, 15);
  status.textContent = t('nearest');
  renderResults(items);
}

function renderResults(items) {
  const ul = $('#stopResults');
  ul.replaceChildren(...items.map(({ stop, dist }) => {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    const left = document.createElement('span');
    const n = document.createElement('span'); n.className = 'res-name'; n.textContent = stop.name;
    const m = document.createElement('span'); m.className = 'res-meta';
    const lineTxt = stop.lines.slice(0, 6).map(l => lineInfo(l).s).join(', ') + (stop.lines.length > 6 ? '…' : '');
    m.textContent = [stop.place, lineTxt].filter(Boolean).join(' / ');
    left.append(n, m);
    const side = document.createElement('span'); side.className = 'res-side';
    side.textContent = dist != null ? fmtDist(dist) : `${t('stopNo')} ${stop.id}`;
    b.append(left, side);
    b.addEventListener('click', () => chooseStop(stop));
    li.append(b);
    return li;
  }));
}

function searchStops(q) {
  if (!state.stops) return;
  const status = $('#stopStatus');
  const qq = fold(q).trim();
  if (!qq) { showNearest(); return; }
  if (qq.length < 2) { $('#stopResults').replaceChildren(); status.textContent = t('typeMore'); return; }
  const tokens = qq.split(/\s+/);
  const hits = [];
  for (const s of state.stops) {
    if (s.id === qq) { hits.unshift({ stop: s, score: -1 }); continue; }
    const hay = fold(s.name + ' ' + s.place);
    if (tokens.every(tok => hay.includes(tok))) hits.push({ stop: s, score: fold(s.name).startsWith(tokens[0]) ? 0 : 1 });
    if (hits.length > 400) break;
  }
  hits.forEach(h => { h.dist = distFrom(h.stop); });
  // Closest first when we know the starting point, otherwise best name match.
  hits.sort((a, b) => a.score - b.score || (a.dist != null ? a.dist - b.dist : a.stop.name.localeCompare(b.stop.name)));
  status.textContent = hits.length ? '' : t('noResults');
  renderResults(hits.slice(0, 40));
}

function haversine(a, b, c, d) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(c - a), dLon = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function chooseStop(stop) {
  const e = state.editing;
  if (e.stopId !== stop.id) e.lines = [];
  e.stopId = stop.id; e.stopName = stop.name;
  e.walkTouched = false;
  showStep('details');
  fillDetails();
  computeWalk(stop);
}

/* Walking time from the starting point to the stop */
let walkReq = 0;
async function computeWalk(stop) {
  const e = state.editing; const f = e?.from;
  if (!f || !stop) return;
  const id = ++walkReq;
  const straight = haversine(f.lat, f.lon, stop.lat, stop.lon);
  const est = Math.max(1, Math.ceil(straight * CONFIG.DETOUR / CONFIG.WALK_M_PER_MIN));
  const setWalk = (m, hint) => {
    if (id !== walkReq || state.editing !== e) return;
    if (!e.walkTouched) { e.walk = m; $('#walkMin').value = m; }
    $('#walkHint').textContent = hint;
  };
  setWalk(est, t('walkCalcing'));
  try {
    const r = await fetch(`${CONFIG.WALK_ROUTER}/${f.lon},${f.lat};${stop.lon},${stop.lat}?overview=false`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const route = j.routes && j.routes[0];
    if (!route) throw new Error('no route');
    const mins = Math.max(1, Math.ceil(route.duration / 60));
    setWalk(mins, t('walkCalc', mins, fmtDist(route.distance)));
  } catch {
    setWalk(est, t('walkEst', est, fmtDist(straight)));
  }
}

/* Step 3: details */
function fillDetails() {
  const e = state.editing;
  const stop = stopById(e.stopId);
  $('#chosenName').textContent = e.stopName;
  $('#chosenMeta').textContent = [stop?.place, `${t('stopNo')} ${e.stopId}`].filter(Boolean).join(', ');
  $('#chosenFrom').textContent = e.from ? t('fromLine', e.from.label) : '';
  $('#chosenFrom').hidden = !e.from;
  $('#tripName').value = e.name || '';
  $('#walkMin').value = e.walk ?? 5;
  const chips = $('#lineChips');
  const lineIds = stop ? stop.lines : e.lines;
  chips.replaceChildren(...lineIds.map(id => {
    const li = lineInfo(id);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = li.s; b.title = li.n;
    const on = () => e.lines.includes(id);
    const paint = () => {
      b.setAttribute('aria-pressed', on());
      b.style.background = on() ? li.c : 'transparent';
      b.style.color = on() ? li.t : '';
    };
    b.addEventListener('click', () => {
      e.lines = on() ? e.lines.filter(x => x !== id) : [...e.lines, id];
      paint();
    });
    paint();
    return b;
  }));
}

function saveTrip(ev) {
  ev.preventDefault();
  const e = state.editing;
  if (!e?.stopId || $('#stepDetails').hidden) return;
  e.name = $('#tripName').value.trim();
  e.walk = Math.max(0, Math.min(60, parseInt($('#walkMin').value, 10) || 0));
  const { walkTouched, ...trip } = e;
  if (trip.id) state.trips = state.trips.map(tr => tr.id === trip.id ? trip : tr);
  else { trip.id = 't' + Date.now().toString(36); state.trips.push(trip); }
  store.set('px_trips', state.trips);
  editor.close();
  render();
  refresh();
}

function deleteTrip() {
  const e = state.editing;
  if (!e?.id || !confirm(t('confirmDelete'))) return;
  state.trips = state.trips.filter(tr => tr.id !== e.id);
  store.set('px_trips', state.trips);
  editor.close();
  render();
}

/* ---------- Wire up ---------- */
let searchTimer;
$('#stopSearch').addEventListener('input', ev => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchStops(ev.target.value), 150);
});
$('#stopSearch').addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.preventDefault(); });
$('#fromSearch').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); searchFrom(); } });
$('#fromGo').addEventListener('click', searchFrom);
$('#fromHere').addEventListener('click', useHere);
$('#walkMin').addEventListener('input', () => { if (state.editing) state.editing.walkTouched = true; });
$('#editorForm').addEventListener('submit', saveTrip);
$('#deleteBtn').addEventListener('click', deleteTrip);
$('#addBtn').addEventListener('click', () => openEditor(null));
$('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'pt' ? 'en' : 'pt';
  store.set('px_lang', state.lang);
  applyStaticText(); render();
});
document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'add') openEditor(null);
  if (act === 'close') editor.close();
  if (act === 'changeFrom') { renderSavedPlaces(); showStep('from'); $('#fromSearch').focus(); }
  if (act === 'changeStop') {
    const f = state.editing?.from;
    $('#fromName').textContent = f ? [f.label, f.sub].filter(Boolean).join(', ') : '';
    if (f) { showStep('stop'); showNearest(); $('#stopSearch').focus(); }
    else { showStep('from'); $('#fromSearch').focus(); }
  }
  if (act === 'edit') {
    const id = a.closest('.trip')?.dataset.id;
    const trip = state.trips.find(tr => tr.id === id);
    if (trip) openEditor(trip);
  }
});
editor.addEventListener('click', ev => { if (ev.target === editor) editor.close(); });

async function boot() {
  applyStaticText();
  render();
  // Line names/colours for badges; the stop list itself is cached for a day.
  loadNetwork().then(render).catch(() => {});
  await refresh();
  startLoop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
