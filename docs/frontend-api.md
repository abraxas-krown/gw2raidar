# Frontend ↔ backend contract

The frontend is a **static page shell** plus the **JSON API** below. They share nothing else: no
server-rendered data in the HTML, no Django template logic at runtime. Any frontend (the current Ractive
one, or a replacement) only needs what is on this page.

- Backend routes (Django): [`raidar/urls_api.py`](../raidar/urls_api.py). Page URLs and static files (nginx): [`docker/nginx.conf`](../docker/nginx.conf).
- The Ractive frontend calls the API only through [`raidar/static/raidar/api.js`](../raidar/static/raidar/api.js)
  (`window.RaidarAPI`). It maps URLs to pages only through [`router.js`](../raidar/static/raidar/router.js) (`window.RaidarRouter`).
- [`raidar/tests.py`](../raidar/tests.py) checks the parts of this contract that the frontend depends on.

## The page shell

Every page URL returns the same HTML, byte for byte, for every user. The response sends `Cache-Control: no-cache`.
[`raidar/frontend.py`](../raidar/frontend.py) builds it once with `python manage.py build_frontend` (after
`collectstatic`). The web server serves it, not Django: in Compose, that's the `frontend` nginx, which also
serves `/static/` and passes everything else to Django.

| Page URL | Page |
| --- | --- |
| `/` | the default page (Help for guests, Release notes for users) |
| `/<name>[/<no>]` | `encounters`, `leaderboards`, `profile`, `uploads`, `account`, `register`, `login`, `index`, `reset_pw`, `thank-you`, `info-help`, `info-releasenotes`, `info-contact`, `info-about`, `info-framework`, `info-api` |
| `/encounter/<url_id>` | one encounter |
| `/global_stats[/<era_id>][/area-<area_id> \| /<kind name>]` | global stats (also under `/api/global_stats…`) |

Page URLs never touch the database. If the thing a page shows doesn't exist, its JSON says so: for example,
`encounter/<url_id>.json` answers 404, and the frontend shows "Encounter not found".

The shell gives the frontend two values in `<head>`:

- `<meta name="raidar-base" content="/">` is the site root that every URL below is relative to. A site served
  under a prefix builds with `FORCE_SCRIPT_NAME`.
- `<meta name="raidar-version" content="3.1.0">` is the build. Send it as `bootstrap.json?v=` so a deploy gets a
  fresh copy, and compare it with `poll.json`'s `version` to notice an upgrade.

## Conventions

- **Auth** uses Django's session cookie, on the same origin. The frontend never sees a password hash or token.
- **CSRF**: `initial.json` sets the `csrftoken` cookie. Send it back as the `X-CSRFToken` header on every POST.
  Login replaces the cookie, so read it at the time of each request. Without the header, a POST answers 403.
- **POST bodies** are form-encoded (`application/x-www-form-urlencoded`). `upload.json` uses `multipart/form-data`.
- **Errors**: most endpoints answer **200** with `{"error": "<message for the user>"}`. Exceptions:
  - 404 for an unknown encounter or era;
  - 401 from `encounters.json` when signed out;
  - 403 for a missing CSRF token;
  - 405 for the wrong method.

  Endpoints marked *login* redirect (302) to `/` when signed out, so check `username` from `initial.json` before calling them.

## Endpoints

### Session

| Endpoint | Method | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `bootstrap.json?v=<version>` | GET | – | | Reference data, the same for everyone; cached for 1 hour. Keys: `archetypes`, `areas` (`{id: {name, mode, tag, icon, kind, enrage}}`), `boss_locations`, `specialisations`, `categories`, `buffs` (`{code: {name, icon, stacks?}}`), `buff_tabs`, `version` (`{id, timestamp}`), `debug`, `urls` (`{admin, download, report, api_upload, api_categories}`: backend URLs the frontend links to) |
| `initial.json` | GET | – | | The current user: `{username, email, is_staff, accounts: [{name, api_key (masked)}]}`, plus `privacy` and `last_notification_id` when signed in (`username` is `""` for guests). Sets the CSRF cookie. Also the Docker healthcheck. |
| `login.json` | POST | – | `username`, `password` | As `initial.json`, plus `csrftoken`, or `{error}` |
| `register.json` | POST | – | `username`, `password`, `api_key`, `invite_code` | As `login.json`, or `{error}` |
| `reset_pw.json` | POST | – | `email` | `{}`; the email links to Django's own `reset/<uidb64>/<token>/` page |
| `logout.json` | POST | login | | `{}` |

### Pages' data

| Endpoint | Method | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `encounters.json` | GET | 401 if not | | `{encounters: [...]}`: the user's encounter list |
| `encounter/<url_id>.json` | GET | – | | `{encounter: {..., has_report, has_replay, evtc_url?, downloadable?}}`, with names hidden according to the players' privacy settings; **404** `{error}` if there is no such encounter |
| `replay/<url_id>.json` | GET | – | | The combat replay (see `raidar/static/raidar/replay.js`); 404 if there is none |
| `leaderboards.json?kind=&era=` | GET | – | `kind` (boss location index), `era` (id; empty for the latest) | `{leaderboards: {...}}` |
| `profile[/<era_id>].json` | GET | `{error}` if not | | `{profile: {...}}`: personal stats for an era (the latest by default) |
| `profile_graph.json` | POST | login | `era`, `area`, `archetype`, `profession`, `elite`, `stat` | `{globals, data, times}` |
| `global_stats[/<era_id>][/area-<id> \| /<kind>].json` | GET | – | | `{global_stats: {eras, areas, stats}}`; **404** `{error}` for an unknown era |

### Account

| Endpoint | Method | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `change_password.json` | POST | login | `old_password`, `new_password1`, `new_password2` | `{}` or `{error}` |
| `change_email.json` | POST | login | `email` (empty removes it) | `{email}` or `{error}` |
| `add_api_key.json` | POST | login | `api_key` | `{account_name}` or `{error}` |
| `remove_api_key.json` | POST | login | `account_name` | `{account_name}` or `{error}` |
| `privacy.json` | POST | login | `privacy` (`1` private, `2` squad, `3` public) | `{}` |
| `contact.json` | POST | – | `subject`, `body`, and `name` and `email` when signed out | `{}` or `{error}` |

### Uploads and notifications

| Endpoint | Method | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `upload.json` | POST multipart | login | `file`, optional `category`, `tags` | `{filename, upload_id}` or `{error}`; the result arrives later through `poll.json` |
| `set_tags_cat.json` | POST | login | `id`, `tags` (comma-separated), `category` | `{}` or `{error}` |
| `poll.json` | POST | login | optional `last_id` | `{notifications: [...], version, last_id}`: each notification has `type` `upload` or `upload_error`; `last_id` is there only when there are notifications |

### Links (not JSON)

`download/<url_id>` (the log file), `report/<url_id>` (the Elite Insights report), `admin/`. The frontend
takes their prefixes from `bootstrap.json`'s `urls`.

## Not part of this contract

- The public upload API for tools, `api/upload.json`, `api/categories.json` and `api/v2/*`, is documented on
  the site's API page and in `api/v2/swagger`.
- The password-reset pages (`reset/…`) and the admin are rendered by Django.
