# ---- build stage: full image has gcc/headers, so packages without wheels can compile ----
FROM python:3.7-bullseye AS builder
ENV PIP_NO_CACHE_DIR=1
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install -r /tmp/requirements.txt

# ---- runtime stage: slim image, only the virtualenv is carried over (no apt-get needed) ----
FROM python:3.7-slim-bullseye
ENV PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    STATIC_ROOT=/app/staticfiles
RUN useradd --system --uid 1000 --home-dir /app --shell /usr/sbin/nologin app
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY . /app
# Bake the static files into the image (served by WhiteNoise); no database needed for this step.
# /app/log and /data/uploads are the only places the app writes to.
RUN python manage.py collectstatic --noinput \
    && (python -m compileall -q raidar analyser evtcparser gw2api gw2raidar || true) \
    && mkdir -p /app/log /data/uploads \
    && chown app:app /app/log /data/uploads
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8000
# The entrypoint starts as root only to fix volume ownership, then drops to the "app" user.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["web"]
