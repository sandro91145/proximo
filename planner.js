/* Próximo — journey planner.
 * Routes come from Transitous (https://transitous.org), a free, community-run
 * journey planner built on open timetable data for every Lisbon operator.
 * Carris Metropolitana bus legs are then checked against the live CM API.
 * Uses helpers from app.js (state, store, t, $, clock, loadArrivals, nominatim, toPlace, rememberPlace…).
 */
'use strict';

const PLAN_API = 'https://api.transitous.org/api/v5/plan';

Object.assign(TEXT.pt, {
  planTitle: 'Para onde vais?', planFromPh: 'De: rua ou local', planToPh: 'Para: rua ou local',
  swap: 'Trocar partida e destino', whenNow: 'Sair agora', whenDepart: 'Sair às', whenArrive: 'Chegar até às',
  planGo: 'Ver percursos', creditRoutes: 'Percursos calculados com', creditSources: 'fontes dos dados',
  creditOsm: 'Moradas e caminhos a pé', sourceCode: 'Código e contacto no GitHub',
  needFrom: 'Indica de onde sais.', needTo: 'Indica para onde vais.', pickPlace: 'Escolhe a morada certa.',
  planning: 'A procurar os melhores percursos…',
  planError: 'Não foi possível calcular percursos. Verifica a ligação e tenta outra vez.',
  noItins: 'Não encontrei percursos de transportes para esta viagem a esta hora.',
  allMissed: 'Os percursos encontrados já partiram. Carrega em Ver percursos para procurar outra vez.',
  best: 'Melhor opção', leaveInMin: m => `Sai em ${m} min`, leaveNowP: 'Sai agora', leaveAt: x => `Sai às ${x}`,
  transfers: n => n === 0 ? 'sem transbordos' : n === 1 ? '1 transbordo' : `${n} transbordos`,
  walkTo: x => `A pé até ${x}`, direction: h => `direção ${h}`,
  boardAt: (s, x) => `Apanha em ${s} às ${x}`, alightAt: (s, x) => `Sai em ${s} às ${x}`,
  stopsCount: n => n === 1 ? '1 paragem' : `${n} paragens`,
  liveAt: x => `ao vivo: ${x}`, delayed: m => `${m} min atrasado`, early: m => `${m} min adiantado`, onTime: 'a horas',
  cancelledLeg: 'Cancelado', destination: 'destino', yourStart: 'ponto de partida',
  alsoWalk: (m, d) => `Também podes ir a pé: ${m} min (${d}).`,
  showOnMap: 'Ver no mapa', mapBtn: 'Mapa', mapLabel: 'Mapa do percurso',
  mapHint: 'Toca no mapa para escolher a partida ou o destino. Podes arrastar os pontos.',
  mapFrom: 'Partir daqui', mapTo: 'Ir para aqui', mapPoint: 'Ponto no mapa',
  saveAsTrip: 'Guardar como viagem', savedTrip: 'Guardada nas tuas viagens, com a contagem de quando sair.',
  usedHere: 'Localização atual',
  modeWALK: 'A pé', modeBUS: 'Autocarro', modeTRAM: 'Elétrico', modeSUBWAY: 'Metro', modeFERRY: 'Barco',
  modeRAIL: 'Comboio', modeFUNICULAR: 'Funicular', modeAERIAL_LIFT: 'Teleférico', modeCOACH: 'Expresso',
});
Object.assign(TEXT.en, {
  planTitle: 'Where are you going?', planFromPh: 'From: street or place', planToPh: 'To: street or place',
  swap: 'Swap start and destination', whenNow: 'Leave now', whenDepart: 'Leave at', whenArrive: 'Arrive by',
  planGo: 'Show routes', creditRoutes: 'Routes by', creditSources: 'data sources',
  creditOsm: 'Addresses and walking paths', sourceCode: 'Source code and contact on GitHub',
  needFrom: 'Enter where you leave from.', needTo: 'Enter where you’re going.', pickPlace: 'Pick the right address.',
  planning: 'Finding the best routes…',
  planError: 'Couldn’t calculate routes. Check your connection and try again.',
  noItins: 'No public transport routes found for this journey at this time.',
  allMissed: 'The routes found have already left. Press Show routes to search again.',
  best: 'Best option', leaveInMin: m => `Leave in ${m} min`, leaveNowP: 'Leave now', leaveAt: x => `Leave at ${x}`,
  transfers: n => n === 0 ? 'no changes' : n === 1 ? '1 change' : `${n} changes`,
  walkTo: x => `Walk to ${x}`, direction: h => `towards ${h}`,
  boardAt: (s, x) => `Board at ${s} at ${x}`, alightAt: (s, x) => `Get off at ${s} at ${x}`,
  stopsCount: n => n === 1 ? '1 stop' : `${n} stops`,
  liveAt: x => `live: ${x}`, delayed: m => `${m} min late`, early: m => `${m} min early`, onTime: 'on time',
  cancelledLeg: 'Cancelled', destination: 'destination', yourStart: 'starting point',
  alsoWalk: (m, d) => `You could also walk: ${m} min (${d}).`,
  showOnMap: 'Show on map', mapBtn: 'Map', mapLabel: 'Route map',
  mapHint: 'Tap the map to choose the start or destination. You can drag the pins.',
  mapFrom: 'Leave from here', mapTo: 'Go here', mapPoint: 'Point on the map',
  saveAsTrip: 'Save as trip', savedTrip: 'Saved to your trips, with a countdown to when you leave.',
  usedHere: 'Current location',
  modeWALK: 'Walk', modeBUS: 'Bus', modeTRAM: 'Tram', modeSUBWAY: 'Metro', modeFERRY: 'Boat',
  modeRAIL: 'Train', modeFUNICULAR: 'Funicular', modeAERIAL_LIFT: 'Cable car', modeCOACH: 'Coach',
});

/* ---------- State ---------- */
const savedPlan = store.get('px_plan', {});
const plan = {
  from: savedPlan.from || null,
  to: savedPlan.to || null,
  active: null,      // which field saved-place chips fill
  results: null,     // itineraries from Transitous
  direct: null,      // walking-only option
  at: 0,             // when results were fetched (ms)
  mode: 'now',
  open: new Set(),   // keys of expanded itineraries
  req: 0,
};
const savePlan = () => store.set('px_plan', { from: plan.from, to: plan.to });
const placeText = p => p ? [p.label, p.sub].filter(Boolean).join(', ') : '';

/* ---------- Icons ---------- */
const ICONS = {
  WALK: '<path d="M13 4.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0ZM10 8l-3 2.5V14M10 8l3 1.5 2 3M10 8l-.8 5 3 3 1 4.5M9.2 13 7 16.5 5.5 20.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  BUS: '<rect x="5" y="3.5" width="14" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11h14M8 18.5V21M16 18.5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8.5" cy="15" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15" r="1.2" fill="currentColor"/>',
  TRAM: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 3h6M12 3v3M6 12h12M8 18l-2 3M16 18l2 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  SUBWAY: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 16.5V8l4.5 5 4.5-5v8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  FERRY: '<path d="M4 14h16l-2.5 4.5h-11L4 14ZM7 14V9.5h10V14M10 9.5V6.5h4v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 21c2 0 2.5-1 4.5-1s2.5 1 4.5 1 2.5-1 4.5-1 2.5 1 4.5 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  RAIL: '<rect x="6" y="3.5" width="12" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10.5h12M9 17.5 7 21M15 17.5l2 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9.5" cy="14" r="1.1" fill="currentColor"/><circle cx="14.5" cy="14" r="1.1" fill="currentColor"/>',
};
const RAIL_MODES = ['RAIL', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL', 'METRO'];
const iconKey = m => RAIL_MODES.includes(m) ? 'RAIL' : (ICONS[m] ? m : (m === 'FUNICULAR' || m === 'AERIAL_LIFT' || m === 'CABLE_CAR' ? 'TRAM' : (m === 'COACH' ? 'BUS' : 'BUS')));
const modeLabel = m => t('mode' + (RAIL_MODES.includes(m) ? 'RAIL' : m)) || m;
function icon(mode) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[iconKey(mode)];
  return s;
}

/* ---------- Helpers ---------- */
const isoS = iso => iso ? Date.parse(iso) / 1000 : 0;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
const lineName = leg => leg.routeShortName || leg.displayName || leg.tripShortName || modeLabel(leg.mode);
const isTransit = leg => leg.mode && !['WALK', 'BIKE', 'CAR', 'RENTAL', 'FLEX', 'ODM', 'CAR_PARKING'].includes(leg.mode);

// Carris Metropolitana legs: get the CM stop number (6 digits) from Transitous' stop id.
function cmStop(leg) {
  const isCM = /carris.?metropolitana/i.test(leg.agencyName || '') || /carris.?metropolitana/i.test(leg.from?.stopId || '');
  if (!isCM) return null;
  const m = String(leg.from?.stopId || '').match(/(\d{6})$/);
  return m ? m[1] : null;
}

/* Live data for CM buses: match by line + scheduled time at the boarding stop. */
async function enrichLive() {
  if (!plan.results) return;
  const legs = plan.results.flatMap(it => it.legs.filter(l => isTransit(l) && cmStop(l)));
  const stops = [...new Set(legs.map(cmStop))];
  if (!stops.length) return;
  await Promise.all(stops.map(id => loadArrivals(id)));
  legs.forEach(l => {
    const list = state.arrivals[cmStop(l)]?.list || [];
    const sched = isoS(l.scheduledStartTime || l.startTime);
    const line = String(l.routeShortName || '');
    let pick = null, diff = 1e9;
    for (const a of list) {
      if (a.line !== line || !a.sch) continue;
      const d = Math.abs(a.sch - sched);
      if (d <= 240 && d < diff) { pick = a; diff = d; }
    }
    l._live = pick && pick.live ? { ts: pick.ts, delay: Math.round((pick.ts - sched) / 60) } : null;
  });
}

// When to leave, using live data for the first transit leg when available.
function leaveTs(it) {
  const k = it.legs.findIndex(isTransit);
  if (k > 0 && it.legs[k]._live) {
    const before = it.legs.slice(0, k).reduce((s, l) => s + (l.duration || 0), 0);
    return it.legs[k]._live.ts - before;
  }
  if (k === 0 && it.legs[0]._live) return it.legs[0]._live.ts;
  return isoS(it.startTime);
}
const itinKey = it => `${it.startTime}|${it.endTime}|${it.legs.filter(isTransit).map(lineName).join('-')}`;

/* ---------- Place fields ---------- */
const fieldEls = which => which === 'from'
  ? { input: $('#planFrom'), pop: $('#fromPop') }
  : { input: $('#planTo'), pop: $('#toPop') };

function setPlace(which, p, run = true) {
  plan[which] = { label: p.label, sub: p.sub || '', lat: p.lat, lon: p.lon };
  const { input, pop } = fieldEls(which);
  input.value = placeText(plan[which]);
  pop.hidden = true; pop.replaceChildren();
  rememberPlace(plan[which]);
  renderPlanPlaces();
  savePlan();
  window.dispatchEvent(new Event('px:plan'));
  if (run && plan.from && plan.to) runPlan();
}

async function resolveField(which) {
  const { input, pop } = fieldEls(which);
  const q = input.value.trim();
  const status = $('#planStatus');
  if (q.length < 3) { status.textContent = t(which === 'from' ? 'needFrom' : 'needTo'); input.focus(); return; }
  status.textContent = t('searching');
  try {
    const res = await nominatim('/search', { q, countrycodes: 'pt', viewbox: '-9.55,39.05,-8.65,38.40', bounded: 0, limit: 6 });
    const places = (res || []).map(toPlace).filter(p => p.label);
    if (!places.length) { status.textContent = t('noPlaces'); return; }
    if (places.length === 1) { status.textContent = ''; setPlace(which, places[0]); return; }
    status.textContent = t('pickPlace');
    pop.replaceChildren(...places.map(p => {
      const li = el('li'); const b = el('button'); b.type = 'button';
      const left = el('span'); left.append(el('span', 'res-name', p.label), el('span', 'res-meta', p.sub));
      b.append(left);
      b.addEventListener('click', () => { status.textContent = ''; setPlace(which, p); });
      li.append(b); return li;
    }));
    pop.hidden = false;
  } catch { status.textContent = t('geoError'); }
}

function planHere() {
  const status = $('#planStatus');
  if (!navigator.geolocation) { status.textContent = t('locError'); return; }
  status.textContent = t('locating');
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lon } = pos.coords;
    let p = { label: t('usedHere'), sub: '', lat, lon };
    try { const r = await nominatim('/reverse', { lat, lon, zoom: 18 }); const q = r && !r.error ? toPlace(r) : null; if (q?.label) p = { ...q, lat, lon }; } catch {}
    status.textContent = '';
    setPlace('from', p);
  }, () => { status.textContent = t('locError'); }, { enableHighAccuracy: true, timeout: 10000 });
}

function renderPlanPlaces() {
  const box = $('#planPlaces');
  const used = new Set([plan.from, plan.to].filter(Boolean).map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`));
  const list = state.places.filter(p => !used.has(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)).slice(0, 5);
  box.replaceChildren(...list.map(p => {
    const b = el('button', 'chip place-chip', p.label); b.type = 'button';
    if (p.sub) b.append(el('small', null, p.sub));
    b.addEventListener('click', () => setPlace(plan.active || (plan.from ? 'to' : 'from'), p));
    return b;
  }));
  box.hidden = !list.length;
}

/* ---------- Routing ---------- */
function localInputValue(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function runPlan() {
  const status = $('#planStatus');
  if (!plan.from) { if ($('#planFrom').value.trim()) return resolveField('from'); status.textContent = t('needFrom'); return; }
  if (!plan.to) { if ($('#planTo').value.trim()) return resolveField('to'); status.textContent = t('needTo'); return; }
  const mode = $('#whenMode').value;
  const u = new URL(PLAN_API);
  u.searchParams.set('fromPlace', `${plan.from.lat},${plan.from.lon}`);
  u.searchParams.set('toPlace', `${plan.to.lat},${plan.to.lon}`);
  u.searchParams.set('detailedTransfers', 'false');
  u.searchParams.set('language', state.lang);
  if (mode !== 'now' && $('#whenTime').value) {
    u.searchParams.set('time', new Date($('#whenTime').value).toISOString());
    u.searchParams.set('arriveBy', String(mode === 'arrive'));
  }
  const id = ++plan.req;
  status.textContent = t('planning');
  $('#planBtn').disabled = true;
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (id !== plan.req) return;
    plan.results = (j.itineraries || []).filter(it => Array.isArray(it.legs) && it.legs.length);
    plan.direct = (j.direct || []).find(d => d.legs?.length === 1 && d.legs[0].mode === 'WALK') || null;
    plan.at = Date.now(); plan.mode = mode; plan.open = new Set(); plan.selected = null;
    status.textContent = '';
    renderPlan();
    await enrichLive();
    if (id === plan.req) renderPlan();
  } catch {
    if (id === plan.req) status.textContent = t('planError');
  } finally {
    if (id === plan.req) $('#planBtn').disabled = false;
  }
}

/* ---------- Render ---------- */
function orderItins() {
  const now = nowS();
  let list = plan.results.map(it => ({ it, leave: leaveTs(it), end: isoS(it.endTime) }));
  if (plan.mode !== 'arrive') list = list.filter(x => x.leave >= now - 60);
  if (!list.length) return [];
  // Best: earliest arrival, then fewer changes, then leaving later (arrive-by: leave latest).
  const best = [...list].sort((a, b) => plan.mode === 'arrive'
    ? (b.leave - a.leave) || (a.it.transfers - b.it.transfers)
    : (a.end - b.end) || (a.it.transfers - b.it.transfers) || (b.leave - a.leave))[0];
  const rest = list.filter(x => x !== best).sort((a, b) => a.leave - b.leave);
  return [{ ...best, best: true }, ...rest];
}

function leaveLabel(ts) {
  const m = Math.floor((ts - nowS()) / 60);
  if (plan.mode !== 'now' || m > 59) return { text: t('leaveAt', clock(ts)), cls: '' };
  if (m <= 1) return { text: t('leaveNowP'), cls: 'hurry' };
  return { text: t('leaveInMin', m), cls: '' };
}

function lineBadge(leg) {
  const b = el('span', 'leg-badge');
  b.style.background = normColor(leg.routeColor) || 'var(--cobalt)';
  b.style.color = normColor(leg.routeTextColor) || '#fff';
  b.title = modeLabel(leg.mode);
  b.append(icon(leg.mode), document.createTextNode(lineName(leg)));
  return b;
}

function renderPlan() {
  _renderPlan();
  window.dispatchEvent(new Event('px:plan'));
}
function _renderPlan() {
  const ul = $('#itins');
  const status = $('#planStatus');
  plan.shown = [];
  if (!plan.results) { ul.replaceChildren(); return; }
  if (!plan.results.length) { ul.replaceChildren(); status.textContent = t('noItins'); return; }
  const ordered = orderItins();
  if (!ordered.length) { ul.replaceChildren(); status.textContent = t('allMissed'); return; }
  if (status.textContent === t('allMissed') || status.textContent === t('noItins')) status.textContent = '';
  plan.shown = ordered;

  ul.replaceChildren(...ordered.map(x => renderItin(x)));
  if (plan.direct && plan.direct.duration <= 40 * 60) {
    const leg = plan.direct.legs[0];
    ul.append(el('li', 'itin-walk hint', t('alsoWalk', Math.round(plan.direct.duration / 60), fmtDist(leg.distance || 0))));
  }
}

function renderItin({ it, leave, best }) {
  const key = itinKey(it);
  const li = el('li', 'itin' + (best ? ' best' : ''));
  const sum = el('button', 'itin-sum'); sum.type = 'button';
  const open = plan.open.has(key);
  sum.setAttribute('aria-expanded', open);

  const r1 = el('div', 'itin-row1');
  const lv = leaveLabel(leave);
  const anyLive = it.legs.some(l => l._live || (isTransit(l) && l.realTime));
  const lvEl = el('span', 'itin-leave ' + lv.cls);
  if (anyLive) { const d = el('span', 'live-dot'); d.title = t('live'); lvEl.append(d); }
  lvEl.append(lv.text);
  r1.append(lvEl, el('span', 'itin-dur', fmtDur(isoS(it.endTime) - isoS(it.startTime))));

  const r2 = el('div', 'itin-row2');
  if (best) r2.append(el('span', 'pill-best', t('best')));
  r2.append(el('span', null, `${clock(isoS(it.startTime))} – ${clock(isoS(it.endTime))}`), el('span', null, t('transfers', it.transfers || 0)));

  const legsEl = el('div', 'itin-legs');
  it.legs.forEach((l, i) => {
    if (!isTransit(l) && (l.duration || 0) < 60) return;
    if (legsEl.childNodes.length) legsEl.append(el('span', 'leg-sep', '›'));
    if (isTransit(l)) legsEl.append(lineBadge(l));
    else { const w = el('span', 'leg-walk'); w.title = modeLabel('WALK'); w.append(icon('WALK'), document.createTextNode(String(Math.round(l.duration / 60)))); legsEl.append(w); }
  });

  sum.append(r1, r2, legsEl);
  sum.addEventListener('click', () => {
    if (plan.open.has(key)) plan.open.delete(key); else { plan.open.add(key); plan.selected = key; }
    renderPlan();
  });
  li.append(sum);
  if (open) li.append(renderSteps(it));
  return li;
}

function renderSteps(it) {
  const box = el('div', 'itin-detail');
  const ol = el('ol', 'steps');
  it.legs.forEach((l, i) => {
    const last = i === it.legs.length - 1;
    const li = el('li', 'pstep');
    if (!isTransit(l)) {
      if ((l.duration || 0) < 30) return;
      const toName = last ? (plan.to?.label || t('destination')) : (l.to?.name || '');
      li.classList.add('pstep-walk');
      li.append(el('div', 'step-title', t('walkTo', toName)),
        el('div', 'step-meta', [fmtDur(l.duration), l.distance ? fmtDist(l.distance) : ''].filter(Boolean).join(', ')));
    } else {
      li.style.setProperty('--c', normColor(l.routeColor) || 'var(--cobalt)');
      const head = el('div', 'step-title');
      head.append(lineBadge(l), document.createTextNode(' ' + (l.headsign ? t('direction', l.headsign) : modeLabel(l.mode))));
      const board = el('div', 'step-meta');
      const sched = isoS(l.scheduledStartTime || l.startTime);
      board.append(t('boardAt', l.from?.name || '', clock(sched)));
      if (l.cancelled) board.append(' ', el('strong', 'late', t('cancelledLeg')));
      else if (l._live) board.append(' ', liveNote(l._live.ts, l._live.delay));
      else if (l.realTime) board.append(' ', liveNote(isoS(l.startTime), Math.round((isoS(l.startTime) - sched) / 60)));
      const n = (l.intermediateStops?.length || 0) + 1;
      const off = el('div', 'step-meta', `${t('alightAt', l.to?.name || '', clock(isoS(l.endTime)))}, ${t('stopsCount', n)}`);
      if (l.agencyName) off.append(el('span', 'step-agency', ` (${l.agencyName})`));
      li.append(head, board, off);
    }
    ol.append(li);
  });
  box.append(ol);

  const mapBtn = el('button', 'ghost show-on-map', t('showOnMap')); mapBtn.type = 'button';
  mapBtn.addEventListener('click', () => {
    plan.selected = itinKey(it);
    window.dispatchEvent(new CustomEvent('px:showmap'));
    renderPlan();
  });
  box.append(mapBtn);

  // Save as a trip: the first stop where you board, with its line, becomes a saved trip with a countdown.
  const k = it.legs.findIndex(isTransit);
  const first = k >= 0 ? it.legs[k] : null;
  if (first && first.from?.stopId && plan.from) {
    const b = el('button', 'ghost save-trip', t('saveAsTrip')); b.type = 'button';
    b.addEventListener('click', () => {
      const walkSec = it.legs.slice(0, k).reduce((s, l) => s + (l.duration || 0), 0);
      const cm = cmStop(first);
      const line = String(lineName(first));
      state.trips.push({
        id: 't' + Date.now().toString(36),
        source: cm ? 'cm' : 'tr',
        from: plan.from, stopId: cm || first.from.stopId, trId: first.from.stopId,
        stopName: first.from?.name || '',
        lines: line ? [line] : [],
        lineMeta: line ? { [line]: { c: normColor(first.routeColor), t: normColor(first.routeTextColor) } } : {},
        name: `${plan.from.label} → ${plan.to?.label || ''}`.trim(),
        walk: Math.ceil(walkSec / 60),
      });
      store.set('px_trips', state.trips);
      $('#planStatus').textContent = t('savedTrip');
      render(); refresh();
    });
    box.append(b);
  }
  return box;
}

function liveNote(ts, delay) {
  const s = el('span', 'live-txt' + (delay >= 2 ? ' late' : ''));
  const d = el('span', 'live-dot'); s.append(d);
  const rel = delay >= 1 ? t('delayed', delay) : delay <= -1 ? t('early', -delay) : t('onTime');
  s.append(`${t('liveAt', clock(ts))}, ${rel}`);
  return s;
}

/* ---------- Wire up ---------- */
['from', 'to'].forEach(which => {
  const { input, pop } = fieldEls(which);
  input.addEventListener('focus', () => { plan.active = which; });
  input.addEventListener('input', () => { plan[which] = null; pop.hidden = true; });
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); resolveField(which); } });
});
$('#planHere').addEventListener('click', planHere);
$('#swapBtn').addEventListener('click', () => {
  [plan.from, plan.to] = [plan.to, plan.from];
  const a = $('#planFrom').value; $('#planFrom').value = $('#planTo').value; $('#planTo').value = a;
  savePlan(); renderPlanPlaces();
  window.dispatchEvent(new Event('px:plan'));
  if (plan.from && plan.to) runPlan();
});
$('#whenMode').addEventListener('change', ev => {
  const show = ev.target.value !== 'now';
  $('#whenTime').hidden = !show;
  if (show && !$('#whenTime').value) {
    const d = new Date(Date.now() + 15 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    $('#whenTime').value = localInputValue(d);
  }
});
$('#planBtn').addEventListener('click', runPlan);

window.addEventListener('px:render', () => { renderPlan(); });
window.addEventListener('px:refresh', () => {
  if (!plan.results || document.visibilityState !== 'visible') return;
  // Departing now: look again after 5 minutes so options stay current; otherwise just refresh live bus data.
  if (plan.mode === 'now' && Date.now() - plan.at > 5 * 60000) runPlan();
  else enrichLive().then(renderPlan);
});

// Restore the last start and destination.
if (plan.from) $('#planFrom').value = placeText(plan.from);
if (plan.to) $('#planTo').value = placeText(plan.to);
window.addEventListener('DOMContentLoaded', renderPlanPlaces);
