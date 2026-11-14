# Próximo

Strikes and disruptions on Lisbon public transport, today and the next 7 days.
An installable web app (PWA) for phone and PC, no build step.

The journey planner, saved trips, journey mode and map were removed in November 2026.
That version is kept on the `travel-version` branch.

## What it shows

- At the top, the one thing to know now: a strike happening today, or that everything is running.
- The next announced strike underneath.
- A card per strike or disruption, grouped by day: operator, when, whether there's no service
  or only some service is affected, minimum services, a link to the news and the operator's website.
- When the list was last checked, and a warning if it hasn't been updated for over 36 hours.
- Works offline with the last list it loaded. Portuguese / English, light / dark mode.

Operators: Metro de Lisboa, Metro Sul do Tejo, Transtejo/Soflusa, CP, Fertagus, Carris Metropolitana,
Carris and TCB Barreiro.

## Put it online (GitHub Pages)

Repository **Settings → Pages → Source: Deploy from a branch → main / root**. It's served at
`https://<your-user>.github.io/proximo/`. Install it from Chrome (menu → *Install app*) on Android or PC.

## Updating the app

After changing files, bump `VERSION` in `sw.js` and the `?v=` number on `styles.css` / `app.js` in
`index.html` (and in `sw.js`'s list), so installed copies always load matching files.

## Automatic updates (GitHub Action)

`.github/workflows/strikes.yml` runs every morning (05:50 UTC) and on demand (*Actions → Update strike list →
Run workflow*). It runs Claude Code with your Claude Pro subscription to check the news and rewrite
`disruptions.json`, then validates the file and commits it. If the check fails, the step
*Show why the check failed* prints the reason. One-time setup:

1. On your PC, install Claude Code and run `claude setup-token`; sign in with your Claude account and copy the token.
2. In this repo: *Settings → Secrets and variables → Actions → New repository secret*, name it
   `CLAUDE_CODE_OAUTH_TOKEN` and paste the token. If the token is ever revoked, create a new one and update the secret.

### disruptions.json format

```json
{ "updated": "ISO time", "items": [ {
  "operator": "metro | mts | boat | cp | fertagus | cm | carris | tcb",
  "kind": "strike | disruption", "scope": "full | partial",
  "title": "short Portuguese title", "start": "ISO time", "end": "ISO time",
  "minimum": "minimum services, or empty", "source": "news URL" } ] }
```

## Licence

MIT, see `LICENSE`.
