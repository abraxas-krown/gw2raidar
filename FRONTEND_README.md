UI Guidelines
----------

[GW2 Raidar's style guide](https://www.figma.com/file/I8c0kbP29g2phZ9n3JsOhfnp/GW2-Raidar)

You do not need an account to use the style guide as a reference but creating a Figma account will give you access to exporting assets or duplicate the file to use the prebuilt components.

CSS Quickstart
-----------

We use [UIkit](https://getuikit.com/docs/introduction) as our base framework which is compiled with our custom CSS.

[SASS](https://getuikit.com/docs/sass) is used to keep the CSS organized and easy to change. The site's
stylesheet, `raidar/static/raidar/css/raidar.css`, is built from `node_modules/uikit/src/scss/raidar.scss`:
UIkit's SCSS, with the site's own settings and styles in `node_modules/uikit/src/scss/raidar/`. Change the
SCSS, never `raidar.css` itself, and rebuild it:

```
pip install libsass
python bin/build_css.py          # writes raidar.css
python bin/build_css.py --check  # tells whether raidar.css is up to date
```

The build is a plain Sass compile, without autoprefixer: the vendor prefixes current browsers still need are
written in the SCSS. If you build with [Codekit](https://codekitapp.com/) instead, turn its Autoprefixer off for
`raidar.scss` (the project's settings still target IE 10) and set the output to compressed, so it makes the same
file.
