/*
 * Encounter replay viewer: draws a replay (see eiparser/replay.py for the format) on the boss's map, with a
 * timeline and playback controls. The panel of players and targets next to it is a Ractive template that is
 * given the viewer's state through the onView callback.
 *
 *   let viewer = new RaidarReplay.Viewer(rootElement, replayData, {
 *     staticRoot: '/static/raidar/img/',          // spec icons are under 48px/
 *     topElement: tabs,                            // sized to fit, with the map and timeline, in the window
 *     specialisation: (profession, elite) => name,
 *     buffOrder: ['might', 'fury', ...],          // the order buffs are listed in
 *     onView: view => ...,                         // the state of players and targets, a few times a second
 *   });
 *   viewer.seek(ms); viewer.select(actorIndex); viewer.destroy();
 */
(function () {
  'use strict';

  const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
  const SKIP_MS = 5000;
  const MAX_ZOOM = 16;
  const MIN_MAP_HEIGHT = 320;
  // space left above options.topElement and below the timeline when the view fills the window
  const WINDOW_MARGIN_TOP = 8;
  const WINDOW_MARGIN_BOTTOM = 16;
  const VIEW_INTERVAL_MS = 125;  // how often the panel is updated while playing
  const TRAIL_MS = 6000;         // the selected player's trail
  // one per party; chosen to read on the site's dark purple background
  const PARTY_COLOURS = ['#E7CCA9', '#6FB7E0', '#7FCB8A', '#C98BDB', '#E58A6E',
                         '#5DC6BE', '#D9C35C', '#9AA4F0', '#E07AA5', '#A0C76A'];
  const COLOURS = {
    background: '#15141e',
    text: '#FCF1E2',
    muted: '#958cbb',
    down: '#CF890F',
    dead: '#BF3F47',
    target: '#BF3F47',
    breakbar: '#58C4D8',
    targetEdge: '#461530',
    selected: '#FCF1E2',
  };

  function partyColour(party) {
    return PARTY_COLOURS[((party || 1) - 1) % PARTY_COLOURS.length];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // index of the last [time, value] at or before time, or -1
  function lastAt(points, time) {
    let low = 0, high = points.length - 1, found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (points[middle][0] <= time) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  function valueAt(points, time, fallback) {
    if (!points || !points.length) return fallback;
    const index = lastAt(points, time);
    return index < 0 ? fallback : points[index][1];
  }

  function within(intervals, time) {
    if (!intervals) return false;
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i][0] <= time && time < intervals[i][1]) return true;
    }
    return false;
  }

  function lerpAngle(a, b, f) {
    let delta = ((b - a + 540) % 360) - 180;
    return a + delta * f;
  }

  function formatTime(ms, tenths) {
    ms = Math.max(0, ms);
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor(ms / 1000) % 60;
    let text = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    if (tenths) text += '.' + Math.floor(ms / 100) % 10;
    return text;
  }

  function element(tag, className, parent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function button(parent, icon, title, handler) {
    const node = element('button', 'uk-button uk-button-default uk-button-small r-replay-button', parent);
    node.type = 'button';
    node.title = title;
    node.innerHTML = '<i class="material-icons">' + icon + '</i>';
    node.addEventListener('click', handler);
    return node;
  }

  class Viewer {
    constructor(root, data, options) {
      this.root = root;
      this.data = data;
      this.options = options || {};
      this.duration = data.duration;
      this.interval = data.sample_interval;
      this.time = 0;
      this.playing = false;
      this.speedIndex = SPEEDS.indexOf(1);
      this.selected = null;
      this.hovered = null;
      this.lastViewAt = 0;
      this.listeners = [];

      const world = data.map ? data.map.world : this.boundsOf(data.actors);
      this.world = {minX: world[0], minY: world[1], maxX: world[2], maxY: world[3]};
      this.world.width = this.world.maxX - this.world.minX;
      this.world.height = this.world.maxY - this.world.minY;

      this.actors = data.actors.map((actor, index) => Object.assign({index: index}, actor));
      this.players = this.actors.filter(actor => actor.kind === 'player');
      this.targets = this.actors.filter(actor => actor.kind === 'target');
      // the boss is drawn larger: the target with the most health data, usually the first
      this.mainTarget = this.targets.reduce((best, target) =>
        !best || (target.health || []).length > (best.health || []).length ? target : best, null);
      this.buffRank = {};
      (this.options.buffOrder || []).forEach((code, rank) => this.buffRank[code] = rank);

      this.build();
      this.loadImages();
      this.resize();
      this.fit();
      this.render();
      this.emitView(true);
    }

    // the area the actors moved in, for a boss without a map
    boundsOf(actors) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      actors.forEach(actor => {
        actor.x.forEach(x => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
        actor.y.forEach(y => { minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      });
      const pad = 250;
      return [minX - pad, minY - pad, maxX + pad, maxY + pad];
    }

    /* ---------------------------------------------------------------- layout */

    build() {
      const root = this.root;
      this.mapBox = root.querySelector('.r-replay-map');
      this.canvas = element('canvas', 'r-replay-canvas', this.mapBox);
      this.canvas.tabIndex = 0;
      this.context = this.canvas.getContext('2d');
      this.hint = element('div', 'r-replay-hint', this.mapBox);
      this.hint.textContent = 'Scroll to zoom, drag to move, double-click to reset';

      const controls = root.querySelector('.r-replay-controls');
      const transport = element('div', 'uk-button-group r-replay-transport', controls);
      button(transport, 'replay', 'Restart', () => this.seek(0));
      button(transport, 'replay_5', 'Back 5 seconds', () => this.seek(this.time - SKIP_MS));
      this.playButton = button(transport, 'play_arrow', 'Play (space)', () => this.toggle());
      button(transport, 'forward_5', 'Forward 5 seconds', () => this.seek(this.time + SKIP_MS));
      this.clock = element('div', 'r-replay-clock', controls);
      const speeds = element('div', 'uk-button-group r-replay-speeds', controls);
      this.speedButtons = SPEEDS.map((speed, index) => {
        const node = element('button', 'uk-button uk-button-default uk-button-small', speeds);
        node.type = 'button';
        node.textContent = speed + '×';
        node.addEventListener('click', () => this.setSpeed(index));
        return node;
      });
      // a magnifier with a minus: it zooms all the way out (corner-arrow icons read as full screen,
      // a crosshair as "go to the selected player")
      button(controls, 'zoom_out', 'Zoom out to the whole map', () => { this.fit(); this.render(); });

      this.buildTimeline(root.querySelector('.r-replay-timeline'));
      this.updateControls();

      this.listen(this.canvas, 'wheel', event => this.onWheel(event), {passive: false});
      this.listen(this.canvas, 'mousedown', event => this.onMouseDown(event));
      this.listen(window, 'mousemove', event => this.onMouseMove(event));
      this.listen(window, 'mouseup', event => this.onMouseUp(event));
      this.listen(this.canvas, 'mouseleave', () => { this.hovered = null; this.render(); });
      this.listen(this.canvas, 'dblclick', event => { event.preventDefault(); this.fit(); this.render(); });
      this.listen(this.canvas, 'keydown', event => this.onKey(event));
      this.listen(window, 'resize', () => { this.resize(); this.render(); });
    }

    buildTimeline(box) {
      this.timeline = box;
      const phases = element('div', 'r-replay-phases', box);
      // the top level phases, as EI shows them over its timeline
      this.data.phases.filter(phase => phase.name !== 'All' && !phase.parent).forEach((phase, index) => {
        const node = element('div', 'r-replay-phase r-replay-phase-' + (index % 2), phases);
        node.style.left = (100 * phase.start / this.duration) + '%';
        node.style.width = (100 * (phase.end - phase.start) / this.duration) + '%';
        node.textContent = phase.name;
        node.title = phase.name + ' (' + formatTime(phase.start) + ' – ' + formatTime(phase.end) + ')';
        node.addEventListener('click', () => this.seek(phase.start));
      });

      this.track = element('div', 'r-replay-track', box);
      this.progress = element('div', 'r-replay-progress', this.track);
      // downs and deaths of the players
      this.players.forEach(player => {
        [['down', 'r-replay-mark-down'], ['dead', 'r-replay-mark-dead']].forEach(([key, className]) => {
          (player[key] || []).forEach(([start]) => {
            const mark = element('div', 'r-replay-mark ' + className, this.track);
            mark.style.left = (100 * start / this.duration) + '%';
            mark.title = (player.name || 'Private player') + (key === 'dead' ? ' died' : ' went down') +
              ' at ' + formatTime(start);
          });
        });
      });
      this.head = element('div', 'r-replay-head', this.track);
      this.hoverTime = element('div', 'r-replay-hover-time', this.track);

      const seekTo = event => {
        const box = this.track.getBoundingClientRect();
        this.seek(this.duration * clamp((event.clientX - box.left) / box.width, 0, 1));
      };
      this.listen(this.track, 'mousedown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        this.scrubbing = {wasPlaying: this.playing};
        this.pause();
        seekTo(event);
      });
      this.listen(window, 'mousemove', event => {
        if (this.scrubbing) seekTo(event);
      });
      this.listen(window, 'mouseup', () => {
        if (!this.scrubbing) return;
        if (this.scrubbing.wasPlaying) this.play();
        this.scrubbing = null;
      });
      this.listen(this.track, 'mousemove', event => {
        const box = this.track.getBoundingClientRect();
        const fraction = clamp((event.clientX - box.left) / box.width, 0, 1);
        this.hoverTime.style.left = (100 * fraction) + '%';
        this.hoverTime.textContent = formatTime(this.duration * fraction);
      });
    }

    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.listeners.push([target, type, handler, options]);
    }

    destroy() {
      this.pause();
      this.listeners.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
      this.listeners = [];
    }

    loadImages() {
      const redraw = () => this.render();
      if (this.data.map && this.data.map.image) {
        this.mapImage = new Image();
        this.mapImage.onload = redraw;
        this.mapImage.src = this.data.map.image;
      }
      this.icons = {};
      const root = this.options.staticRoot || '/static/raidar/img/';
      this.players.forEach(player => {
        const name = this.options.specialisation ? this.options.specialisation(player.profession, player.elite) : null;
        player.spec = name;
        if (name && !this.icons[name]) {
          const image = new Image();
          image.onload = redraw;
          image.src = root + '48px/' + name + '_tango_icon_48px.png';
          this.icons[name] = image;
        }
      });
    }

    // The canvas fills the width of its box. Its height is what is left of the window once options.topElement
    // (the page's tabs) is at the top and the controls and timeline are at the bottom: see scrollIntoView.
    // Without a topElement, it keeps the map's shape.
    mapHeight(width) {
      const top = this.options.topElement;
      if (!top) {
        return Math.round(clamp(width * this.world.height / this.world.width, MIN_MAP_HEIGHT,
                                Math.max(window.innerHeight - 260, MIN_MAP_HEIGHT)));
      }
      const map = this.mapBox.getBoundingClientRect();
      const above = map.top - top.getBoundingClientRect().top;
      const below = this.mapBox.parentNode.getBoundingClientRect().bottom - map.bottom;
      return Math.round(Math.max(MIN_MAP_HEIGHT,
                                 window.innerHeight - WINDOW_MARGIN_TOP - above - below - WINDOW_MARGIN_BOTTOM));
    }

    // scrolls the page so options.topElement is at the top of the window, and with it the map and timeline
    scrollIntoView() {
      const top = this.options.topElement;
      if (!top) return;
      window.scrollTo({top: top.getBoundingClientRect().top + window.pageYOffset - WINDOW_MARGIN_TOP,
                       behavior: 'smooth'});
    }

    resize() {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(this.mapBox.clientWidth, 200);
      const height = this.mapHeight(width);
      const previous = this.size;
      this.size = {width: width, height: height};
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (previous && this.scale) {
        // keep the centre of the view where it was
        const centre = this.toWorld(previous.width / 2, previous.height / 2);
        this.fitScale = this.fittingScale();
        this.scale = Math.max(this.scale, this.fitScale);
        this.originX = width / 2 - (centre.x - this.world.minX) * this.scale;
        this.originY = height / 2 - (this.world.maxY - centre.y) * this.scale;
      }
    }

    fittingScale() {
      return Math.min(this.size.width / this.world.width, this.size.height / this.world.height);
    }

    fit() {
      this.fitScale = this.fittingScale();
      this.scale = this.fitScale;
      this.originX = (this.size.width - this.world.width * this.scale) / 2;
      this.originY = (this.size.height - this.world.height * this.scale) / 2;
    }

    toScreen(x, y) {
      return {x: this.originX + (x - this.world.minX) * this.scale, y: this.originY + (this.world.maxY - y) * this.scale};
    }

    toWorld(x, y) {
      return {x: this.world.minX + (x - this.originX) / this.scale, y: this.world.maxY - (y - this.originY) / this.scale};
    }

    /* ------------------------------------------------------------- playback */

    play() {
      if (this.playing) return;
      if (this.time >= this.duration) this.time = 0;
      this.playing = true;
      this.lastFrame = null;
      this.updateControls();
      const step = now => {
        if (!this.playing) return;
        if (this.lastFrame !== null) {
          this.time = Math.min(this.duration, this.time + (now - this.lastFrame) * SPEEDS[this.speedIndex]);
        }
        this.lastFrame = now;
        this.render();
        this.updateTimeline();
        this.emitView(false);
        if (this.time >= this.duration) {
          this.pause();
        } else {
          this.frame = window.requestAnimationFrame(step);
        }
      };
      this.frame = window.requestAnimationFrame(step);
    }

    pause() {
      if (this.frame) window.cancelAnimationFrame(this.frame);
      this.frame = null;
      if (!this.playing) return;
      this.playing = false;
      this.updateControls();
      this.emitView(true);
    }

    toggle() {
      if (this.playing) this.pause(); else this.play();
    }

    seek(time) {
      this.time = clamp(time, 0, this.duration);
      this.render();
      this.updateTimeline();
      this.emitView(true);
    }

    setSpeed(index) {
      this.speedIndex = index;
      this.updateControls();
    }

    select(index) {
      this.selected = this.selected === index ? null : index;
      this.render();
      this.emitView(true);
    }

    updateControls() {
      this.playButton.innerHTML = '<i class="material-icons">' + (this.playing ? 'pause' : 'play_arrow') + '</i>';
      this.playButton.title = this.playing ? 'Pause (space)' : 'Play (space)';
      this.speedButtons.forEach((node, index) => node.classList.toggle('uk-active', index === this.speedIndex));
      this.updateTimeline();
    }

    updateTimeline() {
      const percent = (100 * this.time / this.duration) + '%';
      this.progress.style.width = percent;
      this.head.style.left = percent;
      this.clock.textContent = formatTime(this.time, true) + ' / ' + formatTime(this.duration);
    }

    /* ---------------------------------------------------------------- state */

    // where an actor is at the current time, or null when it is not there
    placeOf(actor, time) {
      if (time < actor.start || time > actor.end || !actor.x.length) return null;
      const at = clamp((time - actor.sample_start) / this.interval, 0, actor.x.length - 1);
      const index = Math.floor(at), next = Math.min(index + 1, actor.x.length - 1), f = at - index;
      const place = {
        x: actor.x[index] + (actor.x[next] - actor.x[index]) * f,
        y: actor.y[index] + (actor.y[next] - actor.y[index]) * f,
        facing: actor.facing && actor.facing.length ? lerpAngle(actor.facing[index], actor.facing[next], f) : null,
      };
      return place;
    }

    // a target's defiance bar (percent) while it is up, or null
    breakbarOf(target, time) {
      if (!target.breakbar_active || !within(target.breakbar_active, time) || within(target.dead, time)) return null;
      return valueAt(target.breakbar, time, 100);
    }

    stateOf(actor, time) {
      if (within(actor.dc, time)) return 'dc';
      if (within(actor.dead, time)) return 'dead';
      if (within(actor.down, time)) return 'down';
      return 'alive';
    }

    // the state of players (by party) and targets, for the panel next to the map
    view() {
      const time = this.time;
      const parties = {};
      this.players.forEach(player => {
        const state = this.stateOf(player, time);
        const buffs = [];
        Object.keys(player.buffs || {}).forEach(code => {
          const stacks = valueAt(player.buffs[code], time, 0);
          if (stacks > 0) buffs.push({code: code, stacks: stacks});
        });
        buffs.sort((a, b) => (a.code in this.buffRank ? this.buffRank[a.code] : 999) -
                             (b.code in this.buffRank ? this.buffRank[b.code] : 999));
        const party = player.party || 0;
        (parties[party] = parties[party] || {party: party, colour: partyColour(party), players: []}).players.push({
          index: player.index,
          name: player.name,
          private: !!player.private,
          spec: player.spec,
          state: state,
          health: state === 'dead' ? 0 : valueAt(player.health, time, 100),
          barrier: state === 'dead' ? 0 : valueAt(player.barrier, time, 0),
          buffs: buffs,
          selected: this.selected === player.index,
        });
      });
      const targets = this.targets.filter(target => time >= target.start && time <= target.end).map(target => {
        const state = this.stateOf(target, time);
        return {
          index: target.index,
          name: target.name,
          state: state,
          health: state === 'dead' ? 0 : valueAt(target.health, time, 100),
          breakbar: this.breakbarOf(target, time),
          selected: this.selected === target.index,
        };
      });
      return {
        time: time,
        parties: Object.keys(parties).sort((a, b) => a - b).map(party => parties[party]),
        targets: targets,
      };
    }

    emitView(now) {
      if (!this.options.onView) return;
      const clock = performance.now();
      if (!now && clock - this.lastViewAt < VIEW_INTERVAL_MS) return;
      this.lastViewAt = clock;
      this.options.onView(this.view());
    }

    /* -------------------------------------------------------------- drawing */

    render() {
      const context = this.context, size = this.size;
      context.fillStyle = COLOURS.background;
      context.fillRect(0, 0, size.width, size.height);

      const corner = this.toScreen(this.world.minX, this.world.maxY);
      const width = this.world.width * this.scale, height = this.world.height * this.scale;
      if (this.mapImage && this.mapImage.complete && this.mapImage.naturalWidth) {
        context.imageSmoothingQuality = 'high';
        context.drawImage(this.mapImage, corner.x, corner.y, width, height);
      } else {
        context.strokeStyle = '#3D3852';
        context.lineWidth = 1;
        context.strokeRect(corner.x, corner.y, width, height);
      }

      const time = this.time;
      const placed = [];
      this.targets.forEach(target => {
        const place = this.placeOf(target, time);
        if (!place || this.stateOf(target, time) === 'dead') return;
        placed.push(this.drawTarget(target, place));
      });
      if (this.selected !== null && this.actors[this.selected].kind === 'player') {
        this.drawTrail(this.actors[this.selected], time);
      }
      // the selected player last, so it is on top
      const players = this.players.slice().sort((a, b) => (a.index === this.selected) - (b.index === this.selected));
      players.forEach(player => {
        const place = this.placeOf(player, time);
        const state = this.stateOf(player, time);
        if (!place || state === 'dc') return;
        placed.push(this.drawPlayer(player, place, state));
      });
      this.placed = placed;

      const hovered = placed.find(item => item.actor.index === this.hovered);
      if (hovered) this.drawLabel(hovered);
    }

    radius(inches, min, max) {
      return clamp(inches * this.scale, min, max);
    }

    drawFacing(screen, radius, facing, colour) {
      if (facing === null) return;
      const angle = facing * Math.PI / 180;
      // world angles are counter-clockwise with y up; the canvas has y down
      const dx = Math.cos(angle), dy = -Math.sin(angle);
      const tip = radius + Math.max(6, radius * 0.6);
      const context = this.context;
      context.beginPath();
      context.moveTo(screen.x + dx * tip, screen.y + dy * tip);
      context.lineTo(screen.x + dx * radius - dy * radius * 0.45, screen.y + dy * radius + dx * radius * 0.45);
      context.lineTo(screen.x + dx * radius + dy * radius * 0.45, screen.y + dy * radius - dx * radius * 0.45);
      context.closePath();
      context.fillStyle = colour;
      context.fill();
    }

    drawPlayer(player, place, state) {
      const context = this.context;
      const screen = this.toScreen(place.x, place.y);
      const radius = this.radius(26, 10, 22);
      const colour = state === 'dead' ? COLOURS.dead : state === 'down' ? COLOURS.down : partyColour(player.party);
      const icon = this.icons[player.spec];

      context.save();
      if (state === 'dead') context.globalAlpha = 0.55;
      if (state === 'alive') this.drawFacing(screen, radius, place.facing, colour);
      context.beginPath();
      context.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
      context.fillStyle = '#2b273a';
      context.fill();
      if (icon && icon.complete && icon.naturalWidth) {
        context.save();
        context.clip();
        if (state === 'dead') context.filter = 'grayscale(1)';
        context.drawImage(icon, screen.x - radius, screen.y - radius, radius * 2, radius * 2);
        context.restore();
      }
      context.lineWidth = Math.max(2, radius * 0.2);
      context.strokeStyle = colour;
      context.stroke();
      if (this.selected === player.index) {
        context.beginPath();
        context.arc(screen.x, screen.y, radius + context.lineWidth + 2, 0, 2 * Math.PI);
        context.lineWidth = 2;
        context.strokeStyle = COLOURS.selected;
        context.stroke();
      }
      context.restore();
      return {actor: player, x: screen.x, y: screen.y, radius: radius};
    }

    drawTarget(target, place) {
      const context = this.context;
      const screen = this.toScreen(place.x, place.y);
      const main = target === this.mainTarget;
      const radius = main ? this.radius(70, 14, 36) : this.radius(30, 7, 16);
      this.drawFacing(screen, radius, place.facing, COLOURS.target);
      context.beginPath();
      context.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
      context.fillStyle = main ? 'rgba(191, 63, 71, 0.85)' : 'rgba(191, 63, 71, 0.65)';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = this.selected === target.index ? COLOURS.selected : COLOURS.targetEdge;
      context.stroke();
      const breakbar = this.breakbarOf(target, this.time);
      if (breakbar !== null) this.drawBreakbar(screen, radius, breakbar);
      return {actor: target, x: screen.x, y: screen.y, radius: radius};
    }

    // the defiance bar under a target, while it is up
    drawBreakbar(screen, radius, percent) {
      const context = this.context;
      const width = Math.max(32, radius * 2.2), height = 5;
      const x = screen.x - width / 2, y = screen.y + radius + 5;
      context.fillStyle = 'rgba(21, 20, 30, 0.9)';
      context.fillRect(x - 1, y - 1, width + 2, height + 2);
      context.fillStyle = COLOURS.breakbar;
      context.fillRect(x, y, width * clamp(percent, 0, 100) / 100, height);
    }

    drawTrail(player, time) {
      const context = this.context;
      const from = Math.max(player.start, time - TRAIL_MS);
      context.save();
      context.strokeStyle = partyColour(player.party);
      context.lineWidth = 2;
      context.setLineDash([4, 4]);
      context.globalAlpha = 0.7;
      context.beginPath();
      let first = true;
      for (let t = from; t <= time; t += this.interval) {
        const place = this.placeOf(player, t);
        if (!place) continue;
        const screen = this.toScreen(place.x, place.y);
        if (first) context.moveTo(screen.x, screen.y); else context.lineTo(screen.x, screen.y);
        first = false;
      }
      context.stroke();
      context.restore();
    }

    drawLabel(item) {
      const context = this.context;
      const actor = item.actor;
      const text = actor.name || 'Private player';
      context.font = '600 13px "Source Sans Pro", sans-serif';
      const width = context.measureText(text).width + 12;
      const x = clamp(item.x - width / 2, 2, this.size.width - width - 2);
      const y = Math.max(2, item.y - item.radius - 28);
      context.fillStyle = 'rgba(43, 39, 58, 0.92)';
      context.fillRect(x, y, width, 22);
      context.fillStyle = COLOURS.text;
      context.textBaseline = 'middle';
      context.fillText(text, x + 6, y + 11);
    }

    /* ---------------------------------------------------------------- input */

    actorAt(x, y) {
      // the topmost (last drawn) actor under the pointer
      for (let i = (this.placed || []).length - 1; i >= 0; i--) {
        const item = this.placed[i];
        const reach = item.radius + 3;
        if ((item.x - x) * (item.x - x) + (item.y - y) * (item.y - y) <= reach * reach) return item.actor;
      }
      return null;
    }

    pointer(event) {
      const box = this.canvas.getBoundingClientRect();
      return {x: event.clientX - box.left, y: event.clientY - box.top};
    }

    onWheel(event) {
      event.preventDefault();
      const point = this.pointer(event);
      const factor = Math.pow(1.0015, -event.deltaY * (event.deltaMode === 1 ? 33 : 1));
      const scale = clamp(this.scale * factor, this.fitScale, this.fitScale * MAX_ZOOM);
      this.originX = point.x - (point.x - this.originX) * scale / this.scale;
      this.originY = point.y - (point.y - this.originY) * scale / this.scale;
      this.scale = scale;
      if (scale === this.fitScale) this.fit();
      this.root.classList.add('r-replay-used');
      this.render();
    }

    onMouseDown(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.canvas.focus();
      const point = this.pointer(event);
      this.drag = {x: point.x, y: point.y, originX: this.originX, originY: this.originY, moved: false};
      this.mapBox.classList.add('r-replay-dragging');
    }

    onMouseMove(event) {
      if (this.drag) {
        const point = this.pointer(event);
        const dx = point.x - this.drag.x, dy = point.y - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
        this.originX = this.drag.originX + dx;
        this.originY = this.drag.originY + dy;
        this.root.classList.add('r-replay-used');
        this.render();
      } else if (event.target === this.canvas) {
        const point = this.pointer(event);
        const actor = this.actorAt(point.x, point.y);
        const index = actor ? actor.index : null;
        this.canvas.style.cursor = actor ? 'pointer' : '';
        if (index !== this.hovered) {
          this.hovered = index;
          this.render();
        }
      }
    }

    onMouseUp(event) {
      if (!this.drag) return;
      const drag = this.drag;
      this.drag = null;
      this.mapBox.classList.remove('r-replay-dragging');
      if (!drag.moved) {
        // a click: select what is under the pointer
        const point = this.pointer(event);
        const actor = this.actorAt(point.x, point.y);
        if (actor) this.select(actor.index);
      }
    }

    onKey(event) {
      if (event.key === ' ') {
        this.toggle();
      } else if (event.key === 'ArrowLeft') {
        this.seek(this.time - SKIP_MS);
      } else if (event.key === 'ArrowRight') {
        this.seek(this.time + SKIP_MS);
      } else {
        return;
      }
      event.preventDefault();
    }
  }

  window.RaidarReplay = {Viewer: Viewer, partyColour: partyColour, formatTime: formatTime};
})();
