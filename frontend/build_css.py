#!/usr/bin/env python3
"""Builds the site's stylesheet, frontend/assets/css/raidar.css, from its SCSS.

The SCSS is in frontend/scss/: UIkit's (uikit/, vendored), with the site's own settings and styles in raidar/
and raidar.scss as the entry point. The build is a plain Sass compile: no
autoprefixer. The vendor prefixes current browsers still need are written in the SCSS itself; the ones
autoprefixer used to add (for IE 10/11 and 2012-era WebKit) are no longer needed.

Needs libsass (pip install libsass), which is only used here: build.py and the site do not need it, since
the compiled raidar.css is committed.

    python frontend/build_css.py           # build raidar.css
    python frontend/build_css.py --check   # exit 1 if raidar.css is not what the SCSS builds
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "scss", "raidar.scss")
OUTPUT = os.path.join(HERE, "assets", "css", "raidar.css")

# The glitch effect on private names (scss/raidar/glitch.scss) uses random(), so its keyframes come out
# different on every build; they are left out of --check.
RANDOM_KEYFRAMES = re.compile(r"@keyframes example-one-anim-\d\{.*?\}\}")


def build():
    try:
        import sass
    except ImportError:
        sys.exit("libsass is needed to build the CSS: pip install libsass")
    # precision 10, as the CSS was built before (with CodeKit)
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
            sys.exit("raidar.css is not what the SCSS builds: run python frontend/build_css.py")
        print("raidar.css is up to date")
        return
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as file:
        file.write(css)
    print("wrote %s (%d bytes)" % (os.path.relpath(OUTPUT), len(css)))


if __name__ == "__main__":
    main()
