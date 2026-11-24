# frontend-next

The next GW2 Raidar frontend: React and TypeScript, built with [Rsbuild](https://rsbuild.rs). It runs alongside
the current frontend (`../frontend`, Ractive), which stays as it is, and talks to the same Django backend through
the same JSON API ([docs/frontend-api.md](../docs/frontend-api.md)). It shares no files with `../frontend`: the
images are a copy, and nothing here imports from there.

## Status

Ported, with the current site's look:

- the page around every page: header, navigation, footer
- log in, register, reset password, log out
- **Encounters**: the list, with its filters, sorting and pages
- **Encounter**: header (with category and tags), Overview, the Buffs tabs, Boss Metrics, the phase menu, and the
  Replay tab

Not yet ported (their URLs exist and show a placeholder): Global Stats, Leaderboards, Personal Stats, Upload,
Account and the info pages. Polling for processed uploads and for a new server version is not here yet either.

## Working on it

Node 24 (`.nvmrc`), npm.

```sh
npm ci
npm run dev        # http://localhost:3000, with the backend's URLs proxied to Django
npm run build      # type-checks, then builds into dist/
npm run preview    # serves dist/
npm run typecheck
```

The dev server sends the backend's URLs to Django at `http://127.0.0.1:8000` (`python manage.py runserver`), or
wherever `RAIDAR_BACKEND` points, e.g. `RAIDAR_BACKEND=http://localhost:8080 npm run dev` for a Docker stack. These
are every `*.json`, `/download/`, `/report/`, `/admin/`, `/static/`, `/reset/`, `/api/` (except the
`/api/global_stats…` page) and `/robots.txt` ([rsbuild.config.ts](rsbuild.config.ts)). The browser's `Host` is
kept, so the session and CSRF cookies work as on the real site.

## Layout

```
index.html            the page shell (the same for every URL and user; nothing in it depends on the request)
public/assets/img/    the site's images, served at /assets/img/ (the backend's image URLs point there)
src/
  main.tsx            providers: toasts, React Query, tooltips, the session; then the router
  routes.tsx          the pages and their URLs (the same as the current frontend's)
  api/                the only code that talks to the backend: client.ts (fetch, CSRF, errors),
                      endpoints.ts (one function per endpoint), queries.ts (React Query hooks), types.ts
  session/            bootstrap.json and initial.json, loaded before anything renders; logging in and out
  layout/             header, navigation, footer
  pages/              the pages; pages/encounter/ is the encounter page and its tabs
  ui/                 small building blocks: buttons, badges, dropdowns, tooltips, toasts, the loader
  lib/                formatting, percentiles and their colours, the phase menu, settings, UI state
  styles/             tokens.css (the design tokens), base.css, utilities.css
```

The built app goes under `dist/app/` (not Rsbuild's default `static/`, which is Django's admin files), the
images under `dist/assets/img/`, and the shell is `dist/index.html`.

## Code style

- Import React as a namespace: `import * as React from 'react'`, then `React.useState`, `React.ReactNode`, …
- Every component's props have a declared interface (`XProps`) next to the component, not an inline type:

  ```tsx
  export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
  }

  export function Badge({ tone = 'primary', ...props }: BadgeProps) { … }
  ```

## Styles

Plain CSS with CSS Modules (`*.module.css` next to each component), native nesting, and `@layer` for the global
files. There is no Sass and no UIkit. The current site's Sass variables are custom properties in
[src/styles/tokens.css](src/styles/tokens.css), with the values its compiled CSS has. The UIkit patterns the pages
use (buttons, badges, cards, tabs, tables, tooltips, dropdowns) are rebuilt in the components' own styles.

The percentile colours (the Default, Rainbow and Colourblind palettes) are worked out in
[src/lib/percentiles.ts](src/lib/percentiles.ts) as `color-mix()` and relative colours over the palette's anchor
colours in the tokens. An element gets the `pctl` class and that style through `usePercentile()`. The build
targets browsers that support those features (`output.overrideBrowserslist` in `rsbuild.config.ts`).

Settings are kept in `localStorage` under `settings`, with the same shape the current frontend uses.

## The replay

The Replay tab wraps the current frontend's replay viewer, copied unchanged into
`src/pages/encounter/Replay/vendor/replay.js`. The viewer draws on a canvas and builds its own controls, so its
styles (`replay.css`) are global, not a CSS module.

**Follow-up:** rewrite the viewer as a React component. Everything it needs is in `src/pages/encounter/Replay/`.
`<Replay>`'s props are the interface to keep, so the rewrite replaces that folder and nothing else changes
(see `TODO(replay-rewrite)`).

## Deploying

The Dockerfile's `frontend-next` target builds this app and serves it with nginx
([docker/nginx-next.conf](../docker/nginx-next.conf)), which passes everything else to the `web` service. CI
publishes it as `ghcr.io/abraxas-krown/gw2raidar-frontend-next`. Locally, `docker compose --profile next up
--build` runs it next to the current frontend at http://localhost:8081. See [DEPLOY.md](../DEPLOY.md).

Adding a page with a new URL means adding it to `src/routes.tsx` and to the page locations in
`docker/nginx-next.conf`.
