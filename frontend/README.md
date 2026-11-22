# The frontend

The Ractive frontend: one static page shell and its assets, talking to the backend only through the JSON API
in [`docs/frontend-api.md`](../docs/frontend-api.md). Nothing here is Django's, and Django does not build or
serve it.

```
src/index.html        the page shell; the whole app is the Ractive template in it
src/partials/*.html   pieces of that template (encounter.html, navbar.html, …)
assets/               scripts, stylesheets and images, served under /assets/
  api.js              the backend's API (window.RaidarAPI): the only code that talks to it
  router.js           page objects <-> URLs (window.RaidarRouter); matches docker/nginx.conf
  script.js           the app (Ractive)
  replay.js           the combat replay viewer
scss/                 the stylesheet's source (see Styles)
build.py              builds dist/
test_build.py         its tests
build_css.py          compiles scss/ to assets/css/raidar.css (needs libsass)
```

## Building

```
python frontend/build.py                       # writes frontend/dist/ (gitignored)
python -m unittest frontend/test_build.py
```

The build needs only Python's standard library. It:

- inlines `<!--# include name.html -->` with `src/partials/name.html` (partials can include others);
- removes `{# … #}` source comments (one line each);
- copies `assets/` to `dist/assets/`, and adds a copy with a content hash in its name for each asset the shell
  names (`/assets/script.js` becomes `/assets/script.0123456789ab.js`).

URLs that the templates complete at runtime (`/assets/img/48px/[[spec]]_tango_icon_48px.png`) and images that
stylesheets name by relative URL stay unhashed.

## Styles

The stylesheet, `assets/css/raidar.css`, is compiled from `scss/raidar.scss` by `python frontend/build_css.py`
(needs `pip install libsass`; `--check` tells whether `raidar.css` is up to date). The compiled file is
committed, so `build.py` doesn't need Sass. Change the SCSS, never `raidar.css` itself.

- `scss/raidar/`: the site's own settings and styles, including the percentile colour schemes
  (`.percentile-default`, `-rainbow`, `-colorblind`, chosen on the Account page);
- `scss/uikit/`: [UIkit](https://getuikit.com/docs/sass)'s SCSS (3.0.0-beta.32), vendored. Some of its files
  carry the site's own edits (`components/base.scss`, `button.scss`, `text.scss`, `visibility.scss`,
  `components/_import.scss` and the theme), so carry those over before replacing it with a newer UIkit.

The compile is plain Sass, without autoprefixer: the vendor prefixes current browsers still need are written in
the SCSS. The design reference is the [GW2 Raidar style guide](https://www.figma.com/file/I8c0kbP29g2phZ9n3JsOhfnp/GW2-Raidar) (Figma).

## Serving

In Docker Compose, the `frontend` service (the Dockerfile's `frontend` target, [`docker/nginx.conf`](../docker/nginx.conf))
serves `dist/`: the shell for every page URL, with `Cache-Control: no-cache`, and `/assets/`. It passes every
other URL to Django. When you add a page, add it to the page URLs in both `docker/nginx.conf` and `router.js`.

The API names two folders of images here by URL: `assets/img/buff/` (boon icons) and `assets/img/replay/` (the
replay maps, listed in `eiparser/replay_maps.json`). Keep them where they are.
