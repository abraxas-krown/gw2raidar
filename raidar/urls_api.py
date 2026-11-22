"""The backend: every JSON endpoint the frontend calls (see docs/frontend-api.md), the public upload API,
file downloads, and Django's own password-reset pages. No route here returns the page shell."""
from django.urls import include, path, re_path
from django.contrib.auth import views as auth_views
from rest_framework.authtoken import views as rest_auth_views
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from . import views
from .api_v2 import views as api_v2_views

# the frontend's API; the paths are kept as they were, so old clients keep working
urlpatterns = [
    re_path(r'^initial.json$', views.initial, name = "initial"),
    re_path(r'^bootstrap.json$', views.bootstrap, name = "bootstrap"),
    re_path(r'^encounters.json$', views.encounters, name = "encounters"),
    re_path(r'^login.json$', views.login, name = "login"),
    re_path(r'^logout.json$', views.logout, name = "logout"),
    re_path(r'^register.json$', views.register, name = "register"),
    re_path(r'^reset_pw.json$', views.reset_pw, name = "reset_pw"),
    re_path(r'^leaderboards.json$', views.leaderboards, name = "leaderboards"),
    re_path(r'^upload.json$', views.upload, name = "upload"),
    re_path(r'^privacy.json$', views.privacy, name = "privacy"),
    re_path(r'^profile_graph.json$', views.profile_graph, name = "profile_graph"),
    re_path(r'^set_tags_cat.json$', views.set_tags_cat, name = "set_tags_cat"),
    re_path(r'^contact.json$', views.contact, name = "contact"),
    re_path(r'^poll.json$', views.poll, name = "poll"),
    re_path(r'^poll.leaderboards$', views.poll, name = "leaderboards"),
    re_path(r'^change_email.json$', views.change_email, name = "change_email"),
    re_path(r'^change_password.json$', views.change_password, name = "change_password"),
    re_path(r'^add_api_key.json$', views.add_api_key, name = "add_api_key"),
    re_path(r'^remove_api_key.json$', views.remove_api_key, name = "remove_api_key"),
    re_path(r'^encounter/(?P<url_id>\w+)\.json$', views.encounter, name = "encounter"),
    re_path(r'^profile(?:/(?P<era_id>[0-9]+))?\.json$', views.profile, name = "profile"),
    re_path(r'^replay/(?P<url_id>\w+)\.json$', views.replay, name="replay"),
    # XXX HACK separate API
    re_path(r'^(?:api/)?global_stats(?:/(?P<era_id>[0-9]+))?(?:/(?:area-)?(?P<stats_page>[0-9]+|[A-Za-z ]+))?\.json$', views.global_stats, name = "global_stats"),
]

# files the frontend links to
urlpatterns += [
    re_path(r'^download/(?P<url_id>\w+)?$', views.download, name="download"),
    re_path(r'^report/(?P<url_id>\w+)?$', views.report, name="report"),
]

# the public upload API (used by upload tools, documented on the site's API page)
urlpatterns += [
    re_path(r'^api/upload.json$', views.api_upload, name = "api_upload"),
    re_path(r'^api/categories.json$', views.api_categories, name = "api_categories"),
    re_path(r'^api/v2/auth/', include('rest_framework.urls', namespace='rest_framework')),
    re_path(r'^api/v2/token', rest_auth_views.ObtainAuthToken.as_view()),
    re_path(r'^api/v2/schema$', SpectacularAPIView.as_view(), name='api_v2_schema'),
    re_path(r'^api/v2/swagger', SpectacularSwaggerView.as_view(url_name='api_v2_schema')),
    re_path(r'^api/v2/categories', api_v2_views.CategoryListView.as_view()),
    re_path(r'^api/v2/areas', api_v2_views.AreaListView.as_view()),
    re_path(r'^api/v2/encounters/new', api_v2_views.EncounterUploadView.as_view()),
    re_path(r'^api/v2/encounters', api_v2_views.EncounterListView.as_view()),
]

# the links in password-reset emails lead to Django's own pages
urlpatterns += [
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    re_path(r'^reset/done/$', auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),
]
