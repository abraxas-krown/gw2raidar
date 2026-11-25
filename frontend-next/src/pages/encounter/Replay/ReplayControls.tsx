// The playback controls under the map: restart, back, play/pause, forward, the clock, the speed, and the target
// lock on the far right
import * as React from 'react';
import { Button, ButtonGroup, Icon } from '../../../ui/controls';
import { formatTime, SPEEDS } from './model';
import { skipLength, useClockValue, type ClockStore, type Playback } from './usePlayback';
import styles from './Replay.module.css';

export interface ReplayControlsProps {
  playback: Playback;
  duration: number;
  // the name of the selected player or target, or null when there is none
  selectedName: string | null;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
}

interface ControlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
}

function ControlButton({ icon, className, ...props }: ControlButtonProps) {
  return (
    <Button variant="default" small className={className ? `${styles.button} ${className}` : styles.button} {...props}>
      <Icon name={icon} className={styles.icon} />
    </Button>
  );
}

export function ReplayControls({ playback, duration, selectedName, locked, onLockChange }: ReplayControlsProps) {
  const { clock, speedIndex } = playback;
  const playing = useClockValue(clock, state => state.playing);
  const speed = SPEEDS[speedIndex];
  const seconds = skipLength(speedIndex) / 1000;
  const at = speed === 1 ? '' : ` (5 seconds at ${speed}×)`;
  const lockTitle = selectedName === null
    ? 'Select a player or target to lock onto'
    : locked ? `Stop following ${selectedName}` : `Lock onto ${selectedName}`;

  return (
    <div className={styles.controls}>
      <ButtonGroup>
        <ControlButton icon="replay" title="Restart" onClick={() => playback.seek(0)} />
        <ControlButton icon="replay_5" title={`Back ${seconds} seconds${at} (←)`} onClick={() => playback.skip(-1)} />
        <ControlButton
          icon={playing ? 'pause' : 'play_arrow'}
          title={playing ? 'Pause (space)' : 'Play (space)'}
          onClick={playback.toggle}
        />
        <ControlButton icon="forward_5" title={`Forward ${seconds} seconds${at} (→)`} onClick={() => playback.skip(1)} />
      </ButtonGroup>
      <ClockText clock={clock} duration={duration} />
      {/* the current speed after the clock, then slower and faster */}
      <span className={styles.speed} title="Playback speed">{speed}×</span>
      <ButtonGroup>
        <ControlButton
          icon="keyboard_double_arrow_left"
          title="Slower"
          disabled={speedIndex === 0}
          onClick={() => playback.setSpeed(speedIndex - 1)}
        />
        <ControlButton
          icon="keyboard_double_arrow_right"
          title="Faster"
          disabled={speedIndex === SPEEDS.length - 1}
          onClick={() => playback.setSpeed(speedIndex + 1)}
        />
      </ButtonGroup>
      {/* the target lock (a crosshair with a dot); double-clicking the map shows all of it */}
      <ControlButton
        icon="my_location"
        className={styles.lock}
        title={lockTitle}
        disabled={selectedName === null}
        aria-pressed={locked}
        onClick={() => onLockChange(!locked)}
      />
    </div>
  );
}

interface ClockTextProps {
  clock: ClockStore;
  duration: number;
}

// re-renders on every frame while playing, on its own
function ClockText({ clock, duration }: ClockTextProps) {
  // tenths of a second are all the clock shows
  const tenths = useClockValue(clock, state => Math.floor(state.time / 100));
  return <div className={styles.clock}>{formatTime(tenths * 100, true)} / {formatTime(duration)}</div>;
}
