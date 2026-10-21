/* Próximo — interactive map for the journey planner.
 * Leaflet (loaded only when the map is first opened) with CARTO map tiles based on OpenStreetMap.
 * Shows start and destination pins (draggable), lets you tap the map to pick either,
 * and draws the selected route: coloured lines for transit, dashed for walking.
 */
'use strict';

const MAP = {
  LEAFLET_JS: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  LEAFLET_CSS: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  TILES_LIGHT: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  TILES_DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  CENTER: [38.715, -9.14], ZOOM: 12,
};

const mapState = {
  open: store.get('px_map_open', false),
  map: null, tiles: null, routeLayer: null, pins: { from: null, to: null },
  drawnKey: null, loading: null,
};

/* ---------- Loading Leaflet on demand ---------- */
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (mapState.loading) return mapState.loading;
  mapState.loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAP.LEAFLET_CSS;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = MAP.LEAFLET_JS; js.async = true;
    js.onload = () => resolve(); js.onerror = () => { mapState.loading = null; reject(new Error('leaflet')); };
    document.head.append(js);
  });
  return mapState.loading;
}

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => !!darkQuery?.matches;

async function ensureMap() {
  if (mapState.map) return mapState.map;
  await loadLeaflet();
  const m = L.map('planMap', { zoomControl: true, attributionControl: true })
    .setView(MAP.CENTER, MAP.ZOOM);
  m.attributionControl.setPrefix(false);
  mapState.tiles = L.tileLayer(isDark() ? MAP.TILES_DARK : MAP.TILES_LIGHT, {
    attribution: MAP.ATTRIBUTION, subdomains: 'abcd', maxZoom: 19, detectRetina: true,
  }).addTo(m);
  mapState.routeLayer = L.layerGroup().addTo(m);
  m.on('click', onMapClick);
  mapState.map = m;
  darkQuery?.addEventListener?.('change', () => mapState.tiles.setUrl(isDark() ? MAP.TILES_DARK : MAP.TILES_LIGHT));
  return m;
}

/* ---------- Pins ---------- */
function pinIcon(which) {
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin ${which}"></span>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

function updatePins() {
  const m = mapState.map; if (!m) return;
  ['from', 'to'].forEach(which => {
    const p = plan[which];
    let pin = mapState.pins[which];
    if (!p) { if (pin) { m.removeLayer(pin); mapState.pins[which] = null; } return; }
    if (!pin) {
      pin = L.marker([p.lat, p.lon], { icon: pinIcon(which), draggable: true, keyboard: true, zIndexOffset: 1000,
        title: which === 'from' ? t('planFromPh') : t('planToPh') }).addTo(m);
      pin.on('dragend', () => { const ll = pin.getLatLng(); pickPoint(which, ll.lat, ll.lng); });
      mapState.pins[which] = pin;
    } else {
      pin.setLatLng([p.lat, p.lon]);
    }
  });
}

/* Tap the map: choose whether it is the start or the destination. */
function onMapClick(ev) {
  const { lat, lng } = ev.latlng;
  const box = document.createElement('div');
  box.className = 'map-pop';
  const mk = (label, which) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = which === 'to' ? 'primary' : 'ghost'; b.textContent = label;
    b.addEventListener('click', () => { mapState.map.closePopup(); pickPoint(which, lat, lng); });
    return b;
  };
  box.append(mk(t('mapFrom'), 'from'), mk(t('mapTo'), 'to'));
  L.popup({ closeButton: false, className: 'map-popup', offset: [0, -4] }).setLatLng(ev.latlng).setContent(box).openOn(mapState.map);
}

async function pickPoint(which, lat, lon) {
  let p = { label: t('mapPoint'), sub: '', lat, lon };
  // Show the pin straight away; name it once the address lookup returns.
  plan[which] = p; updatePins();
  try {
    const r = await nominatim('/reverse', { lat, lon, zoom: 18 });
    const named = r && !r.error ? toPlace(r) : null;
    if (named?.label) p = { ...named, lat, lon };
  } catch { /* keep "Point on the map" */ }
  setPlace(which, p);
}

/* ---------- Route drawing ---------- */
// Decodes an encoded polyline (Google format); the planner states its precision (usually 6).
function decodePolyline(str, precision = 6) {
  const factor = Math.pow(10, precision);
  let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (axis === 0) lat += d; else lon += d;
    }
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

function legPath(leg) {
  const g = leg.legGeometry;
  if (g && g.points) {
    try { const pts = decodePolyline(g.points, g.precision ?? 6); if (pts.length > 1) return pts; } catch { /* fall back */ }
  }
  const a = leg.from, b = leg.to;
  if (a?.lat != null && b?.lat != null) return [[a.lat, a.lon], [b.lat, b.lon]];
  return [];
}

function selectedItin() {
  const shown = plan.shown || [];
  if (!shown.length) return null;
  return (plan.selected && shown.find(x => itinKey(x.it) === plan.selected)) || shown[0];
}

function drawRoute(force = false) {
  const m = mapState.map; if (!m) return;
  const sel = selectedItin();
  const key = sel ? itinKey(sel.it) : `pins:${plan.from?.lat},${plan.from?.lon}|${plan.to?.lat},${plan.to?.lon}`;
  if (!force && key === mapState.drawnKey) return;
  mapState.drawnKey = key;
  mapState.routeLayer.clearLayers();
  const bounds = [];
  if (plan.from) bounds.push([plan.from.lat, plan.from.lon]);
  if (plan.to) bounds.push([plan.to.lat, plan.to.lon]);

  if (sel) {
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim() || '#5B6680';
    const paper = css.getPropertyValue('--paper').trim() || '#FFFFFF';
    sel.it.legs.forEach(leg => {
      const pts = legPath(leg);
      if (pts.length < 2) return;
      pts.forEach(p => bounds.push(p));
      if (!isTransit(leg)) {
        L.polyline(pts, { color: muted, weight: 4, opacity: 0.9, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(mapState.routeLayer);
        return;
      }
      const color = normColor(leg.routeColor) || '#1F3A8A';
      L.polyline(pts, { color: paper, weight: 9, opacity: 0.95, interactive: false }).addTo(mapState.routeLayer);
      const line = L.polyline(pts, { color, weight: 5.5, opacity: 1 }).addTo(mapState.routeLayer);
      line.bindTooltip(`${modeLabel(leg.mode)} ${lineName(leg)}${leg.headsign ? ', ' + leg.headsign : ''}`, { sticky: true });
      // Where you get on and off
      [[leg.from, leg.startTime], [leg.to, leg.endTime]].forEach(([pl, time]) => {
        if (pl?.lat == null) return;
        L.circleMarker([pl.lat, pl.lon], { radius: 6, color, weight: 3, fillColor: paper, fillOpacity: 1 })
          .bindTooltip(`${pl.name} ${clock(isoS(time))}`, { direction: 'top', offset: [0, -6] })
          .addTo(mapState.routeLayer);
      });
    });
  }
  updatePins();
  if (bounds.length >= 2) m.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  else if (bounds.length === 1) m.setView(bounds[0], 15);
}

/* ---------- Show / hide ---------- */
async function setMapOpen(open) {
  mapState.open = open;
  store.set('px_map_open', open);
  $('#planMapWrap').hidden = !open;
  $('#mapToggle').setAttribute('aria-expanded', String(open));
  $('#mapToggle').classList.toggle('on', open);
  if (!open) return;
  try {
    await ensureMap();
    mapState.map.invalidateSize();
    drawRoute(true);
  } catch {
    $('#planMap').replaceChildren(Object.assign(document.createElement('p'), { className: 'hint map-error', textContent: t('mapError') }));
  }
}

Object.assign(TEXT.pt, { mapError: 'Não foi possível carregar o mapa. Verifica a ligação.' });
Object.assign(TEXT.en, { mapError: 'Couldn’t load the map. Check your connection.' });

$('#mapToggle').addEventListener('click', () => setMapOpen(!mapState.open));
window.addEventListener('px:plan', () => { if (mapState.open && mapState.map) drawRoute(); });
window.addEventListener('px:showmap', async () => {
  if (!mapState.open) await setMapOpen(true);
  mapState.drawnKey = null;
  $('#planMapWrap').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
});
window.addEventListener('DOMContentLoaded', () => { if (mapState.open) setMapOpen(true); });
