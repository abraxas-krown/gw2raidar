"""URLs of the frontend's own images that the API hands out (boon icons, replay maps).

The images belong to the frontend (frontend/assets/, served under settings.ASSETS_URL); the backend only
names them, by their path there. See docs/frontend-api.md.
"""
from django.conf import settings


def asset_url(path):
    """The URL of frontend/assets/<path>, e.g. asset_url('img/buff/might.png')."""
    return settings.ASSETS_URL + path
