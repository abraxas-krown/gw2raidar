// The timeline under the controls: the fight's phases (click one to jump to it), and the track with the time
// played, the players' downs and deaths, and a head to drag
import * as React from 'react';
import { cx } from '../../../ui/controls';
import { actorName, clamp, formatTime, type PreparedReplay } from './model';
import { useClockValue, type Playback } from './usePlayback';
import styles from './Replay.module.css';

export interface ReplayTimelineProps {
  replay: PreparedReplay;
  playback: Playback;
}

const percent = (time: number, duration: number) => `${100 * time / duration}%`;

export function ReplayTimeline({ replay, playback }: ReplayTimelineProps) {
  const { duration } = replay;
  const [hover, setHover] = React.useState<number | null>(null);
  // while the head is dragged: whether to play again when it is let go
  const scrub = React.useRef<{ wasPlaying: boolean } | null>(null);

  // the top level phases, as EI shows them over its timeline
  const phases = React.useMemo(
    () => replay.data.phases.filter(phase => phase.name !== 'All' && !phase.parent),
    [replay],
  );
  // downs and deaths of the players
  const marks = React.useMemo(() => replay.players.flatMap(player => (['down', 'dead'] as const).flatMap(key =>
    (player[key] || []).map(([start]) => ({
      key: `${player.index}-${key}-${start}`,
      start,
      dead: key === 'dead',
      title: `${actorName(player)}${key === 'dead' ? ' died' : ' went down'} at ${formatTime(start)}`,
    })))), [replay]);

  const fraction = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - box.left) / box.width, 0, 1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { wasPlaying: playback.clock.get().playing };
    playback.pause();
    playback.seek(duration * fraction(event));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const at = fraction(event);
    setHover(at);
    if (scrub.current) playback.seek(duration * at);
  };

  const onPointerUp = () => {
    if (!scrub.current) return;
    if (scrub.current.wasPlaying) playback.play();
    scrub.current = null;
  };

  return (
    <div className={styles.timeline}>
      <div className={styles.phases}>
        {phases.map((phase, index) => (
          <div
            key={`${phase.name}-${phase.start}`}
            className={cx(styles.phase, index % 2 ? styles.phaseOdd : styles.phaseEven)}
            style={{ left: percent(phase.start, duration), width: percent(phase.end - phase.start, duration) }}
            title={`${phase.name} (${formatTime(phase.start)} – ${formatTime(phase.end)})`}
            onClick={() => playback.seek(phase.start)}
          >
            {phase.name}
          </div>
        ))}
      </div>
      <div
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Progress playback={playback} duration={duration} />
        {marks.map(mark => (
          <div
            key={mark.key}
            className={cx(styles.mark, mark.dead ? styles.markDead : styles.markDown)}
            style={{ left: percent(mark.start, duration) }}
            title={mark.title}
          />
        ))}
        <Head playback={playback} duration={duration} />
        {hover !== null && (
          <div className={styles.hoverTime} style={{ left: `${100 * hover}%` }}>{formatTime(duration * hover)}</div>
        )}
      </div>
    </div>
  );
}

interface PositionProps {
  playback: Playback;
  duration: number;
}

// the time played; these two re-render on every frame while playing, on their own
function Progress({ playback, duration }: PositionProps) {
  const time = useClockValue(playback.clock, state => state.time);
  return <div className={styles.progress} style={{ width: percent(time, duration) }} />;
}

function Head({ playback, duration }: PositionProps) {
  const time = useClockValue(playback.clock, state => state.time);
  return <div className={styles.head} style={{ left: percent(time, duration) }} />;
}
