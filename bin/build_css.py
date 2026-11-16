#!/usr/bin/env python3
"""Builds the site's stylesheet, raidar/static/raidar/css/raidar.css, from its SCSS.

The SCSS is UIkit's, with the site's own settings and styles in node_modules/uikit/src/scss/raidar/ and
node_modules/uikit/src/scss/raidar.scss as the entry point. The build is a plain Sass compile: no
autoprefixer. The vendor prefixes current browsers still need are written in the SCSS itself; the ones
autoprefixer used to add (for IE 10/11 and 2012-era WebKit) are no longer needed.

Needs libsass (pip install libsass), which is only used here, not by the site.

    python bin/build_css.py           # build raidar.css
    python bin/build_css.py --check   # exit 1 if raidar.css is not what the SCSS builds
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "node_modules", "uikit", "src", "scss", "raidar.scss")
OUTPUT = os.path.join(ROOT, "raidar", "static", "raidar", "css", "raidar.css")

# The glitch effect on private names (components/glitch.scss) uses random(), so its keyframes come out
# different on every build; they are left out of --check.
RANDOM_KEYFRAMES = re.compile(r"@keyframes example-one-anim-\d\{.*?\}\}")


def build():
    try:
        import sass
    except ImportError:
        sys.exit("libsass is needed to build the CSS: pip install libsass")
    # precision 10, as the CSS was built before (CodeKit)
    return sass.compile(filename=SOURCE, output_style="compressed", precision=10).strip() + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="only check that raidar.css is up to date")
    args = parser.parse_args()

    css = build()
    if args.check:
        with open(OUTPUT, encoding="utf-8") as file:
            current = file.read()
        if RANDOM_KEYFRAMES.sub("", current) != RANDOM_KEYFRAMES.sub("", css):
            sys.exit("raidar.css is not what the SCSS builds: run python bin/build_css.py")
        print("raidar.css is up to date")
        return
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as file:
        file.write(css)
    print("wrote %s (%d bytes)" % (os.path.relpath(OUTPUT, ROOT), len(css)))


if __name__ == "__main__":
    main()
