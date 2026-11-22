from django.conf import settings
from django.urls import include, re_path
from django.views.generic.base import TemplateView
import importlib

from . import urls_api

# Django is the backend only: the JSON API, downloads, the admin and Django's own pages. The page URLs and
# the static files are served by the frontend's nginx (docker/nginx.conf); see docs/frontend-api.md.
urlpatterns = urls_api.urlpatterns + [
    re_path(r'^robots.txt$', TemplateView.as_view(template_name='raidar/robots.txt'), name="robots"),
]


if settings.DEBUG and importlib.util.find_spec('debug_toolbar'):
    import debug_toolbar
    urlpatterns = [
        re_path(r'^__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns
