"use strict";

// The frontend's only way to the backend: one function per JSON endpoint (see docs/frontend-api.md).
//
// It knows the backend's URLs, the CSRF header and how failures are reported, and nothing about Ractive
// or the page, so a different frontend could use it as it is. Each function returns the jQuery request,
// which is a thenable: `.then(data => ...)`, `.done(...)`, `.fail(xhr => ...)`.
//
// A failed request is reported through RaidarAPI.onError(message, xhr), except for the statuses a function
// expects (encounter/<id>.json and global_stats.json answer 404 for what does not exist), which are left to
// the caller. The page sets onError to show the message.
window.RaidarAPI = (function () {
  const baseMeta = document.querySelector('meta[name="raidar-base"]');
  const baseURL = baseMeta ? baseMeta.content : (window.baseURL || '/');

  const api = {
    onError: (message, xhr) => console.error(message, xhr),
  };

  // Django keeps the CSRF token in this cookie (initial.json makes sure it is set), and replaces it on login
  function csrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function csrfSafeMethod(method) {
    return /^(GET|HEAD|OPTIONS|TRACE)$/.test(method);
  }

  // options.expect: HTTP statuses the caller handles itself; options.ajax: more jQuery.ajax settings
  function request(method, path, data, options) {
    options = options || {};
    const settings = Object.assign({
      type: method,
      url: baseURL + path,
      data: data,
      headers: {},
    }, options.ajax);
    if (!csrfSafeMethod(method)) {
      const token = csrfToken();
      if (token) settings.headers['X-CSRFToken'] = token;
    }
    const xhr = $.ajax(settings);
    xhr.fail(failed => {
      if ((options.expect || []).indexOf(failed.status) == -1) {
        api.onError('Error communicating to server', failed);
      }
    });
    return xhr;
  }
  const get = (path, data, options) => request('GET', path, data, options);
  const post = (path, data, options) => request('POST', path, data, options);

  Object.assign(api, {
    // Reference data, the same for every user: areas, bosses, buffs, specialisations, backend URLs, and the
    // backend's version (poll.json reports a new one after a deploy). Revalidated on every load (ETag).
    bootstrap: () => get('bootstrap.json'),
    // The signed-in user (or the anonymous one); also sets the CSRF cookie
    initial: () => get('initial.json'),

    // Pages' data
    encounters: () => get('encounters.json'),
    encounter: urlId => get('encounter/' + encodeURIComponent(urlId) + '.json', null, { expect: [404] }),
    replay: urlId => get('replay/' + encodeURIComponent(urlId) + '.json'),
    leaderboards: (kind, era) => get('leaderboards.json', { kind: kind, era: era }),
    profile: eraId => get('profile' + (eraId ? '/' + eraId : '') + '.json'),
    globalStats: (eraId, statsPage) => {
      let path = 'global_stats';
      if (eraId) path += '/' + eraId;
      if (statsPage) path += (Number(statsPage) > 0 ? '/area-' : '/') + encodeURIComponent(statsPage);
      return get(path + '.json', null, { expect: [404] });
    },
    profileGraph: query => post('profile_graph.json', query),

    // Authentication
    login: (username, password) => post('login.json', { username: username, password: password }),
    register: fields => post('register.json', fields),
    resetPassword: email => post('reset_pw.json', { email: email }),
    logout: () => post('logout.json'),

    // Account
    changePassword: fields => post('change_password.json', fields),
    changeEmail: email => post('change_email.json', { email: email }),
    addAPIKey: apiKey => post('add_api_key.json', { api_key: apiKey }),
    removeAPIKey: accountName => post('remove_api_key.json', { account_name: accountName }),
    setPrivacy: privacy => post('privacy.json', { privacy: privacy }),
    contact: fields => post('contact.json', fields),

    // Encounters
    setTagsAndCategory: (id, tags, category) => post('set_tags_cat.json', { id: id, tags: tags, category: category }),
    // form: FormData with `file` (and `category`, `tags`); onProgress gets the upload's progress events
    upload: (form, onProgress) => post('upload.json', form, {
      ajax: {
        contentType: false,
        processData: false,
        xhr: () => {
          const xhr = $.ajaxSettings.xhr();
          if (onProgress) xhr.upload.addEventListener('progress', onProgress, false);
          return xhr;
        },
      },
    }),
    // notifications since lastId (uploads processed), and the server's version
    poll: lastId => post('poll.json', lastId ? { last_id: lastId } : undefined),
  });

  return api;
})();
