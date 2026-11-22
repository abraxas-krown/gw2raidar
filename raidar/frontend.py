"""The frontend's page shell: one static HTML file, the same for every page URL and every user.

The shell is `raidar/index.html` with its partials, rendered once with no request: the only template
tags it may use are ones that do not depend on the request (`include`, `static`, `url`, `comment`, and
the `{{ version }}` and `{{ base_url }}` given here). Everything about the user and the page comes from
the JSON API at runtime (bootstrap.json, initial.json, the page's own JSON). See docs/frontend-api.md.

`python manage.py build_frontend` writes it to settings.FRONTEND_INDEX, after `collectstatic` (the
`static` tags name the hashed files). Django does not serve it: the frontend's nginx does, together with
the static files (docker/nginx.conf).
"""
import os

from django.conf import settings
from django.template.loader import render_to_string

TEMPLATE = 'raidar/index.html'

# what a rendered shell must not contain: unrendered template syntax, or anything per request
FORBIDDEN = ('{%', '{{', 'csrfmiddlewaretoken')


def render_shell():
    """The shell as HTML. Raises ValueError if it still holds template syntax or per-request data."""
    html = render_to_string(TEMPLATE, {
        'version': settings.VERSION['id'],
        # the site root, which every page and API URL is relative to
        'base_url': getattr(settings, 'FORCE_SCRIPT_NAME', None) or '/',
    })
    found = [marker for marker in FORBIDDEN if marker in html]
    if found:
        raise ValueError('The page shell contains %s; it must be static' % ', '.join(map(repr, found)))
    return html


def write_shell(path=None):
    path = path or settings.FRONTEND_INDEX
    html = render_shell()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    return path, html
