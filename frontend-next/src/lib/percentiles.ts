// Percentiles: the backend's stored percentile points, where a value falls among them, and the colour that
// shows it (the percentile palettes of frontend/scss/raidar/3-percentiles and 7-percentiles-mixins).
import * as React from 'react';

export type Palette = 'default' | 'rainbow' | 'colorblind';
export const PALETTES: Palette[] = ['default', 'rainbow', 'colorblind'];

// The 1st to 100th percentiles of a stat, as the backend sends them: base64 of 100 little-endian float32s
export function pctl(base64: string | null | undefined): Float32Array {
  if (!base64) return new Float32Array(0);
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

// The percentile (0-100) of a value where higher is better: the share of points at or below it. The value is
// rounded to float32 first, as the points were, so a value equal to them compares as equal. No points give 0.
export function bsearch(value: number | null | undefined, points: Float32Array): number {
  if (!points.length) return 0;
  const needle = Math.fround(Number(value) || 0);
  let low = 0, high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle] <= needle) low = middle + 1; else high = middle;
  }
  return Math.round((100 * low) / points.length);
}

// The percentile (0-100) of a value where lower is better (damage received): the share of points at or above it
export function bsearchLow(value: number | null | undefined, points: Float32Array): number {
  if (!points.length) return 0;
  const needle = Math.fround(Number(value) || 0);
  let low = 0, high = points.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (points[middle] < needle) low = middle + 1; else high = middle;
  }
  return Math.round((100 * (points.length - low)) / points.length);
}

// The point for a percentile (1-100); points[p] as the current frontend reads it
export function pointAt(points: Float32Array, percentile: number): number | undefined {
  return points.length ? points[percentile] : undefined;
}

// ---- colours

// A value not compared to others (party rows), shown in the faded text colour
export const NEUTRAL = 101;

const anchor = (palette: Palette, key: string) => `var(--pctl-${palette}-${key})`;
// Sass's mix($a, $b, $weight): $weight of $a
const mix = (a: string, b: string, weight: number) =>
  `color-mix(in srgb, ${a} ${Math.round(weight * 1000) / 10}%, ${b})`;
// Sass's darken($colour, $amount): the lightness, lowered
const darken = (colour: string, amount: number) => `hsl(from ${colour} h s calc(l - ${amount}))`;
const border = (colour: string, amount = 20) => `1px solid ${darken(colour, amount)}`;

interface Swatch {
  bg: string;
  border?: string;
  color?: string;
  shadow?: string;
}

function swatch(percentile: number, palette: Palette): Swatch {
  if (percentile >= NEUTRAL) {
    return { bg: 'var(--pctl-neutral)', color: 'var(--c-bg)' };
  }
  const n = Math.max(0, Math.min(100, Math.round(percentile)));

  if (palette === 'rainbow') {
    // GW2's item rarities: a colour per band
    const tier = (key: string, extra: Partial<Swatch> = {}, amount = 20): Swatch => {
      const bg = anchor(palette, key);
      return { bg, border: border(bg, amount), ...extra };
    };
    const shadow = (key: string) => `0 0 2px ${darken(anchor(palette, key), 30)}`;
    if (n < 50) return tier('30', { shadow: shadow('30') });
    if (n < 60) return tier('50', { shadow: shadow('50') });
    if (n < 70) return tier('60', { color: 'white' }, 10);
    if (n < 80) return tier('70', { color: darken(anchor(palette, '70'), 40) });
    if (n < 90) return tier('80');
    if (n < 99) return tier('90');
    const legendary = anchor('default', '99');
    return { bg: legendary, border: border(legendary) };
  }

  // default and colorblind: a blend from the 30th to the 80th percentile colour, then on to the 99th
  let bg: string;
  if (n < 29) {
    bg = anchor(palette, '30');
  } else if (n < 59) {
    bg = mix(anchor(palette, '80'), anchor(palette, '30'), (n - 29) / 40);
  } else {
    bg = mix(anchor(palette, '99'), anchor(palette, '80'), (n - 59) / 41);
  }
  const result: Swatch = { bg, border: border(bg) };
  if (palette === 'colorblind' && n >= 80) result.color = 'var(--c-bg)';
  return result;
}

// The style that colours an element with the `pctl` class for a percentile (0-100, or NEUTRAL)
export function percentileStyle(percentile: number, palette: Palette): React.CSSProperties {
  const s = swatch(percentile, palette);
  const style: Record<string, string> = { '--pctl-bg': s.bg };
  if (s.border) style['--pctl-border'] = s.border;
  if (s.color) style['--pctl-color'] = s.color;
  if (s.shadow) style['--pctl-shadow'] = s.shadow;
  return style as React.CSSProperties;
}
