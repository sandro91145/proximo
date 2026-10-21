/* Próximo — journey mode.
 * Follows a route step by step after you press "Começar viagem".
 * Without location: follows the timetable; you tap to move on, and it tells you when you look behind.
 * With location (while the app is open): moves on by itself, warns before your stop,
 * and recalculates from where you are if you miss a connection.
 */
'use strict';

Object.assign(TEXT.pt, {
  jTo: x => `Para ${x}`, jEta: x => `Chegada prevista às ${x}`, jEnd: 'Terminar', jRecalc: 'Recalcular daqui',
  jGps: 'Seguir com a minha localização', jGpsOn: 'A seguir a tua localização enquanto a app está aberta.',
  jGpsAcc: m => `A seguir a tua localização (precisão ${m} m).`,
  jGpsOff: 'Sem localização: a app segue o horário e tu avanças os passos.',
  jGpsDenied: 'Sem acesso à localização. Podes permitir nas definições do browser, ou seguir pelo horário.',
  jGpsPaused: 'A localização pausa quando a app não está no ecrã.',
  jWalkTo: x => `A pé até ${x}`, jLeft: (d) => `Faltam ${d}`, jWalkMeta: (m, d) => `${m} min a pé, ${d}`,
  jCatch: (l, x, m) => `Para apanhares o ${l} das ${x}${m != null ? `, tens ${m} min` : ''}.`,
  jWait: (s) => `Espera em ${s}`, jTake: (l, h) => `Apanha o ${l}${h ? ' direção ' + h : ''}`,
  jDeparts: (x, m) => `Parte às ${x}${m > 0 ? ` (daqui a ${m} min)` : ''}`,
  jRide: (l) => `No ${l}`, jGetOff: (s, x) => `Sai em ${s} às ${x}`,
  jStopsLeft: n => n <= 0 ? 'É a próxima paragem' : n === 1 ? 'Falta 1 paragem' : `Faltam ${n} paragens`,
  jGetOffNext: 'Sai na próxima!', jGetOffNow: 'Sai agora!', jYouMinutes: 'min',
  jArrivedBtn: 'Cheguei', jBoardedBtn: 'Já entrei', jOffBtn: 'Já saí', jDestBtn: 'Cheguei ao destino',
  jDone: x => `Chegaste a ${x}.`, jDoneSub: 'Boa viagem! Podes fechar este ecrã.', jClose: 'Fechar',
  jBehind: x => `Pelo horário, já devias ter chegado a ${x}.`, jSkip: 'Avançar',
  jMissedWalk: (l) => `Já não chegas a tempo do ${l}.`, jMissedWait: (l) => `Parece que o ${l} já passou.`,
  jRecalcing: 'A procurar o melhor percurso a partir daqui…', jRecalcDone: x => `Novo percurso: chegada às ${x}.`,
  jRecalcFail: 'Não foi possível recalcular. Verifica a ligação e tenta outra vez.',
  jRecalcNone: 'Não encontrei outro percurso a partir daqui agora.', jAuto: 'Recalculado automaticamente.',
  jNext: 'Depois', jLive: 'ao vivo', jStepWalk: (x, m) => `A pé até ${x}, ${m} min`,
  jStepRide: (l, a, b) => `${l}: ${a} → ${b}`, jHere: 'A tua posição',
});
Object.assign(TEXT.en, {
  jTo: x => `To ${x}`, jEta: x => `Expected arrival ${x}`, jEnd: 'End', jRecalc: 'Recalculate from here',
  jGps: 'Follow my location', jGpsOn: 'Following your location while the app is open.',
  jGpsAcc: m => `Following your location (accuracy ${m} m).`,
  jGpsOff: 'No location: the app follows the timetable and you move through the steps.',
  jGpsDenied: 'No location access. You can allow it in the browser settings, or follow the timetable.',
  jGpsPaused: 'Location pauses while the app isn’t on screen.',
  jWalkTo: x => `Walk to ${x}`, jLeft: (d) => `${d} to go`, jWalkMeta: (m, d) => `${m} min walk, ${d}`,
  jCatch: (l, x, m) => `To catch the ${l} at ${x}${m != null ? `, you have ${m} min` : ''}.`,
  jWait: (s) => `Wait at ${s}`, jTake: (l, h) => `Take the ${l}${h ? ' towards ' + h : ''}`,
  jDeparts: (x, m) => `Leaves at ${x}${m > 0 ? ` (in ${m} min)` : ''}`,
  jRide: (l) => `On the ${l}`, jGetOff: (s, x) => `Get off at ${s} at ${x}`,
  jStopsLeft: n => n <= 0 ? 'Next stop is yours' : n === 1 ? '1 stop to go' : `${n} stops to go`,
  jGetOffNext: 'Get off at the next stop!', jGetOffNow: 'Get off now!', jYouMinutes: 'min',
  jArrivedBtn: 'I’m there', jBoardedBtn: 'I’m on board', jOffBtn: 'I got off', jDestBtn: 'I’ve arrived',
  jDone: x => `You’ve arrived at ${x}.`, jDoneSub: 'Have a good one! You can close this screen.', jClose: 'Close',
  jBehind: x => `By the timetable, you should have reached ${x} by now.`, jSkip: 'Move on',
  jMissedWalk: (l) => `You won’t make the ${l} in time.`, jMissedWait: (l) => `Looks like the ${l} has already left.`,
  jRecalcing: 'Finding the best route from here…', jRecalcDone: x => `New route: arriving at ${x}.`,
  jRecalcFail: 'Couldn’t recalculate. Check your connection and try again.',
  jRecalcNone: 'No other route found from here right now.', jAuto: 'Recalculated automatically.',
  jNext: 'Then', jLive: 'live', jStepWalk: (x, m) => `Walk to ${x}, ${m} min`,
  jStepRide: (l, a, b) => `${l}: ${a} → ${b}`, jHere: 'Your position',
});

/* ---------- State ---------- */
const J = {
  active: false, it: null, steps: [], idx: 0, boarded: -1, to: null, done: false,
  gps: false, watchId: null, pos: null, wake: null, lastRecalc: 0, note: '', timer: null,
  map: null, layer: null, me: null,
};

function buildSteps(it) {
  return it.legs.filter(l => isTransit(l) || (l.duration || 0) >= 30).map(l => ({ leg: l, transit: isTransit(l) }));
}
const legDelay = l => l._live ? l._live.delay * 60 : 0;
const stepStart = s => s.transit && s.leg._live ? s.leg._live.ts : isoS(s.leg.startTime);
const stepEnd = s => isoS(s.leg.endTime) + legDelay(s.leg);
const endPlace = (s, last) => last ? { name: J.to.label, lat: J.to.lat, lon: J.to.lon } : s.leg.to;
const distTo = p => (J.pos && p?.lat != null) ? haversine(J.pos.lat, J.pos.lon, p.lat, p.lon) : null;
const nextTransit = () => J.steps.slice(J.idx + 1).find(s => s.transit) || null;
const minsUntil = ts => Math.max(0, Math.round((ts - nowS()) / 60));

function save() {
  if (!J.active) { store.set('px_journey', null); return; }
  store.set('px_journey', { it: J.it, idx: J.idx, boarded: J.boarded, to: J.to, gps: J.gps, done: J.done });
}

/* ---------- Start / stop ---------- */
function startJourney(it, opts = {}) {
  J.it = JSON.parse(JSON.stringify(it));
  // keep live info computed by the planner
  J.it.legs.forEach((l, i) => { if (it.legs[i]._live) l._live = it.legs[i]._live; });
  J.steps = buildSteps(J.it);
  J.idx = opts.idx || 0; J.boarded = opts.boarded ?? -1;
  J.to = opts.to || plan.to; J.done = !!opts.done; J.active = true; J.note = '';
  const dlg = $('#journey');
  if (!dlg.open) dlg.showModal();
  $('#jGps').checked = !!opts.gps;
  if (opts.gps) setGps(true); else renderGpsStatus();
  save();
  renderJourney();
  clearInterval(J.timer);
  J.timer = setInterval(() => { if (document.visibilityState === 'visible') { checkProgress(); renderJourney(); } }, 15000);
  ensureJMap();
}

function endJourney() {
  setGps(false);
  clearInterval(J.timer);
  J.active = false; save();
  $('#journey').close();
}

/* ---------- Location ---------- */
async function setGps(on) {
  J.gps = on;
  if (J.watchId != null) { navigator.geolocation.clearWatch(J.watchId); J.watchId = null; }
  if (J.wake) { try { await J.wake.release(); } catch {} J.wake = null; }
  if (on) {
    if (!navigator.geolocation) { J.gps = false; $('#jGps').checked = false; J.note = t('jGpsDenied'); renderJourney(); return; }
    J.watchId = navigator.geolocation.watchPosition(onPos, err => {
      if (err.code === 1) { J.gps = false; $('#jGps').checked = false; J.note = t('jGpsDenied'); setGps(false); }
      renderGpsStatus();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    // Keep the screen on so tracking doesn't pause (where the browser supports it).
    try { if ('wakeLock' in navigator) J.wake = await navigator.wakeLock.request('screen'); } catch {}
  }
  save(); renderGpsStatus();
}

function onPos(p) {
  J.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), at: Date.now() };
  checkProgress();
  renderJourney();
  drawJMe();
}

function renderGpsStatus() {
  const st = $('#jGpsStatus');
  if (!J.gps) st.textContent = J.note === t('jGpsDenied') ? t('jGpsDenied') : t('jGpsOff');
  else st.textContent = J.pos ? `${t('jGpsAcc', J.pos.acc)} ${t('jGpsPaused')}` : t('jGpsOn');
}

/* ---------- Progress (location mode moves on by itself) ---------- */
function advance() {
  if (J.idx >= J.steps.length - 1) { J.done = true; }
  else { J.idx++; }
  J.note = '';
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  save(); renderJourney(); drawJRoute();
  // With location on, the next step may already be done (e.g. a 0 m change inside a station).
  if (J.gps && J.pos && !J.done) setTimeout(() => { checkProgress(); renderJourney(); }, 0);
}

function checkProgress() {
  if (!J.active || J.done || !J.steps.length) return;
  const s = J.steps[J.idx];
  const last = J.idx === J.steps.length - 1;
  const now = nowS();
  if (!J.gps || !J.pos) return;
  const near = Math.max(60, Math.min(J.pos.acc + 25, 150));
  if (!s.transit) {
    if (distTo(endPlace(s, last)) <= near) return advance();
    // Missed the next departure while still walking?
    const nt = nextTransit();
    if (nt && now > stepStart(nt) + 60) autoRecalc(t('jMissedWalk', lineName(nt.leg)));
    return;
  }
  const dBoard = distTo(s.leg.from), dOff = distTo(s.leg.to);
  if (J.boarded !== J.idx) {
    // On board once you've moved away from the stop along the way after departure time.
    if (now >= stepStart(s) - 60 && dBoard != null && dBoard > 200 && dOff != null && dOff < haversine(s.leg.from.lat, s.leg.from.lon, s.leg.to.lat, s.leg.to.lon)) {
      J.boarded = J.idx; save();
    } else if (now > stepStart(s) + 180 && dBoard != null && dBoard < 150) {
      autoRecalc(t('jMissedWait', lineName(s.leg)));
    }
    return;
  }
  if (dOff != null && dOff <= Math.max(80, near)) advance();
}

/* ---------- Recalculate from where you are ---------- */
async function recalc(reason = '', auto = false) {
  const s = J.steps[J.idx];
  let from;
  if (J.pos && Date.now() - J.pos.at < 120000) from = { lat: J.pos.lat, lon: J.pos.lon };
  else if (s.transit && J.boarded === J.idx) from = s.leg.to;          // on board: from where you get off
  else from = s.transit ? s.leg.from : s.leg.from;                      // otherwise: from where this step starts
  if (from?.lat == null) from = s.leg.to;
  J.lastRecalc = Date.now();
  J.note = (reason ? reason + ' ' : '') + t('jRecalcing');
  renderJourney();
  try {
    const res = await fetchItins(from, J.to);
    const list = res.itineraries.map(it => ({ it, end: isoS(it.endTime), av: avoidedIn(it).avoid.length }))
      .filter(x => isoS(x.it.startTime) >= nowS() - 120)
      .sort((a, b) => (a.av - b.av) || (a.end - b.end) || (a.it.transfers - b.it.transfers));
    if (!list.length) { J.note = (reason ? reason + ' ' : '') + t('jRecalcNone'); renderJourney(); return; }
    await enrichLive([list[0].it]);
    const gps = J.gps;
    startJourney(list[0].it, { to: J.to, gps });
    J.note = (auto ? t('jAuto') + ' ' : '') + t('jRecalcDone', clock(isoS(list[0].it.endTime) + legDelay(list[0].it.legs.at(-1))));
    renderJourney(); drawJRoute();
  } catch {
    J.note = t('jRecalcFail'); renderJourney();
  }
}
function autoRecalc(reason) {
  if (Date.now() - J.lastRecalc < 120000) return; // at most every 2 minutes
  recalc(reason, true);
}

/* ---------- Render ---------- */
function bigNum(n, unit) {
  const d = el('div', 'j-big');
  d.append(String(n));
  if (unit) d.append(el('small', null, unit));
  return d;
}

function renderJourney() {
  if (!J.active) return;
  const now = nowS();
  $('#jTitle').textContent = t('jTo', J.to?.label || t('destination'));
  const lastStep = J.steps[J.steps.length - 1];
  $('#jEta').textContent = lastStep ? t('jEta', clock(stepEnd(lastStep))) : '';
  const box = $('#jNow');
  const btn = $('#jNext');
  const banner = $('#jBanner');

  if (J.done) {
    box.replaceChildren(el('p', 'j-done', t('jDone', J.to?.label || t('destination'))), el('p', 'muted', t('jDoneSub')));
    btn.textContent = t('jClose'); btn.onclick = endJourney;
    $('#jRecalc').hidden = true; banner.hidden = !J.note; banner.textContent = J.note;
    $('#jSteps').replaceChildren();
    return;
  }
  $('#jRecalc').hidden = false;
  const s = J.steps[J.idx];
  const last = J.idx === J.steps.length - 1;
  const parts = [];

  if (!s.transit) {
    const dest = endPlace(s, last);
    const dLeft = distTo(dest);
    const nt = nextTransit();
    parts.push(el('p', 'j-kind', t('jWalkTo', dest.name || '')));
    if (dLeft != null) parts.push(bigNum(fmtDist(dLeft)));
    else parts.push(bigNum(Math.max(1, Math.round((s.leg.duration || 60) / 60)), t('jYouMinutes')));
    parts.push(el('p', 'j-sub', dLeft != null ? t('jLeft', fmtDist(dLeft)) : t('jWalkMeta', Math.round((s.leg.duration || 0) / 60), fmtDist(s.leg.distance || 0))));
    if (nt) parts.push(el('p', 'j-sub', t('jCatch', lineName(nt.leg), clock(stepStart(nt)), minsUntil(stepStart(nt)))));
    btn.textContent = last ? t('jDestBtn') : t('jArrivedBtn');
  } else {
    const onBoard = J.boarded === J.idx || (!J.gps && now >= stepStart(s));
    const head = el('div', 'j-line');
    head.append(lineBadge(s.leg));
    if (onBoard) {
      const left = stopsLeft(s, now);
      const mins = minsUntil(stepEnd(s));
      head.append(el('span', null, t('jRide', modeLabel(s.leg.mode).toLowerCase())));
      parts.push(head);
      parts.push(bigNum(mins, t('jYouMinutes')));
      parts.push(el('p', 'j-sub strong', t('jGetOff', s.leg.to?.name || '', clock(stepEnd(s)))));
      const dOff = distTo(s.leg.to);
      // Only shout when it's actually time: close by location, or within ~2 minutes of arrival.
      const alert = (dOff != null && dOff < 120) ? t('jGetOffNow') : (mins <= 2 || (dOff != null && dOff < 500)) ? t('jGetOffNext') : null;
      parts.push(el('p', 'j-sub', t('jStopsLeft', left)));
      if (alert) parts.push(el('p', 'j-alert', alert));
      btn.textContent = t('jOffBtn');
    } else {
      const dep = stepStart(s);
      head.append(el('span', null, t('jTake', modeLabel(s.leg.mode).toLowerCase(), s.leg.headsign || '')));
      parts.push(el('p', 'j-kind', t('jWait', s.leg.from?.name || '')));
      parts.push(head);
      parts.push(bigNum(minsUntil(dep), t('jYouMinutes')));
      const live = s.leg._live || s.leg.realTime;
      const dp = el('p', 'j-sub', t('jDeparts', clock(dep), minsUntil(dep)));
      if (live) { const d = el('span', 'live-dot'); d.title = t('jLive'); dp.prepend(d); }
      parts.push(dp);
      btn.textContent = t('jBoardedBtn');
    }
  }
  box.replaceChildren(...parts);
  btn.onclick = () => {
    const cur = J.steps[J.idx];
    if (cur.transit && J.boarded !== J.idx && !(!J.gps && nowS() >= stepStart(cur))) { J.boarded = J.idx; save(); renderJourney(); return; }
    advance();
  };

  // Behind the timetable (no location): say so and offer to move on or recalculate.
  let msg = J.note;
  let offerSkip = false;
  if (!msg && !J.gps && now > stepEnd(s) + 120) { msg = t('jBehind', endPlace(s, last).name || ''); offerSkip = true; }
  banner.hidden = !msg;
  banner.replaceChildren();
  if (msg) {
    banner.append(el('span', null, msg));
    if (offerSkip) { const b = el('button', 'ghost', t('jSkip')); b.type = 'button'; b.onclick = advance; banner.append(' ', b); }
  }
  renderStepList();
}

function stopsLeft(s, now) {
  const stops = s.leg.intermediateStops || [];
  const total = stops.length + 1;
  if (J.pos && stops.length) {
    // Nearest intermediate stop tells us how far along we are.
    let best = -1, bd = 1e9;
    stops.forEach((st, i) => { const d = distTo(st); if (d != null && d < bd) { bd = d; best = i; } });
    if (best >= 0) return Math.max(0, stops.length - best - 1);
  }
  const a = stepStart(s), b = stepEnd(s);
  const frac = b > a ? Math.min(1, Math.max(0, (now - a) / (b - a))) : 1;
  return Math.max(0, Math.ceil(total * (1 - frac)) - 1);
}

function renderStepList() {
  const ol = $('#jSteps');
  const items = J.steps.map((s, i) => {
    if (i <= J.idx) return null; // the current step is shown above
    const last = i === J.steps.length - 1;
    const li = el('li', 'j-step' + (i === J.idx ? ' current' : ''));
    if (s.transit) {
      li.style.setProperty('--c', normColor(s.leg.routeColor) || 'var(--cobalt)');
      li.append(lineBadge(s.leg), el('span', null, ` ${s.leg.from?.name || ''} → ${s.leg.to?.name || ''}`), el('span', 'j-step-time', clock(stepStart(s))));
    } else {
      li.classList.add('walk');
      li.append(el('span', null, t('jStepWalk', endPlace(s, last).name || '', Math.max(1, Math.round((s.leg.duration || 0) / 60)))));
    }
    return li;
  }).filter(Boolean);
  ol.replaceChildren(...items);
  $('.j-next-title').hidden = !items.length;
}

/* ---------- Small map: route and your position ---------- */
async function ensureJMap() {
  try {
    await loadLeaflet();
    if (!J.map) {
      J.map = L.map('jMap', { zoomControl: false, attributionControl: true });
      J.map.attributionControl.setPrefix(false);
      L.tileLayer(MAP.TILES, { attribution: MAP.ATTRIBUTION, maxZoom: 19, className: 'osm-tiles' }).addTo(J.map);
      J.layer = L.layerGroup().addTo(J.map);
    }
    // The dialog may still be laying out: size the map once now and again shortly after.
    [50, 350].forEach(ms => setTimeout(() => { J.map.invalidateSize(); drawJRoute(); }, ms));
  } catch { $('#jMap').hidden = true; }
}

function drawJRoute() {
  if (!J.map || !J.active) return;
  J.map.invalidateSize();
  J.layer.clearLayers();
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim() || '#5B6680';
  const paper = css.getPropertyValue('--paper').trim() || '#FFFFFF';
  const focus = [];
  J.steps.forEach((s, i) => {
    const pts = legPath(s.leg);
    if (pts.length < 2) return;
    const past = i < J.idx;
    if (i === J.idx) pts.forEach(p => focus.push(p));
    if (!s.transit) {
      L.polyline(pts, { color: muted, weight: 4, dashArray: '2 8', opacity: past ? 0.3 : 0.9, interactive: false }).addTo(J.layer);
    } else {
      const c = normColor(s.leg.routeColor) || '#1F3A8A';
      L.polyline(pts, { color: paper, weight: 9, opacity: past ? 0.3 : 0.95, interactive: false }).addTo(J.layer);
      L.polyline(pts, { color: c, weight: 5.5, opacity: past ? 0.35 : 1, interactive: false }).addTo(J.layer);
    }
  });
  if (J.to) L.marker([J.to.lat, J.to.lon], { icon: pinIcon('to'), interactive: false }).addTo(J.layer);
  drawJMe(focus);
}

function drawJMe(focus) {
  if (!J.map) return;
  if (J.pos) {
    if (!J.me) J.me = L.circleMarker([J.pos.lat, J.pos.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }).bindTooltip(t('jHere'));
    J.me.setLatLng([J.pos.lat, J.pos.lon]).addTo(J.map);
  }
  if (focus) {
    const pts = [...focus]; if (J.pos) pts.push([J.pos.lat, J.pos.lon]);
    if (pts.length >= 2) J.map.fitBounds(pts, { padding: [24, 24], maxZoom: 17 });
    else if (pts.length === 1) J.map.setView(pts[0], 16);
  }
}

/* ---------- Wire up ---------- */
$('#jEnd').addEventListener('click', endJourney);
$('#jRecalc').addEventListener('click', () => recalc());
$('#jGps').addEventListener('change', ev => setGps(ev.target.checked));
$('#journey').addEventListener('cancel', ev => { ev.preventDefault(); }); // Esc / back doesn't lose the journey
document.addEventListener('visibilitychange', () => {
  if (!J.active || document.visibilityState !== 'visible') return;
  if (J.gps && !J.wake && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { J.wake = w; }).catch(() => {});
  checkProgress(); renderJourney();
});
$('#langBtn').addEventListener('click', () => setTimeout(() => { if (J.active) { renderJourney(); renderGpsStatus(); } }, 0));

// Pick up a journey that was in progress (e.g. after the app was closed).
window.addEventListener('DOMContentLoaded', () => {
  const s = store.get('px_journey', null);
  if (!s || !s.it?.legs?.length || !s.to) return;
  const endTs = isoS(s.it.endTime);
  if (nowS() > endTs + 3 * 3600) { store.set('px_journey', null); return; }
  startJourney(s.it, { idx: s.idx, boarded: s.boarded, to: s.to, gps: s.gps, done: s.done });
});
