# Próximo

Live departures for your Carris Metropolitana stops, with a "leave now" countdown.
An installable web app (PWA): one codebase for Android and PC, no build step.

## What it does

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

Street search: OpenStreetMap Nominatim (searches only when you press Search, max one request
per second, as their usage policy asks). Walking routes: OpenStreetMap routing (FOSSGIS, foot profile).
If the route can't be calculated, the app estimates from the straight-line distance instead.
Both are only used while setting up a trip, not while the app refreshes departures.
