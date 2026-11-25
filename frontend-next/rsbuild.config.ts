import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// The Django backend the dev server proxies to (`python manage.py runserver` by default).
const backend = process.env.RAIDAR_BACKEND ?? 'http://127.0.0.1:8000';

// The backend's URLs, which the dev server sends on to Django (as docker/nginx-next.conf does in production):
// the JSON API (every *.json), downloads, EI reports, the admin and its /static/ files, Django's password-reset
// pages, robots.txt and the public API. Page URLs (including /api/global_stats…, which is a page) are left to
// the history fallback, which serves index.html.
const BACKEND_PREFIX = /^\/(download|report|admin|static|reset|api)(\/|$)/;
const STATS_PAGE = /^\/(api\/)?global_stats(\/|$)/;

function isBackendPath(pathname: string): boolean {
  if (pathname.endsWith('.json')) return true;
  if (pathname === '/robots.txt') return true;
  if (STATS_PAGE.test(pathname)) return false;
  return BACKEND_PREFIX.test(pathname);
}

export default defineConfig({
  plugins: [pluginReact()],

  source: {
    entry: { index: './src/main.tsx' },
  },

  html: {
    template: './index.html',
    title: 'GW2 Raidar',
  },

  output: {
    // Everything the build makes goes under /app/: Rsbuild's default (static/) would shadow Django's /static/
    // (the admin's files). The images in public/assets/img are copied as they are, to /assets/img/, where the
    // backend's URLs point (raidar/assets.py).
    distPath: {
      root: 'dist',
      js: 'app/js',
      jsAsync: 'app/js/async',
      css: 'app/css',
      cssAsync: 'app/css/async',
      svg: 'app/svg',
      font: 'app/font',
      image: 'app/image',
      media: 'app/media',
      assets: 'app/assets',
      wasm: 'app/wasm',
    },
    cleanDistPath: true,
    // the styles use color-mix(), relative colours (hsl(from …)), :has() and subgrid; native CSS nesting and
    // newer syntax are lowered for these by Lightning CSS
    overrideBrowserslist: ['chrome >= 119', 'edge >= 119', 'firefox >= 128', 'safari >= 16.4'],
  },

  server: {
    port: 3000,
    historyApiFallback: true,
    proxy: [
      {
        target: backend,
        // keep the browser's Host, so Django sees the same origin the page has (session and CSRF cookies)
        changeOrigin: false,
        pathFilter: (pathname: string) => isBackendPath(pathname),
      },
    ],
  },
});
