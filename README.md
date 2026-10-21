# Próximo

Journey planner for Lisbon public transport, plus live "leave now" countdowns for the trips you make often.
An installable web app (PWA): one codebase for Android and PC, no build step.

## What it does

**Para onde vais? (journey planner)**
- Enter a start and destination (street or place, or your current location) and leave now, leave at, or arrive by a time.
- Shows the best route first (earliest arrival, then fewest changes), then other options, with when to leave,
  total time, changes and each step: walk, bus, metro, boat or train, with stops and times.
- Covers every operator in the Lisbon area (Carris Metropolitana, Carris, Metro, CP, Fertagus,
  Transtejo/Soflusa, MTS, Barreiro buses). Routes use timetables; Carris Metropolitana buses in a route
  are checked against their live data (late/early), and CP trains have live data from the planner itself.
- Any route can be saved as a trip.
- Interactive map (button *Mapa*): start and destination pins you can drag, tap anywhere to
  choose *Partir daqui* / *Ir para aqui*, and the selected route drawn per leg (coloured lines for
  transit, dashed for walking, dots where you get on and off). *Ver no mapa* on any option shows it.

**As tuas viagens (saved trips)**
- Works for stops and stations of every operator: Carris Metropolitana, Carris, Metro, CP, Fertagus,
  Transtejo/Soflusa, MTS and the Barreiro buses. Nearby stops are listed with their operator.
- Carris Metropolitana stops use Carris' live data; other stops use timetables from Transitous,
  live where the operator shares it (CP trains for now). They refresh once a minute.

- Save trips in three steps: where you leave from (a street, or your current location),
  the stop (the closest ones to that street are listed first), and the lines you care about.
- The walking time is worked out from a walking route between the street and the stop;
  you can adjust it. Starting points you've used are offered again next time.
- Each trip shows the next departures (live where the bus is tracked, otherwise the timetable)
  and how long until you need to leave home.
- Departures you can no longer catch (closer than your walk time) are greyed out.
- Active service alerts on your lines show on the trip and as a banner.
- Refreshes every 30 s while open; the header shows when data last updated and turns red if it goes stale.
- Portuguese / English, light / dark mode. Trips are saved on the device.

## Put it online (GitHub Pages)

1. Create a new repository on GitHub, e.g. `proximo`.
2. Upload everything in this folder (keep the `icons/` folder; `supabase/` is optional).
3. Repository **Settings → Pages → Source: Deploy from a branch → main / root → Save**.
4. After a minute it's live at `https://<your-user>.github.io/proximo/`.

## Install it

- **Android (Chrome):** open the link → menu ⋮ → *Add to home screen / Install app*.
- **PC (Chrome or Edge):** open the link → install icon at the right of the address bar.

## If departures don't load (CORS)

The app calls the official Carris Metropolitana API directly from the browser. If the browser
blocks that, use the included proxy:

1. In your Supabase project: `supabase functions deploy cm-proxy --no-verify-jwt`
   (code in `supabase/functions/cm-proxy/index.ts`).
2. In `app.js`, set `CONFIG.PROXY` to `https://<your-project>.supabase.co/functions/v1/cm-proxy`.

The app tries the direct call first and only uses the proxy if that fails.

## Updating the app

After changing files, bump `VERSION` in `sw.js` (e.g. `proximo-v2`) so installed copies pick up the change.

## Data and services used

Carris Metropolitana open data API: <https://github.com/carrismetropolitana/api>
Endpoints used: `/stops`, `/lines`, `/locations/localities`, `/locations/municipalities`,
`/arrivals/by_stop/:id`, `/alerts`. The stop list is cached on the device for a day.

Journey planning: [Transitous](https://transitous.org) (`/api/v5/plan`), a free community service for
open-source, non-commercial apps; data sources: <https://transitous.org/sources/>. The app credits it on screen
and only calls it when you press *Ver percursos* (plus at most every 5 minutes while results are open).

Street search: OpenStreetMap Nominatim (searches only when you press Search, max one request
per second, as their usage policy asks). Walking routes: OpenStreetMap routing (FOSSGIS, foot profile).
If the route can't be calculated, the app estimates from the straight-line distance instead.
Both are only used while choosing places, not while the app refreshes departures.

Map: [Leaflet](https://leafletjs.com) (loaded only when the map is opened) with
[CARTO](https://carto.com/attributions) map tiles based on OpenStreetMap; credits are shown on the map.

## Licence

MIT, see `LICENSE`.
