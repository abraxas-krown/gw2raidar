// Playback: the replay's clock and the controls that move it.
//
// The time changes on every animation frame while the replay plays, so it is kept in a store outside React
// state. The canvas redraws from the store without re-rendering. Small components (the clock, the timeline's
// head) follow it with useClockValue. The panel follows it a few times a second with useThrottledTime.
import * as React from 'react';
import { createStore, type Store } from '../../../lib/store';
import { clamp, DEFAULT_SPEED_INDEX, SKIP_MS, SPEEDS } from './model';

export interface Clock {
  time: number;
  playing: boolean;
}

export type ClockStore = Store<Clock>;

export interface Playback {
  clock: ClockStore;
  speedIndex: number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  // back (-1) or forward (1) by 5 seconds of watching at the current speed
  skip(direction: -1 | 1): void;
  setSpeed(index: number): void;
}

// fight time covered by 5 seconds of playback at a speed
export const skipLength = (speedIndex: number) => SKIP_MS * SPEEDS[speedIndex];

export function usePlayback(duration: number): Playback {
  const [clock] = React.useState(() => createStore<Clock>({ time: 0, playing: false }));
  const [speedIndex, setSpeedIndex] = React.useState(DEFAULT_SPEED_INDEX);
  // the frame loop reads the speed without restarting
  const speed = React.useRef(SPEEDS[speedIndex]);
  const playing = useClockValue(clock, state => state.playing);

  React.useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const { time } = clock.get();
      const next = last === null ? time : Math.min(duration, time + (now - last) * speed.current);
      last = now;
      clock.set({ time: next, playing: next < duration });
      if (next < duration) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, clock, duration]);

  const play = React.useCallback(() => {
    // playing from the end starts again
    clock.set(state => state.playing ? state : { playing: true, time: state.time >= duration ? 0 : state.time });
  }, [clock, duration]);
  const pause = React.useCallback(() => clock.set({ playing: false }), [clock]);
  const toggle = React.useCallback(() => (clock.get().playing ? pause() : play()), [clock, play, pause]);
  const seek = React.useCallback((time: number) => clock.set({ time: clamp(time, 0, duration) }), [clock, duration]);
  const skip = React.useCallback(
    (direction: -1 | 1) => seek(clock.get().time + direction * SKIP_MS * speed.current),
    [clock, seek],
  );
  const setSpeed = React.useCallback((index: number) => {
    const next = clamp(index, 0, SPEEDS.length - 1);
    speed.current = SPEEDS[next];
    setSpeedIndex(next);
  }, []);

  return React.useMemo(
    () => ({ clock, speedIndex, play, pause, toggle, seek, skip, setSpeed }),
    [clock, speedIndex, play, pause, toggle, seek, skip, setSpeed],
  );
}

// One value of the clock; the component re-renders only when it changes. Select a primitive.
export function useClockValue<T>(clock: ClockStore, select: (clock: Clock) => T): T {
  return React.useSyncExternalStore(clock.subscribe, () => select(clock.get()));
}

// The clock's time, at most once per interval while playing; at once after a seek or when playback stops
export function useThrottledTime(clock: ClockStore, interval: number): number {
  const [time, setTime] = React.useState(() => clock.get().time);
  React.useEffect(() => {
    let last = 0;
    setTime(clock.get().time);
    return clock.subscribe(() => {
      const state = clock.get();
      const now = performance.now();
      if (state.playing && now - last < interval) return;
      last = now;
      setTime(state.time);
    });
  }, [clock, interval]);
  return time;
}
