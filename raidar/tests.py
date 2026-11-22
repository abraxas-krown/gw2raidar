"""The contract between the backend and the frontend (docs/frontend-api.md).

The frontend is a static shell (served by nginx) plus the JSON API; these check the parts of that contract the frontend
depends on, so either side can change without breaking the other.
"""
import os
import tempfile
from io import StringIO

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management import CommandError, call_command
from django.test import Client, TestCase, override_settings

from raidar import frontend
from raidar.models import Era

# the tests run without collectstatic, so static URLs are not looked up in the hashed-files manifest
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

PAGE_URLS = ['/', '/info-help', '/encounters/2', '/encounter/doesnotexist', '/global_stats',
             '/global_stats/1/area-17', '/global_stats/All%20raid%20bosses', '/login', '/account']


@override_settings(STORAGES=PLAIN_STATIC)
class ShellTests(TestCase):
    def test_render_is_static(self):
        html = frontend.render_shell()
        for marker in frontend.FORBIDDEN:
            self.assertNotIn(marker, html)
        self.assertIn('<meta name="raidar-version" content="%s">' % settings.VERSION['id'], html)
        self.assertIn('<meta name="raidar-base" content="/">', html)
        self.assertIn('raidar/api.js', html)

    def test_build_and_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'dist', 'index.html')
            with override_settings(FRONTEND_INDEX=path):
                call_command('build_frontend', stdout=StringIO(), stderr=StringIO())
                with open(path, encoding='utf-8') as f:
                    self.assertEqual(f.read(), frontend.render_shell())
                call_command('build_frontend', '--check', stdout=StringIO(), stderr=StringIO())
                with open(path, 'a', encoding='utf-8') as f:
                    f.write('changed')
                with self.assertRaises(CommandError):
                    call_command('build_frontend', '--check', stdout=StringIO(), stderr=StringIO())

    def test_page_urls_are_not_served_by_django(self):
        # nginx serves them (docker/nginx.conf); Django only answers the API
        for url in PAGE_URLS:
            self.assertEqual(Client().get(url).status_code, 404, url)


@override_settings(STORAGES=PLAIN_STATIC)
class APITests(TestCase):
    def test_bootstrap(self):
        data = Client().get('/bootstrap.json?v=1').json()
        for key in ('areas', 'boss_locations', 'specialisations', 'categories', 'buffs', 'buff_tabs',
                    'archetypes', 'version', 'debug', 'urls'):
            self.assertIn(key, data)
        self.assertEqual(set(data['urls']), {'admin', 'download', 'report', 'api_upload', 'api_categories'})

    def test_initial_anonymous_sets_csrf_cookie(self):
        response = Client().get('/initial.json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['username'], '')
        self.assertIn('csrftoken', response.cookies)

    def test_initial_signed_in(self):
        user = User.objects.create_user('someone', password='password')
        client = Client()
        client.force_login(user)
        data = client.get('/initial.json').json()
        self.assertEqual(data['username'], 'someone')
        self.assertIn('privacy', data)

    def test_post_needs_csrf_header(self):
        client = Client(enforce_csrf_checks=True)
        token = client.get('/initial.json').cookies['csrftoken'].value
        self.assertEqual(client.post('/login.json', {'username': 'x', 'password': 'y'}).status_code, 403)
        response = client.post('/login.json', {'username': 'x', 'password': 'y'}, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['error'], 'Could not log in')

    def test_login_replaces_csrf_cookie(self):
        User.objects.create_user('someone', password='password')
        client = Client(enforce_csrf_checks=True)
        token = client.get('/initial.json').cookies['csrftoken'].value
        response = client.post('/login.json', {'username': 'someone', 'password': 'password'},
                               HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.json()['username'], 'someone')
        self.assertIn('csrftoken', response.cookies)
        self.assertNotEqual(response.cookies['csrftoken'].value, token)

    def test_unknown_encounter_is_404(self):
        response = Client().get('/encounter/doesnotexist.json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {'error': 'Encounter does not exist'})

    def test_unknown_era_is_404(self):
        response = Client().get('/global_stats/999.json')
        self.assertEqual(response.status_code, 404)
        self.assertIn('error', response.json())

    def test_global_stats(self):
        Era.objects.create(started_at=0, name='Era', description='')
        data = Client().get('/global_stats.json').json()['global_stats']
        self.assertEqual(set(data), {'eras', 'areas', 'stats'})
        self.assertEqual(Client().get('/api/global_stats.json').json()['global_stats'], data)

    def test_register_is_post_only(self):
        self.assertEqual(Client().get('/register.json').status_code, 405)
