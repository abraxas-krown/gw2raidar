from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from raidar.frontend import render_shell, write_shell


class Command(BaseCommand):
    help = ("Renders the frontend's page shell (raidar/index.html) to settings.FRONTEND_INDEX. "
            "Run it after collectstatic, which names the hashed static files.")

    def add_arguments(self, parser):
        parser.add_argument('--check', action='store_true',
                            help='only check that the built shell is up to date (exit 1 if not)')

    def handle(self, *args, **options):
        if settings.DEBUG:
            # with DEBUG the static tags name the unhashed files
            self.stderr.write('Warning: DEBUG is on, so the shell names unhashed static files; '
                              'build with DJANGO_DEBUG=false for production')
        try:
            if options['check']:
                expected = render_shell()
                try:
                    with open(settings.FRONTEND_INDEX, encoding='utf-8') as f:
                        actual = f.read()
                except OSError:
                    raise CommandError('%s is missing' % settings.FRONTEND_INDEX)
                if actual != expected:
                    raise CommandError('%s is out of date: run manage.py build_frontend' % settings.FRONTEND_INDEX)
                self.stdout.write('%s is up to date' % settings.FRONTEND_INDEX)
            else:
                path, html = write_shell()
                self.stdout.write('Wrote %s (%d bytes)' % (path, len(html.encode('utf-8'))))
        except ValueError as e:
            raise CommandError(str(e))
