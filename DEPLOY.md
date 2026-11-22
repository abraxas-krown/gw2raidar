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

The Elite Insights CLI is pinned in the `Dockerfile` (`GW2EI_VERSION` and the checksum of its zip). The
site depends on its encounter IDs and its JSON output, so compare the new version's source with the old
one before changing the pin:

1. **New bosses.** Encounters EI added or renumbered (their `LogID`s, under `LogLogic/`) need an entry in
   `analyser/bosses.py`, or their logs are rejected as unsupported.
2. **New or changed maps.** Replays use the site's own map of each boss: the images in
   `raidar/static/raidar/img/replay/`, listed in `eiparser/replay_maps.json`. Both are taken from EI: the image
   (`ParserHelpers/Images/LogImages.cs`, the `CombatReplay...` constants) and the world rectangle and size of
   the boss's `CombatReplayMap` (in its `GetCombatMapInternal`).
   Add maps for new bosses, and update the image, `world` and `size` of any boss whose map changed. While a
   map does not match EI's, that boss's encounters are stored without a replay (with a warning in the log).
3. Run the tests (`python -m unittest discover -s eiparser/tests -t .`) and parse a few real logs.

# Docker Compose deploy

`docker-compose.yml` runs the database, the site's front (`frontend`, nginx), Django (`web`) and the upload
processor (`worker`). It needs `SECRET_KEY`, `ALLOWED_HOSTS` and `POSTGRES_PASSWORD` in the environment.

**Point the domain (Traefik/Dokploy) at `frontend`, port 80.** It serves the page shell and the static files,
and passes everything else to `web` (`docker/nginx.conf`). `web` (gunicorn, port 8000) answers only the JSON
API, downloads, the admin and Django's own pages, and is not meant to be reached directly: it has no page
URLs and doesn't serve `/static/`. `frontend` and `web`/`worker` are two targets of the same Dockerfile, so one
`docker compose build` makes a shell and static files that match.

Files are kept on two volumes:

- `uploads` (`/data/uploads`, `UPLOAD_DIR`): uploads waiting to be processed, and the stored logs under
  `encounters/<uploader>/`.
- `reports` (`/data/reports`, `REPORT_DIR`): one folder per encounter, `<encounter url id>/`, holding the
  Elite Insights HTML report (`ei.html.gz`, about 2–3 MB) and the encounter's replay (`replay.json.gz`, about
  100–200 KB; see `eiparser/replay.py`). Neither is ever pruned, so back this volume up along with the database.

`MIN_FREE_DISK_GB` (default 10) controls log pruning: `restat` deletes the oldest uploaded `.evtc` files
while the upload volume has less than that many GB free. The parsed encounters and their Elite Insights
reports stay, as they are on their own volume; only the encounter's download goes. `0` keeps every log.

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
Apache would also have to serve the page shell for the page URLs (see "The frontend" below and
`docker/nginx.conf`), built with `FORCE_SCRIPT_NAME = '/gw2r-test/'` so it uses the site's prefix.


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

The frontend (Ractive, `raidar/templates/raidar/` and `raidar/static/raidar/`) is a static page shell plus
the JSON API in `raidar/urls_api.py`, described in `docs/frontend-api.md`. `manage.py build_frontend` renders
the shell once to `frontend_dist/index.html` (`FRONTEND_INDEX`). Run it after `collectstatic`, with
`DJANGO_DEBUG=false`, since the shell names the hashed static files; the Docker image does this.
`build_frontend --check` exits 1 if the built shell is out of date.

Django doesn't serve the shell or the static files. A web server does, which in Compose is the `frontend`
service (`docker/nginx.conf`):
- for each page URL, `frontend_dist/index.html` with `Cache-Control: no-cache`;
- `STATIC_ROOT` under `STATIC_URL` (hashed names can be cached forever);
- everything else (the `*.json` endpoints, `api/`, `download/`, `report/`, `reset/`, `admin/`, `robots.txt`)
  passed to Django.
