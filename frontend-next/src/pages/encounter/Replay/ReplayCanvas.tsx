// The map with the players and targets on it, drawn on a canvas: scroll to zoom, drag to move, double-click to
// show all of it, click to select.
//
// React renders the elements. Drawing is done directly on the canvas from refs: on every tick of the clock, and
// when the selection, the lock or the images change. The camera (zoom and pan), the drag and the hovered actor
// change with every pointer move, so they are refs too, not state.
import * as React from 'react';
import { specIcon } from '../../../lib/assets';
import { cx } from '../../../ui/controls';
import {
  actorName,
  type Actor,
  breakbarOf,
  clamp,
  COLOURS,
  isBoss,
  MAX_ZOOM,
  MIN_MAP_HEIGHT,
  partyColour,
  type Place,
  placeOf,
  type PreparedReplay,
  stateOf,
  TRAIL_MS,
  WINDOW_MARGIN_BOTTOM,
  WINDOW_MARGIN_TOP,
} from './model';
import type { ClockStore } from './usePlayback';
import type { ActorState, ReplayMap } from './types';
import styles from './Replay.module.css';

export interface ReplayCanvasProps {
  replay: PreparedReplay;
  clock: ClockStore;
  selected: number | null;
  // the map follows the selected player or target, centred
  locked: boolean;
  onSelect: (index: number) => void;
  onLockChange: (locked: boolean) => void;
  onToggle: () => void;
  onSkip: (direction: -1 | 1) => void;
  // the element at the top of the window: the map is sized to fit under it, with the controls and timeline
  topElement?: React.RefObject<HTMLElement | null>;
  // SVG maps' colours (the SVG's --c-* names), overriding the map's own
  mapTheme?: Record<string, string>;
}

interface Camera {
  scale: number;
  fitScale: number;
  originX: number;
  originY: number;
}

interface Size {
  width: number;
  height: number;
}

// an actor as drawn, for finding what is under the pointer
interface Placed {
  actor: Actor;
  x: number;
  y: number;
  radius: number;
}

interface Drag {
  x: number;
  y: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export function ReplayCanvas({
  replay, clock, selected, locked, onSelect, onLockChange, onToggle, onSkip, topElement, mapTheme,
}: ReplayCanvasProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const camera = React.useRef<Camera>({ scale: 1, fitScale: 1, originX: 0, originY: 0 });
  const size = React.useRef<Size | null>(null);
  const placed = React.useRef<Placed[]>([]);
  const hovered = React.useRef<number | null>(null);
  const drag = React.useRef<Drag | null>(null);
  const [dragging, setDragging] = React.useState(false);
  // the hint fades once the map has been zoomed or moved
  const [used, setUsed] = React.useState(false);

  const mapImage = useMapImage(replay.data.map, mapTheme);
  const icons = useSpecIcons(replay.players);

  // what drawing reads, current as of the last render; the lock is turned off here at once when a drag ends it
  const latest = React.useRef({ replay, selected, locked, mapImage, icons });
  React.useLayoutEffect(() => {
    latest.current = { replay, selected, locked, mapImage, icons };
  });

  const world = replay.world;
  const toScreen = (x: number, y: number) => {
    const { originX, originY, scale } = camera.current;
    return { x: originX + (x - world.minX) * scale, y: originY + (world.maxY - y) * scale };
  };
  const toWorld = (x: number, y: number) => {
    const { originX, originY, scale } = camera.current;
    return { x: world.minX + (x - originX) / scale, y: world.maxY - (y - originY) / scale };
  };
  const fittingScale = (s: Size) => Math.min(s.width / world.width, s.height / world.height);
  const fit = () => {
    const s = size.current!;
    const scale = fittingScale(s);
    camera.current = {
      scale,
      fitScale: scale,
      originX: (s.width - world.width * scale) / 2,
      originY: (s.height - world.height * scale) / 2,
    };
  };

  const draw = () => {
    const context = canvas.current?.getContext('2d');
    const s = size.current;
    if (!context || !s) return;
    const { replay, selected, locked, mapImage, icons } = latest.current;
    const time = clock.get().time;
    if (locked && selected !== null) {
      // put the selected player or target in the middle of the map; while they are not there, the view stays
      const place = placeOf(replay, replay.actors[selected], time);
      if (place) {
        const { scale } = camera.current;
        camera.current.originX = s.width / 2 - (place.x - world.minX) * scale;
        camera.current.originY = s.height / 2 - (world.maxY - place.y) * scale;
      }
    }
    const scene: Scene = { context, scale: camera.current.scale, selected, toScreen };

    context.fillStyle = COLOURS.background;
    context.fillRect(0, 0, s.width, s.height);
    const corner = toScreen(world.minX, world.maxY);
    const width = world.width * scene.scale, height = world.height * scene.scale;
    if (mapImage) {
      context.imageSmoothingQuality = 'high';
      context.drawImage(mapImage, corner.x, corner.y, width, height);
    } else {
      context.strokeStyle = '#3D3852';
      context.lineWidth = 1;
      context.strokeRect(corner.x, corner.y, width, height);
    }

    const drawn: Placed[] = [];
    replay.targets.forEach(target => {
      const place = placeOf(replay, target, time);
      if (!place || stateOf(target, time) === 'dead') return;
      drawn.push(drawTarget(scene, target, place, isBoss(replay, target), breakbarOf(target, time)));
    });
    if (selected !== null && replay.actors[selected].kind === 'player') {
      drawTrail(scene, replay, replay.actors[selected], time);
    }
    // the selected player last, so it is on top
    const players = replay.players.slice().sort((a, b) => Number(a.index === selected) - Number(b.index === selected));
    players.forEach(player => {
      const place = placeOf(replay, player, time);
      const state = stateOf(player, time);
      if (!place || state === 'dc') return;
      drawn.push(drawPlayer(scene, player, place, state, player.spec ? icons[player.spec] : undefined));
    });
    placed.current = drawn;

    const hover = drawn.find(item => item.actor.index === hovered.current);
    if (hover) drawLabel(scene, hover, s.width);
  };

  // The canvas fills the width of its box. With a topElement (the page's tabs), its height is what is left of the
  // window once the top element is at the top and the controls and timeline are at the bottom. Without one, the
  // canvas keeps the map's shape.
  const mapHeight = (width: number) => {
    const top = topElement?.current;
    const map = box.current!;
    if (!top) {
      return Math.round(clamp(width * world.height / world.width, MIN_MAP_HEIGHT,
        Math.max(window.innerHeight - 260, MIN_MAP_HEIGHT)));
    }
    const mapBox = map.getBoundingClientRect();
    const above = mapBox.top - top.getBoundingClientRect().top;
    const below = map.parentElement!.getBoundingClientRect().bottom - mapBox.bottom;
    return Math.round(Math.max(MIN_MAP_HEIGHT,
      window.innerHeight - WINDOW_MARGIN_TOP - above - below - WINDOW_MARGIN_BOTTOM));
  };

  const resize = () => {
    const node = canvas.current, map = box.current;
    if (!node || !map) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(map.clientWidth, 200);
    const height = mapHeight(width);
    const previous = size.current;
    if (previous && previous.width === width && previous.height === height && node.width === Math.round(width * ratio)) {
      return;
    }
    size.current = { width, height };
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.width = Math.round(width * ratio);
    node.height = Math.round(height * ratio);
    node.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (previous) {
      // keep the centre of the view where it was
      const centre = toWorld(previous.width / 2, previous.height / 2);
      const fitScale = fittingScale(size.current);
      const scale = Math.max(camera.current.scale, fitScale);
      camera.current = {
        scale,
        fitScale,
        originX: width / 2 - (centre.x - world.minX) * scale,
        originY: height / 2 - (world.maxY - centre.y) * scale,
      };
    } else {
      fit();
    }
    draw();
  };

  // the latest resize, draw and fit, for the listeners set up once
  const handlers = React.useRef({ resize, draw, fit });
  React.useLayoutEffect(() => {
    handlers.current = { resize, draw, fit };
  });

  // size the canvas before the first paint, then follow the window and the box's width
  React.useLayoutEffect(() => {
    handlers.current.resize();
    const onResize = () => handlers.current.resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(box.current!);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // redraw on every tick of the clock
  React.useEffect(() => clock.subscribe(() => handlers.current.draw()), [clock]);

  // and when what is drawn changes
  React.useEffect(() => {
    handlers.current.draw();
  }, [replay, selected, locked, mapImage, icons]);

  // wheel zoom: React's wheel listeners are passive, and the page must not scroll
  React.useEffect(() => {
    const node = canvas.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const s = size.current;
      if (!s) return;
      // while locked, zoom about the middle, where the locked-on player or target is
      const isLocked = latest.current.locked;
      const point = isLocked ? { x: s.width / 2, y: s.height / 2 } : pointer(node, event);
      const factor = Math.pow(1.0015, -event.deltaY * (event.deltaMode === 1 ? 33 : 1));
      const cam = camera.current;
      const scale = clamp(cam.scale * factor, cam.fitScale, cam.fitScale * MAX_ZOOM);
      cam.originX = point.x - (point.x - cam.originX) * scale / cam.scale;
      cam.originY = point.y - (point.y - cam.originY) * scale / cam.scale;
      cam.scale = scale;
      if (scale === cam.fitScale && !isLocked) handlers.current.fit();
      setUsed(true);
      handlers.current.draw();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // the topmost (last drawn) actor under the pointer
  const actorAt = (x: number, y: number) => {
    for (let i = placed.current.length - 1; i >= 0; i--) {
      const item = placed.current[i];
      const reach = item.radius + 3;
      if ((item.x - x) ** 2 + (item.y - y) ** 2 <= reach * reach) return item.actor;
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const node = event.currentTarget;
    node.focus();
    node.setPointerCapture(event.pointerId);
    const point = pointer(node, event);
    drag.current = { ...point, originX: camera.current.originX, originY: camera.current.originY, moved: false };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const node = event.currentTarget;
    const point = pointer(node, event);
    const current = drag.current;
    if (current) {
      const dx = point.x - current.x, dy = point.y - current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
      // panning away ends the target lock
      if (current.moved && latest.current.locked) {
        latest.current.locked = false;
        onLockChange(false);
      }
      camera.current.originX = current.originX + dx;
      camera.current.originY = current.originY + dy;
      setUsed(true);
      draw();
    } else {
      const actor = actorAt(point.x, point.y);
      const index = actor ? actor.index : null;
      // set on the element: hovering would re-render on every move otherwise
      node.style.cursor = actor ? 'pointer' : '';
      if (index !== hovered.current) {
        hovered.current = index;
        draw();
      }
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    if (!current.moved) {
      // a click: select what is under the pointer
      const point = pointer(event.currentTarget, event);
      const actor = actorAt(point.x, point.y);
      if (actor) onSelect(actor.index);
    }
  };

  const onPointerLeave = () => {
    if (drag.current || hovered.current === null) return;
    hovered.current = null;
    draw();
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    latest.current.locked = false;
    onLockChange(false);
    fit();
    draw();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === ' ') onToggle();
    else if (event.key === 'ArrowLeft') onSkip(-1);
    else if (event.key === 'ArrowRight') onSkip(1);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={box} className={cx(styles.map, dragging && styles.dragging, used && styles.used)}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Replay map: space to play or pause, arrow keys to skip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      />
      <div className={styles.hint}>Scroll to zoom, drag to move, double-click to reset</div>
    </div>
  );
}

function pointer(node: HTMLElement, event: { clientX: number; clientY: number }) {
  const box = node.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

// ---- images

// The SVG's source with the given colours set as --c-* variables on its root (an inline style beats the SVG's own
// theme-* defaults). Colours not given keep the SVG's.
function themedSvg(text: string, colours: Record<string, string> | undefined) {
  if (!colours) return text;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg') return text;
  Object.entries(colours).forEach(([key, colour]) => {
    if (/^[a-z]+$/.test(key)) (root as unknown as SVGElement).style.setProperty(`--c-${key}`, colour);
  });
  return new XMLSerializer().serializeToString(root);
}

// The map's image once it has loaded, or null. A map that is an SVG is themed by its --c-* colour variables (see
// the style in the SVG). It is drawn on a canvas, which the page's CSS cannot reach, so the theme is applied to the
// SVG's source before it is loaded as an image. PNG maps are not themed.
function useMapImage(map: ReplayMap | null | undefined, theme: Record<string, string> | undefined) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const url = map?.image;
  const themeKey = theme ? JSON.stringify(theme) : '';
  // a new theme keeps the map shown until the themed one has loaded
  React.useEffect(() => {
    if (!url) return;
    let live = true;
    let objectUrl: string | null = null;
    const load = (src: string) => {
      const loading = new Image();
      loading.onload = () => {
        if (live) setImage(loading);
      };
      loading.src = src;
    };
    if (/\.svg(\?.*)?$/i.test(url)) {
      fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`Map ${url}: ${response.status}`);
          return response.text();
        })
        .then(text => {
          if (!live) return;
          const colours = themeKey ? JSON.parse(themeKey) as Record<string, string> : undefined;
          objectUrl = URL.createObjectURL(new Blob([themedSvg(text, colours)], { type: 'image/svg+xml' }));
          load(objectUrl);
        })
        .catch(() => {
          // without its map, the replay shows the map's outline
        });
    } else {
      load(url);
    }
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, themeKey]);
  return image;
}

// the players' specialisation icons, by specialisation name, as they load
function useSpecIcons(players: Actor[]) {
  const [icons, setIcons] = React.useState<Record<string, HTMLImageElement>>({});
  React.useEffect(() => {
    let live = true;
    new Set(players.map(player => player.spec).filter(Boolean) as string[]).forEach(spec => {
      const image = new Image();
      image.onload = () => {
        if (live) setIcons(loaded => ({ ...loaded, [spec]: image }));
      };
      image.src = specIcon(spec, 48);
    });
    return () => {
      live = false;
    };
  }, [players]);
  return icons;
}

// ---- drawing

interface Scene {
  context: CanvasRenderingContext2D;
  scale: number;
  selected: number | null;
  toScreen: (x: number, y: number) => { x: number; y: number };
}

// a size in world inches on the screen, within limits
const radius = (scene: Scene, inches: number, min: number, max: number) => clamp(inches * scene.scale, min, max);

function drawFacing(scene: Scene, screen: { x: number; y: number }, r: number, facing: number | null, colour: string) {
  if (facing === null) return;
  const angle = facing * Math.PI / 180;
  // world angles are counter-clockwise with y up; the canvas has y down
  const dx = Math.cos(angle), dy = -Math.sin(angle);
  const tip = r + Math.max(6, r * 0.6);
  const context = scene.context;
  context.beginPath();
  context.moveTo(screen.x + dx * tip, screen.y + dy * tip);
  context.lineTo(screen.x + dx * r - dy * r * 0.45, screen.y + dy * r + dx * r * 0.45);
  context.lineTo(screen.x + dx * r + dy * r * 0.45, screen.y + dy * r - dx * r * 0.45);
  context.closePath();
  context.fillStyle = colour;
  context.fill();
}

function drawPlayer(scene: Scene, player: Actor, place: Place, state: ActorState, icon: HTMLImageElement | undefined): Placed {
  const context = scene.context;
  const screen = scene.toScreen(place.x, place.y);
  const r = radius(scene, 26, 10, 22);
  const colour = state === 'dead' ? COLOURS.dead : state === 'down' ? COLOURS.down : partyColour(player.party);

  context.save();
  if (state === 'dead') context.globalAlpha = 0.55;
  if (state === 'alive') drawFacing(scene, screen, r, place.facing, colour);
  context.beginPath();
  context.arc(screen.x, screen.y, r, 0, 2 * Math.PI);
  context.fillStyle = '#2b273a';
  context.fill();
  if (icon) {
    context.save();
    context.clip();
    if (state === 'dead') context.filter = 'grayscale(1)';
    context.drawImage(icon, screen.x - r, screen.y - r, r * 2, r * 2);
    context.restore();
  }
  context.lineWidth = Math.max(2, r * 0.2);
  context.strokeStyle = colour;
  context.stroke();
  if (scene.selected === player.index) {
    const ring = r + context.lineWidth + 2;
    context.beginPath();
    context.arc(screen.x, screen.y, ring, 0, 2 * Math.PI);
    context.lineWidth = 2;
    context.strokeStyle = COLOURS.selected;
    context.stroke();
    // the ring covers the base of the facing pointer: point from the ring too, in its colour
    if (state === 'alive') drawFacing(scene, screen, ring, place.facing, COLOURS.selected);
  }
  context.restore();
  return { actor: player, x: screen.x, y: screen.y, radius: r };
}

function drawTarget(scene: Scene, target: Actor, place: Place, boss: boolean, breakbar: number | null): Placed {
  const context = scene.context;
  const screen = scene.toScreen(place.x, place.y);
  const r = boss ? radius(scene, 70, 14, 36) : radius(scene, 30, 7, 16);
  drawFacing(scene, screen, r, place.facing, COLOURS.target);
  context.beginPath();
  context.arc(screen.x, screen.y, r, 0, 2 * Math.PI);
  context.fillStyle = boss ? 'rgba(191, 63, 71, 0.85)' : 'rgba(191, 63, 71, 0.65)';
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = scene.selected === target.index ? COLOURS.selected : COLOURS.targetEdge;
  context.stroke();
  if (breakbar !== null) drawBreakbar(scene, screen, r, breakbar);
  return { actor: target, x: screen.x, y: screen.y, radius: r };
}

// the defiance bar under a target, while it is up
function drawBreakbar(scene: Scene, screen: { x: number; y: number }, r: number, percent: number) {
  const context = scene.context;
  const width = Math.max(32, r * 2.2), height = 5;
  const x = screen.x - width / 2, y = screen.y + r + 5;
  context.fillStyle = 'rgba(21, 20, 30, 0.9)';
  context.fillRect(x - 1, y - 1, width + 2, height + 2);
  context.fillStyle = COLOURS.breakbar;
  context.fillRect(x, y, width * clamp(percent, 0, 100) / 100, height);
}

function drawTrail(scene: Scene, replay: PreparedReplay, player: Actor, time: number) {
  const context = scene.context;
  const from = Math.max(player.start, time - TRAIL_MS);
  context.save();
  context.strokeStyle = partyColour(player.party);
  context.lineWidth = 2;
  context.setLineDash([4, 4]);
  context.globalAlpha = 0.7;
  context.beginPath();
  let first = true;
  for (let t = from; t <= time; t += replay.interval) {
    const place = placeOf(replay, player, t);
    if (!place) continue;
    const screen = scene.toScreen(place.x, place.y);
    if (first) context.moveTo(screen.x, screen.y);
    else context.lineTo(screen.x, screen.y);
    first = false;
  }
  context.stroke();
  context.restore();
}

function drawLabel(scene: Scene, item: Placed, canvasWidth: number) {
  const context = scene.context;
  const text = actorName(item.actor);
  context.font = '600 13px "Source Sans Pro", sans-serif';
  const width = context.measureText(text).width + 12;
  const x = clamp(item.x - width / 2, 2, canvasWidth - width - 2);
  const y = Math.max(2, item.y - item.radius - 28);
  context.fillStyle = 'rgba(43, 39, 58, 0.92)';
  context.fillRect(x, y, width, 22);
  context.fillStyle = COLOURS.text;
  context.textBaseline = 'middle';
  context.fillText(text, x + 6, y + 11);
}
