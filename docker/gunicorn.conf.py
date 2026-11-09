"""Gunicorn settings for the container: quieter, more useful logs behind Traefik."""
from gunicorn import glogging

bind = "0.0.0.0:8000"
workers = 2
threads = 4
timeout = 120

accesslog = "-"
errorlog = "-"
# client address, request, status, bytes, seconds, referer, user agent
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(L)ss "%(f)s" "%(a)s"'


class Logger(glogging.Logger):
    """Access log that shows the real client and omits noise."""

    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        # Behind Traefik, REMOTE_ADDR is always the proxy; the client is the first X-Forwarded-For entry.
        forwarded = environ.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            atoms["h"] = forwarded.split(",")[0].strip() or atoms["h"]
        return atoms

    def access(self, resp, req, environ, request_time):
        # the compose healthcheck identifies itself with this User-Agent
        if environ.get("HTTP_USER_AGENT") == "healthcheck":
            return
        # successful static file requests (CSS/JS/images) are just noise; errors are still logged
        if environ.get("PATH_INFO", "").startswith("/static/") and getattr(resp, "status_code", 500) < 400:
            return
        super().access(resp, req, environ, request_time)


logger_class = Logger
