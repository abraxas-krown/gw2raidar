"""Tests for build.py:  python -m unittest frontend/test_build.py  (standard library only)."""
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402


def write(root, rel, text):
    path = os.path.join(root, *rel.split('/'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


class SiteBuildTest(unittest.TestCase):
    """The real frontend builds, and its shell is complete."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = cls.tmp.name
        cls.html = build.build(cls.out)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_no_template_syntax_left(self):
        for marker in build.FORBIDDEN:
            self.assertNotIn(marker, self.html)
        self.assertIn('type="text/ractive"', self.html)
        self.assertIn('[[#if', self.html)  # Ractive's delimiters are left for Ractive

    def test_scripts_are_hashed_and_exist(self):
        for name in ('api', 'router', 'replay', 'script'):
            match = re.search(r'src="/assets/(%s\.[0-9a-f]{12}\.js)"' % name, self.html)
            self.assertTrue(match, name)
            self.assertTrue(os.path.isfile(os.path.join(self.out, 'assets', match.group(1))), name)

    def test_unhashed_assets_are_copied(self):
        # stylesheets refer to images relatively, and templates build some image URLs at runtime
        self.assertTrue(os.path.isfile(os.path.join(self.out, 'assets', 'img', 'background', 'header-concept.jpg')))
        self.assertIn('/assets/img/48px/[[spec]]_tango_icon_48px.png', self.html)

    def test_shell_is_static(self):
        self.assertNotIn('csrfmiddlewaretoken', self.html)
        self.assertIn('<meta name="raidar-base" content="/">', self.html)


class BuildRulesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src = os.path.join(self.tmp.name, 'src')
        self.assets = os.path.join(self.tmp.name, 'assets')
        self.out = os.path.join(self.tmp.name, 'out')
        write(self.assets, 'a.js', 'console.log(1)')
        os.makedirs(self.out)

    def tearDown(self):
        self.tmp.cleanup()

    def run_build(self, index, **partials):
        write(self.src, 'index.html', index)
        os.makedirs(os.path.join(self.src, 'partials'), exist_ok=True)
        for name, text in partials.items():
            write(self.src, 'partials/' + name, text)
        return build.build(self.out, src=self.src, assets=self.assets)

    def test_nested_includes_and_comments(self):
        html = self.run_build('<p><!--# include outer.html --></p>{# gone #}',
                              **{'outer.html': '[<!--# include inner.html -->]', 'inner.html': 'x{# also gone #}'})
        self.assertEqual(html, '<p>[x]</p>')

    def test_hashing(self):
        html = self.run_build('<script src="/assets/a.js"></script><img src="/assets/img/[[x]].png">')
        name = re.search(r'/assets/(a\.[0-9a-f]{12}\.js)', html).group(1)
        self.assertTrue(os.path.isfile(os.path.join(self.out, 'assets', name)))
        self.assertIn('/assets/img/[[x]].png', html)

    def test_missing_include_fails(self):
        with self.assertRaisesRegex(build.BuildError, 'nope.html'):
            self.run_build('<!--# include nope.html -->')

    def test_include_cycle_fails(self):
        with self.assertRaisesRegex(build.BuildError, 'cycle'):
            self.run_build('<!--# include a.html -->',
                           **{'a.html': '<!--# include b.html -->', 'b.html': '<!--# include a.html -->'})

    def test_other_template_syntax_fails(self):
        with self.assertRaisesRegex(build.BuildError, 'still contains'):
            self.run_build('{% static "a.js" %}')


if __name__ == '__main__':
    unittest.main()
