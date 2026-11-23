# Two images from one build (docker-compose.yml picks them with `target`):
#   app       Django/gunicorn (the `web` and `worker` services): the JSON API and upload processing
#   frontend  nginx (the `frontend` service): the frontend built from frontend/, proxying the rest to `web`
# The two share nothing: the frontend stages use only frontend/ and docker/nginx.conf.
# `frontend` is the last stage, so a plain `docker build .` makes the nginx image; use `--target app` for Django.

# Elite Insights CLI (the log parser), taken from its own image, built from our fork
# (https://github.com/abraxas-krown/GW2-Elite-Insights-Parser, its docker/cli/Dockerfile and "Docker CLI image"
# workflow). The site depends on the structure of EI's JSON output and on its encounter IDs, so the tag is
# pinned here and changes with the code: pin an image made from one of the fork's git tags, never `latest` or
# `master`, which move. `--build-arg GW2EI_TAG=...` overrides it for one build. See DEPLOY.md.
ARG GW2EI_TAG=v3.33.0.0-krown.1
FROM ghcr.io/abraxas-krown/gw2ei:${GW2EI_TAG} AS gw2ei

# ---- .NET runtime, needed to run the Elite Insights CLI (the log parser); only its files are copied ----
FROM mcr.microsoft.com/dotnet/runtime:10.0 AS dotnet

# ---- build stage: full image has gcc/headers, so packages without wheels can compile ----
FROM python:3.13-trixie AS builder
ENV PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install -r /tmp/requirements.txt

# ---- app: the Django runtime, a slim image; only the virtualenv is carried over (no apt-get needed) ----
FROM python:3.13-slim-trixie AS app
# GW2EI_CLI is read by gw2raidar/settings.py; a .dll is run through `dotnet`.
# The image has no ICU libraries, so .NET runs in invariant-culture mode; EI asks for the "en-US"
# culture, which then needs predefined-only switched off.
ENV PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:/usr/share/dotnet:$PATH" \
    STATIC_ROOT=/app/staticfiles \
    DOTNET_ROOT=/usr/share/dotnet \
    GW2EI_CLI=/opt/gw2ei/GuildWars2EliteInsights-CLI.dll \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 \
    DOTNET_SYSTEM_GLOBALIZATION_PREDEFINED_CULTURES_ONLY=false
RUN useradd --system --uid 1000 --home-dir /app --shell /usr/sbin/nologin app
COPY --from=builder /opt/venv /opt/venv
COPY --from=dotnet /usr/share/dotnet /usr/share/dotnet
COPY --from=gw2ei /opt/gw2ei /opt/gw2ei
WORKDIR /app
COPY . /app
# Collect Django's own static files (the admin's), which WhiteNoise serves; no database is needed for this.
# /app/log, /data/uploads and /data/reports are the only places the app writes to.
RUN python manage.py collectstatic --noinput \
    && (python -m compileall -q raidar analyser eiparser gw2api gw2raidar || true) \
    && mkdir -p /app/log /data/uploads /data/reports \
    && chown app:app /app/log /data/uploads /data/reports
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8000
# The entrypoint starts as root only to fix volume ownership, then drops to the "app" user.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["web"]

# ---- frontend: build frontend/ (frontend/build.py, standard library only) and serve it with nginx ----
FROM python:3.13-alpine AS frontend-build
COPY frontend/ /src/
RUN python /src/build.py --out /dist

FROM nginx:1.27-alpine AS frontend
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /dist /usr/share/nginx/html
EXPOSE 80
