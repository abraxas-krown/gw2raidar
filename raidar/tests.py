"""The contract between the backend and the frontend (docs/frontend-api.md).

The frontend (frontend/, served by nginx) is a static shell plus the JSON API; these check the parts of that
contract the frontend depends on, so either side can change without breaking the other. The frontend's own
build has its tests in frontend/test_build.py.
"""
from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings

from raidar.models import Era

# the tests run without collectstatic, so static URLs are not looked up in the hashed-files manifest
PLAIN_STATIC = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

PAGE_URLS = ['/', '/info-help', '/encounters/2', '/encounter/doesnotexist', '/global_stats',
             '/global_stats/1/area-17', '/global_stats/All%20raid%20bosses', '/login', '/account']


class PageTests(TestCase):
    def test_page_urls_are_not_served_by_django(self):
        # nginx serves them (docker/nginx.conf); Django only answers the API
        for url in PAGE_URLS:
            self.assertEqual(Client().get(url).status_code, 404, url)


@override_settings(STORAGES=PLAIN_STATIC)
class APITests(TestCase):
    def test_bootstrap(self):
        data = Client().get('/bootstrap.json').json()
        for key in ('areas', 'boss_locations', 'specialisations', 'categories', 'buffs', 'buff_tabs',
                    'archetypes', 'version', 'debug', 'urls'):
            self.assertIn(key, data)
        self.assertEqual(set(data['urls']), {'admin', 'download', 'report', 'api_upload', 'api_categories'})

    def test_bootstrap_revalidates(self):
        # no-cache with an ETag: a deploy of either side never leaves a stale copy, and an unchanged one is a 304
        response = Client().get('/bootstrap.json')
        self.assertEqual(response['Cache-Control'], 'no-cache')
        etag = response['ETag']
        self.assertEqual(Client().get('/bootstrap.json', HTTP_IF_NONE_MATCH=etag).status_code, 304)

    @override_settings(ASSETS_URL='https://cdn.example/assets/')
    def test_site_images_are_frontend_assets(self):
        # the API names the frontend's images by their path in frontend/assets/, under ASSETS_URL
        buffs = Client().get('/bootstrap.json').json()['buffs']
        self.assertEqual(buffs['might']['icon'], 'https://cdn.example/assets/img/buff/might.png')

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
