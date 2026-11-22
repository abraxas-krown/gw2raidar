"""Builds the frontend into dist/: the page shell (index.html) and the assets.

    python frontend/build.py                 # writes frontend/dist/
    python frontend/build.py --out /dist     # somewhere else (the Docker image does this)

The source is plain HTML with two additions, both handled here:

    <!--# include encounter.html -->   replaced by src/partials/encounter.html (partials may include others)
    {# a note #}                         a source comment, removed (one line, like Django's)

Every `/assets/<file>` the shell names is also written as a copy with a content hash in its name
(script.js -> script.0123456789ab.js) and the shell points at that copy, so the web server can let
browsers keep it forever. The unhashed files are copied too: stylesheets refer to images by relative
URL, and the templates build some image URLs at runtime (/assets/img/48px/<spec>.png).

Standard library only: no Django, no Node. See README.md.
"""
import argparse
import hashlib
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
PARTIALS = os.path.join(SRC, 'partials')
ASSETS = os.path.join(HERE, 'assets')

INCLUDE = re.compile(r'<!--# include ([\w.-]+) -->')
COMMENT = re.compile(r'\{#.*?#\}')
# an asset URL in an attribute: up to the closing quote, stopping at a Ractive [[ ]] (a runtime path)
ASSET_URL = re.compile(r'(?<=["\'])/assets/([^"\'\[\s]+)(?=["\'])')
# what must not be left in the output: template syntax of another kind, or an unresolved include
FORBIDDEN = ('{%', '{{', '{#', '<!--# include')


class BuildError(Exception):
    pass


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def render(name, partials=PARTIALS, stack=()):
    """The template `name` with its includes resolved and its source comments removed."""
    if name in stack:
        raise BuildError('include cycle: %s' % ' -> '.join(stack + (name,)))
    path = os.path.join(partials, name)
    if not os.path.isfile(path):
        raise BuildError('%s includes %s, which is not in %s' % (stack[-1] if stack else '?', name, partials))
    return expand(read(path), partials, stack + (name,))


def expand(text, partials=PARTIALS, stack=()):
    text = COMMENT.sub('', text)
    return INCLUDE.sub(lambda m: render(m.group(1), partials, stack), text)


def hashed_name(path, content):
    root, ext = os.path.splitext(path)
    return '%s.%s%s' % (root, hashlib.sha256(content).hexdigest()[:12], ext)


def build(out, src=SRC, assets=ASSETS):
    """Writes out/index.html and out/assets/. Returns the shell's HTML."""
    partials = os.path.join(src, 'partials')
    html = expand(read(os.path.join(src, 'index.html')), partials, ('index.html',))

    out_assets = os.path.join(out, 'assets')
    if os.path.isdir(out_assets):
        shutil.rmtree(out_assets)
    shutil.copytree(assets, out_assets)

    hashed = {}

    def to_hashed(m):
        rel = m.group(1)
        source = os.path.join(assets, *rel.split('/'))
        if not os.path.isfile(source):
            return m.group(0)  # a directory prefix (completed at runtime), left as it is
        if rel not in hashed:
            with open(source, 'rb') as f:
                content = f.read()
            hashed[rel] = hashed_name(rel, content)
            with open(os.path.join(out_assets, *hashed[rel].split('/')), 'wb') as f:
                f.write(content)
        return '/assets/' + hashed[rel]

    html = ASSET_URL.sub(to_hashed, html)

    found = [marker for marker in FORBIDDEN if marker in html]
    if found:
        raise BuildError('the built shell still contains %s' % ', '.join(map(repr, found)))
    missing = [m.group(1) for m in re.finditer(r'/assets/([^"\'\s]+\.[0-9a-f]{12}\.\w+)', html)
               if not os.path.isfile(os.path.join(out_assets, *m.group(1).split('/')))]
    if missing:
        raise BuildError('the built shell names missing files: %s' % ', '.join(missing))

    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    return html


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--out', default=os.path.join(HERE, 'dist'), help='output directory (default: frontend/dist)')
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    try:
        html = build(args.out)
    except BuildError as e:
        sys.exit('build failed: %s' % e)
    print('wrote %s (%d bytes) and its assets' % (os.path.join(args.out, 'index.html'), len(html.encode('utf-8'))))


if __name__ == '__main__':
    main()
