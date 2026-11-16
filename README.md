![image](https://user-images.githubusercontent.com/25611469/41951681-7079a9d0-7a0f-11e8-89f2-99967dadaf64.png)
==========

Vision
----------
To be the go to site for Guild Wars 2 raid and fractal insights

Introduction
----------
GW2 Raidar is a web application to parse [ARCDPS log files](https://deltaconnected.com/arcdps/) for Guild Wars 2. In addition, nearly all metrics and statistics are compiled into a global database for comparison and further insights. 

Due to time constraints and the ever increasing list of features and requests, we have decided to finally go open source to hopefully speed up the development of certain new features as well as speedy fixing of bugs encountered. Feature requests and bug reports are welcome! You can submit them via our [Discord](http://discord.gg/8j43kAc) or [issues log](https://github.com/merforga/gw2raidar/issues)

Contributing
----------
Almost anyone can contribute to this project. The main issue comes down to understanding the relationship and linking between all facets of the application and the limited system resources available to do it. In order for your contribute to be implemented, we require the following:

* Knowledge of basic game mechanics and interactions
* Understanding of the GW2R spec
* Understanding of the ARCDPS log file spec
* Understanding of Python and / or willingness to learn
* Tenacity and perserverence to actually implement the change

To start, head on over to the [Wiki](https://github.com/merforga/gw2raidar/wiki) where the GW2R documentation and contribution guildelines sit. 

License
----------
See the [License](https://github.com/merforga/gw2raidar/blob/master/LICENSE) file

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
