# Versions

GW2 Raidar runs on Python 3.13, Django 5.2 (LTS) and PostgreSQL 14 or newer (the Compose file uses 17).

`requirements.txt` holds the exact versions of all Python packages and is generated; the packages the
project asks for are listed in `requirements.in`. To move everything to the newest releases:

```
uv pip compile requirements.in --upgrade --python-version 3.13 --python-platform linux -o requirements.txt
```

(`pip-compile --upgrade requirements.in` from pip-tools does the same.) Check the result for known
vulnerabilities with `pip-audit -r requirements.txt`.

## Upgrading Elite Insights

The Elite Insights CLI comes from its own image, `ghcr.io/abraxas-krown/gw2ei:<tag>`, which the `Dockerfile`
copies into the app image. It is built from source in our fork,
[abraxas-krown/GW2-Elite-Insights-Parser](https://github.com/abraxas-krown/GW2-Elite-Insights-Parser)
(`docker/cli/Dockerfile` there), by its "Docker CLI image" workflow:

| Pushed to the fork        | Image tags                             |
|---------------------------|----------------------------------------|
| `master`                  | `latest`, `master`, `sha-<commit>`     |
| git tag `v3.33.0.0-krown.1` | `v3.33.0.0-krown.1`, `sha-<commit>`  |

Pin a git tag's image. A git tag's image is never replaced (the workflow refuses), so it always means the same
build; `latest` and `master` move with every push to the fork, so the site would change without a commit here.
To release a new EI build: tag the fork's commit (`git tag v3.33.0.0-krown.1 && git push origin
v3.33.0.0-krown.1`), wait for its "Docker CLI image" run, then move the pin.

Which tag the app uses is `GW2EI_TAG`:

- pinned in the `Dockerfile` (`ARG GW2EI_TAG=...`), so it changes with the code and is reviewed with it;
- overridden for every GitHub build by the repository variable `GW2EI_TAG`, when set (Settings → Secrets and
  variables → Actions → Variables). That applies to all branches at once, so use it for trying a build, and
  move the pin in the `Dockerfile` once it is settled;
- overridden locally by `GW2EI_TAG` in the shell or `.env` (`docker-compose.override.yml` passes it on).

The site depends on EI's encounter IDs and its JSON output, so compare the new version's source with the old
one before moving the pin:

1. **New bosses.** Encounters EI added or renumbered (their `LogID`s, under `LogLogic/`) need an entry in
   `analyser/bosses.py`, or their logs are rejected as unsupported.
2. **New or changed maps.** Replays use the site's own map of each boss: the images in
   `frontend/assets/img/replay/`, listed in `eiparser/replay_maps.json`. Both are taken from EI: the image
   (`ParserHelpers/Images/LogImages.cs`, the `CombatReplay...` constants) and the world rectangle and size of
   the boss's `CombatReplayMap` (in its `GetCombatMapInternal`).
   Add maps for new bosses, and update the image, `world` and `size` of any boss whose map changed. While a
   map does not match EI's, that boss's encounters are stored without a replay (with a warning in the log).
3. Run the tests (`python -m unittest discover -s eiparser/tests -t .`) and parse a few real logs.

# Docker Compose deploy

`docker-compose.yml` runs the database, the site's front (`frontend`, nginx), Django (`web`) and the upload
processor (`worker`). It needs `SECRET_KEY`, `ALLOWED_HOSTS` and `POSTGRES_PASSWORD` in the environment, and
optionally `IMAGE_TAG` (see "Images" below). The server does not build anything: it pulls the images that
GitHub Actions built.

**Point the domain (Traefik/Dokploy) at `frontend`, port 80.** It serves the frontend (the page shell and
`/assets/`) and passes everything else to `web` (`docker/nginx.conf`). `web` (gunicorn, port 8000) answers only
the JSON API, downloads, the admin (with its `/static/` files) and Django's own pages, and is not meant to be
reached directly: it has no page URLs. `frontend` and `web`/`worker` are two targets of the same Dockerfile but
share nothing: the `frontend` image is built from `frontend/` alone, so either side can be deployed on its own.

Files are kept on two volumes:

- `uploads` (`/data/uploads`, `UPLOAD_DIR`): uploads waiting to be processed, and the stored logs under
  `encounters/<uploader>/`.
- `reports` (`/data/reports`, `REPORT_DIR`): one folder per encounter, `<encounter url id>/`, holding the
  Elite Insights HTML report (`ei.html.gz`, about 2–3 MB) and the encounter's replay (`replay.json.gz`, about
  100–200 KB; see `eiparser/replay.py`). Neither is ever pruned, so back this volume up along with the database.

`MIN_FREE_DISK_GB` (default 10) controls log pruning: `restat` deletes the oldest uploaded `.evtc` files
while the upload volume has less than that many GB free. The parsed encounters and their Elite Insights
reports stay, as they are on their own volume; only the encounter's download goes. `0` keeps every log.

## Images

`.github/workflows/docker.yml` builds the Dockerfile's two targets and publishes them to the GitHub Container
Registry as `ghcr.io/abraxas-krown/gw2raidar-app` (`web` and `worker`) and
`ghcr.io/abraxas-krown/gw2raidar-frontend`. It runs on every push to `develop` and `feature/**`, on release
tags (`v*`), and by hand from the Actions tab. It only builds: nothing is deployed.

Each build is tagged with:

| Pushed           | Image tags                               |
|------------------|------------------------------------------|
| `develop`        | `latest`, `develop`, `sha-<commit>`      |
| `feature/foo`    | `feature-foo`, `sha-<commit>`            |
| tag `v3.2.0`     | `3.2.0`, `3.2`, `sha-<commit>`           |

`IMAGE_TAG` picks which of these the deployment runs (default `latest`). Pin production to a release
(`IMAGE_TAG=3.2.0`) so it changes only when you change it; going back is setting the previous tag and
redeploying. The services pull on every deploy (`pull_policy: always`), so a moving tag like `latest` or a
branch name gets its newest build.

Wait for the Actions run to finish before deploying: a deploy started earlier still finds the previous
image under the tag and runs that. In Dokploy, turn off auto-deploy on push for this reason, and deploy by
hand once the run is green.

The packages must be public for the server to pull them without logging in (on GitHub, each package's
settings → Change visibility). For private packages, add `ghcr.io` as a registry in Dokploy (or
`docker login ghcr.io` on the server) with a token that has `read:packages`.

### Building locally

`docker compose` also reads `docker-compose.override.yml` when it sits next to `docker-compose.yml`. That
file builds the images from the checkout instead of pulling them, so locally `docker compose up --build`
runs the code as it is. Dokploy names `docker-compose.yml` explicitly and does not read the override.

### The new frontend (frontend-next)

`frontend-next/` is a new frontend (React, built with Rsbuild; see its README) that runs alongside the current
one. The Dockerfile's `frontend-next` target serves it with nginx (`docker/nginx-next.conf`), passing everything
else to `web` as the `frontend` image does. CI publishes it as `ghcr.io/abraxas-krown/gw2raidar-frontend-next`,
with the same tags as the other images. It is not part of `docker-compose.yml`, so nothing deploys it yet.

Locally, the override has it under the `next` profile:

```sh
docker compose --profile next up --build   # the new frontend at http://localhost:8081, on the same `web`
```

To try it on a server, run the image next to `frontend` on the same network as `web`, and route a second host
name to its port 80.

## Resetting the database

To start over with an empty database (for example on a test deployment), remove its volume. This deletes
every account and encounter, and cannot be undone:

```
docker compose down
docker volume rm <project>_pgdata17     # only the database; the uploads and reports volumes stay
docker compose up -d                    # web applies the migrations to the new, empty database
docker compose exec web python manage.py createsuperuser
```

`docker compose down -v` instead removes every volume, the stored logs and reports included.

## Upgrading PostgreSQL

A new major version of PostgreSQL cannot open the data of an older one, so the database volume is
named after the version (`pgdata17`). A deploy that changes the version therefore starts with an
empty database, and the old volume is left untouched. To move the data from 13 (volume `pgdata`):

```
# 1. on the OLD deployment: stop writers, then dump the database
docker compose stop web worker
docker compose exec -T db pg_dump -U gw2raidar -Fc gw2raidar > gw2raidar.dump

# 2. deploy the new version, but start only the database
docker compose up -d db

# 3. restore into the empty database, then start the rest (web applies the migrations)
docker compose exec -T db pg_restore -U gw2raidar -d gw2raidar --no-owner < gw2raidar.dump
docker compose up -d
```

If `web` was started before the restore, it has already created empty tables: remove the new volume
(`docker compose down`, `docker volume rm <project>_pgdata17`) and start again from step 2.
Remove the old `pgdata` volume once the site has been checked.

# WSGI + PostgreSQL deploy without Docker

```
apt install python3-dev python3-pip apache2 apache2-dev git postgresql
```

Create the postgres user

```
sudo -u postgres psql
CREATE ROLE [user] LOGIN PASSWORD '[password]';
CREATE DATABASE [database] WITH OWNER = [user];
```

Download `mod_wsgi` source

```
sudo su -
wget [mod_wsgi_url]
tar xzf [mod_wsgi].tar.gz
cd [mod_wsgi_dir]
./configure --with-python=`which python3`
make
make install
```


create `/etc/apache2/mods-available/wsgi.load`:

```
LoadModule wsgi_module /usr/lib/apache2/modules/mod_wsgi.so
WSGIApplicationGroup %{GLOBAL}
```

Then

```
a2enmod wsgi
certbot --apache
```

Assume the app will be called `gw2r-test`.
Put the following into `/etc/apache2/sites-enabled/000-default-le-ssl.conf`, somewhere inside `VirtualHost`:

```
Alias /gw2r-test/static/ /var/www/apps/gw2r-test/static/
WSGIDaemonProcess gw2r-test processes=2 threads=15 display-name=%{GROUP} python-path=/var/www/apps/gw2r-test
WSGIProcessGroup gw2r-test
WSGIScriptAlias /gw2r-test /var/www/apps/gw2r-test/gw2raidar/wsgi.py process-group=gw2r-test
<Directory /var/www/apps/gw2r-test/gw2raidar>
    <Files wsgi.py>
        Require all granted
    </Files>
</Directory>
```

Get GW2Raidar (assuming `develop` branch):

```
mkdir /var/www/apps
cd /var/www/apps
git clone git@github.com:merforga/gw2raidar.git -b develop gw2r-test
cd gw2r-test
cp gw2raidar/settings_local.py.example gw2raidar/settings_local.py
```

Edit `gw2raidar/settings_local.py` to prepare for WSGI:

```
DEBUG = False

# When DEBUG is False (must for production),
# this needs to be set for the app's host, like so:
ALLOWED_HOSTS = ['139.162.68.156']

# This needs to be secret and can't be committed to the repository
SECRET_KEY = '[secretkey]'

# Database
# https://docs.djangoproject.com/en/1.10/ref/settings/#databases
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'gw2r_test',
        'USER': 'gw2raidar',
        'PASSWORD': '[password]',
        'HOST': '127.0.0.1',
        'PORT': '5432',
    }
}

EMAIL_SUBJECT_PREFIX = '[gw2raidar] '

# normal mail (like password reset), to users
DEFAULT_FROM_EMAIL = 'gw2raidar@example.com'

# error emails, to admins
SERVER_EMAIL = 'gw2raidar@example.com' #

# the abovementioned admins
# ADMINS = [
#         ('Admin1', 'admin1@example.com'),
#         ('Admin2', 'admin2@example.com'),
#     ]


# SMTP server
# You can use a fake SMTPD that will print any "sent" emails to console:
#
#     python -m smtpd -n -c DebuggingServer localhost:1025
#
# This would require 'EMAIL_PORT = 1025`.
# Obviously, in production, point it to a real SMTP server, where the default
# `EMAIL_PORT = 25` should be okay.
EMAIL_HOST = 'localhost'
# EMAIL_PORT = 1025

STATIC_URL = '/gw2r-test/static/'
STATIC_ROOT = '/var/www/apps/gw2r-test/static/'
```

This setup predates the separate frontend and is no longer complete: Django no longer serves the pages.
Apache would also have to serve the built frontend (see "The frontend" below and `docker/nginx.conf`), and
the frontend is built for the site root, not a prefix like `/gw2r-test/`.


# Adding a user

```
useradd -m amadan
passwd amadan
mkdir ~amadan/.ssh
cd ~amadan/.ssh
cat > authorized_hosts
chown amadan:amadan . authorized_hosts
chmod og-rwx . authorized_hosts
usermod -aG sudo amadan


# The frontend

The frontend (Ractive) is [`frontend/`](frontend/README.md): a static page shell and its assets, talking to
the JSON API in `raidar/urls_api.py`, described in `docs/frontend-api.md`. Django has no part in building or
serving it. `python frontend/build.py` (standard library only) writes it to `frontend/dist/`; the Docker
image's `frontend` stage does this.

A web server serves it, which in Compose is the `frontend` service (`docker/nginx.conf`):
- for each page URL, `dist/index.html` with `Cache-Control: no-cache`;
- `dist/assets/` under `/assets/` (the hashed copies can be cached forever);
- everything else (the `*.json` endpoints, `api/`, `download/`, `report/`, `reset/`, `admin/`, `static/`,
  `robots.txt`) passed to Django, which serves the admin's static files itself (WhiteNoise).
