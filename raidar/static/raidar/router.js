"use strict";

// Page objects <-> URLs. Every page URL is served the same static shell, so the frontend works out the
// page from the URL itself. The forms here match the page locations in docker/nginx.conf:
//
//   /                                     null (the default page)
//   /<name>[/<no>]                        {name, no}            e.g. /encounters/2, /info-help
//   /encounter/<url_id>                   {name: 'encounter', no: url_id}
//   /global_stats[/<era>][/area-<id>|/<kind>]
//                                         {name: 'global_stats', era_id, stats_page}
//
// It knows nothing about Ractive; the page calls navigate() and onPopState().
window.RaidarRouter = (function () {
  const baseMeta = document.querySelector('meta[name="raidar-base"]');
  const baseURL = baseMeta ? baseMeta.content : (window.baseURL || '/');
  const NAMED = /^(encounters|leaderboards|profile|uploads|account|register|login|index|reset_pw|thank-you|info-(?:help|releasenotes|contact|about|framework|api))(?:\/(\w+))?$/;
  const ENCOUNTER = /^encounter\/(\w+)$/;
  const GLOBAL_STATS = /^(?:api\/)?global_stats(?:\/([0-9]+))?(?:\/(?:area-)?([0-9]+|[A-Za-z ]+))?$/;
  const DEFAULT_STATS_PAGE = 'All raid bosses';

  // the page a URL path shows; null for the default page, undefined for a path that is not a page
  function pageFromURL(pathname) {
    let path = pathname;
    if (path.startsWith(baseURL)) path = path.substring(baseURL.length);
    try {
      path = decodeURIComponent(path);
    } catch (e) {
      return undefined;
    }
    if (path == '') return null;
    let match;
    if ((match = NAMED.exec(path))) {
      let page = { name: match[1] };
      if (match[2] !== undefined) page.no = /^[0-9]+$/.test(match[2]) ? Number(match[2]) : match[2];
      return page;
    }
    if ((match = ENCOUNTER.exec(path))) {
      return { name: 'encounter', no: match[1] };
    }
    if ((match = GLOBAL_STATS.exec(path))) {
      return { name: 'global_stats', era_id: match[1] || null, stats_page: match[2] || DEFAULT_STATS_PAGE };
    }
    return undefined;
  }

  function urlFromPage(page) {
    let url = baseURL + page.name;
    if (page.no) url += '/' + page.no;
    if (page.era_id) url += '/' + page.era_id;
    if (page.stats_page) {
      if (Number(page.stats_page) > 0) {
        url += '/area-' + page.stats_page;
      } else {
        url += '/' + page.stats_page;
      }
    }
    return url;
  }

  // records page as the current history entry
  function navigate(page) {
    history.pushState(page, null, urlFromPage(page));
  }

  // handler(page) when the user goes back or forward
  function onPopState(handler) {
    window.addEventListener('popstate', evt => handler(evt.state));
  }

  return { pageFromURL, urlFromPage, navigate, onPopState };
})();
