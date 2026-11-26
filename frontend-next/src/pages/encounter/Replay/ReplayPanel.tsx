// The panel next to the map: the bosses, then the players by party, then the other targets, as they are at the
// replay's time. It follows the clock a few times a second.
import * as React from 'react';
import { specIcon } from '../../../lib/assets';
import { num } from '../../../lib/format';
import { uiStore, useUiState, type ReplayShow } from '../../../lib/uiState';
import { Button, CommanderTag, cx } from '../../../ui/controls';
import { buildView, type BuffLookup, type PreparedReplay, VIEW_INTERVAL_MS } from './model';
import type { ActorState, ViewBuff, ViewTarget } from './types';
import { useThrottledTime, type ClockStore } from './usePlayback';
import styles from './Replay.module.css';

const STATE_CLASS: Record<ActorState, string | undefined> = {
  alive: undefined,
  down: styles.down,
  dead: styles.dead,
  dc: styles.dc,
};

const STATE_TEXT: Partial<Record<ActorState, string>> = { dead: 'Dead', down: 'Downed', dc: 'Disconnected' };

function toggle(path: [keyof ReplayShow, string]) {
  uiStore.set(state => {
    const group = state.replayShow[path[0]] as Record<string, boolean>;
    return { ...state, replayShow: { ...state.replayShow, [path[0]]: { ...group, [path[1]]: !group[path[1]] } } };
  });
}

interface TogglesProps {
  group: keyof ReplayShow;
  items: [string, string, string][];
}

function Toggles({ group, items }: TogglesProps) {
  const show = useUiState().replayShow[group] as Record<string, boolean>;
  return (
    <div className={styles.toggles}>
      {items.map(([key, label, what]) => (
        <Button
          key={key}
          variant="default"
          small
          className={styles.toggle}
          title={`${show[key] ? 'Hide' : 'Show'} ${what}`}
          aria-pressed={show[key]}
          onClick={() => toggle([group, key])}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

interface BuffListProps {
  buffs: ViewBuff[];
  conditions?: boolean;
}

function BuffList({ buffs, conditions }: BuffListProps) {
  return (
    <div className={cx(styles.buffs, conditions && styles.conditions)}>
      {buffs.map(buff => (
        <span key={buff.code} className={styles.buff} title={buff.name + (buff.stacks > 1 ? ` (${buff.stacks})` : '')}>
          <img src={buff.icon} alt={buff.name} />
          {buff.stacks > 1 && <span className={styles.buffStacks}>{buff.stacks}</span>}
        </span>
      ))}
    </div>
  );
}

interface TargetProps {
  target: ViewTarget;
  show: { boons: boolean; conditions: boolean };
  onSelect: (index: number) => void;
}

function Target({ target, show, onSelect }: TargetProps) {
  return (
    <div
      className={cx(styles.unit, styles.target, STATE_CLASS[target.state], target.selected && styles.selected)}
      onClick={() => onSelect(target.index)}
    >
      <div className={styles.unitBody}>
        <div className={styles.unitLine}>
          <span className={cx(styles.unitName, 'truncate')}>{target.name}</span>
          <span className={styles.unitValue}>{target.state === 'dead' ? 'Dead' : `${num(target.health, 1)}%`}</span>
        </div>
        <div className={styles.bar}><div className={styles.barFill} style={{ width: `${target.health}%` }} /></div>
        {target.breakbar != null && (
          // the defiance bar, while it is up, right under the HP bar; 0 is a broken bar
          <div className={cx(styles.bar, styles.breakbar)} title={`Defiance bar ${Math.round(target.breakbar)}%`}>
            <div className={styles.barFill} style={{ width: `${target.breakbar}%` }} />
          </div>
        )}
        {show.boons && target.buffs.length > 0 && <BuffList buffs={target.buffs} />}
        {show.conditions && target.conditions.length > 0 && <BuffList buffs={target.conditions} conditions />}
      </div>
    </div>
  );
}

const TARGET_TOGGLES: [string, string, string][] = [['boons', 'Boons', 'boons and buffs'], ['conditions', 'Condis', 'conditions']];
const PLAYER_TOGGLES: [string, string, string][] = [['dps', 'DPS', 'boss and total DPS'], ...TARGET_TOGGLES];

export interface ReplayPanelProps {
  replay: PreparedReplay;
  clock: ClockStore;
  selected: number | null;
  buffs: BuffLookup;
  onSelect: (index: number) => void;
}

export function ReplayPanel({ replay, clock, selected, buffs, onSelect }: ReplayPanelProps) {
  const show = useUiState().replayShow;
  const time = useThrottledTime(clock, VIEW_INTERVAL_MS);
  const view = React.useMemo(() => buildView(replay, time, selected, buffs), [replay, time, selected, buffs]);

  return (
    <div className={styles.side}>
      {view.bosses.length > 0 && (
        <div className={styles.group}>
          <div className={styles.sectionHead}>
            <h6 className={styles.groupTitle}>{view.bosses.length > 1 ? 'Bosses' : 'Boss'}</h6>
            <Toggles group="bosses" items={TARGET_TOGGLES} />
          </div>
          {view.bosses.map(target => <Target key={target.index} target={target} show={show.bosses} onSelect={onSelect} />)}
        </div>
      )}

      {view.parties.length > 0 && (
        <div className={cx(styles.sectionHead, styles.playersHead)}>
          <h6 className={styles.groupTitle}>Players</h6>
          <Toggles group="players" items={PLAYER_TOGGLES} />
        </div>
      )}
      {view.parties.map(party => (
        <div key={party.party} className={styles.group}>
          <h6 className={styles.groupTitle}>
            <span className={styles.swatch} style={{ backgroundColor: party.colour }} />Party {party.party}
          </h6>
          {party.players.map(player => (
            <div
              key={player.index}
              className={cx(styles.unit, STATE_CLASS[player.state], player.selected && styles.selected)}
              onClick={() => onSelect(player.index)}
            >
              {player.spec && <img className={styles.spec} src={specIcon(player.spec, 48)} alt={player.spec} title={player.spec} />}
              <div className={styles.unitBody}>
                <div className={styles.unitLine}>
                  {player.private ? (
                    <span className="private" data-text="PRIVATE">PRIVATE</span>
                  ) : (
                    <span className={cx(styles.unitName, 'truncate')}>{player.commander && <CommanderTag />}{player.name}</span>
                  )}
                  <span className={styles.unitValue}>{STATE_TEXT[player.state] ?? `${Math.round(player.health)}%`}</span>
                </div>
                <div
                  className={styles.bar}
                  title={`Health ${Math.round(player.health)}%${player.barrier ? `, barrier ${Math.round(player.barrier)}%` : ''}`}
                >
                  {/* health, then barrier after it; with more barrier than missing health, the two share the bar */}
                  <div className={styles.barFill} style={{ width: `${player.bar.health}%` }} />
                  {player.barrier > 0 && (
                    <div className={styles.barBarrier} style={{ left: `${player.bar.health}%`, width: `${player.bar.barrier}%` }} />
                  )}
                </div>
                {show.players.dps && (
                  // boss DPS, and total DPS behind it, so far in the fight; the squad's highest total fills the bar
                  <div className={styles.dps} title={`Boss DPS ${num(player.dps.boss, 0)}, total DPS ${num(player.dps.total, 0)}`}>
                    <div className={styles.dpsTotal} style={{ width: `${player.dps.totalWidth}%` }} />
                    <div className={styles.dpsBoss} style={{ width: `${player.dps.bossWidth}%` }} />
                    <span className={styles.dpsText}>{player.dps.text}</span>
                  </div>
                )}
                {show.players.boons && <BuffList buffs={player.buffs} />}
                {show.players.conditions && <BuffList buffs={player.conditions} conditions />}
              </div>
            </div>
          ))}
        </div>
      ))}

      {view.adds.length > 0 && (
        <div className={styles.group}>
          <div className={styles.sectionHead}>
            <h6 className={styles.groupTitle}>Targets</h6>
            <Toggles group="targets" items={TARGET_TOGGLES} />
          </div>
          {view.adds.map(target => <Target key={target.index} target={target} show={show.targets} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}
