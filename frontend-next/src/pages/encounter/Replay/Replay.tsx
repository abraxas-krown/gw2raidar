// The Replay tab: the encounter replayed on the boss's map, with a timeline and playback controls, and a panel
// of the players and targets next to it.
//
// TODO(replay-rewrite): <Replay> wraps the framework-free viewer of the current frontend, copied unchanged in
// vendor/replay.js (it draws on a canvas and builds its own controls and timeline). It is to be rewritten as a
// React component. Its props are the interface to keep: the rewrite replaces what is in this folder (Replay.tsx,
// vendor/, viewer.d.ts, replay.css), and EncounterPage does not change.
import * as React from 'react';
import { useReplayQuery } from '../../../api/queries';
import type { BuffInfo, BuffTab } from '../../../api/types';
import { IMG, specIcon, specName } from '../../../lib/assets';
import { num } from '../../../lib/format';
import { uiStore, useUiState, type ReplayShow } from '../../../lib/uiState';
import { useBootstrap } from '../../../session/SessionProvider';
import { CommanderTag } from '../../../ui/controls';
import { useEncounterView } from '../EncounterContext';
import type { ReplayData, ReplayView, ViewBuff, Viewer, ViewTarget } from './viewer';
import './vendor/replay.js';
import './replay.css';

export interface ReplayProps {
  // replay/<url_id>.json
  data: ReplayData;
  // the encounter's buff tabs and buffs: the order and the icons of the buffs listed in the panel
  buffTabs: BuffTab[];
  buffs: Record<string, BuffInfo>;
  // a player's specialisation name, for their icon
  specialisation: (profession: number | undefined, elite: number | undefined) => string | undefined;
  // the phase chosen in the phase menu: the replay jumps to its start
  phase?: string;
  // the element at the top of the window while the replay is shown (the encounter's tabs): the map is sized to
  // fit, with its controls and timeline, under it
  topElement?: React.RefObject<HTMLElement | null>;
  // SVG maps' colours (the SVG's --c-* names), overriding the map's own
  mapTheme?: Record<string, string>;
}

const BUFF_TABS = ['boons', 'offensive_buffs', 'support_buffs', 'defensive_buffs'];

export interface ReplayTabProps {
  urlId: string;
  topElement?: React.RefObject<HTMLElement | null>;
}

// The tab as the encounter page shows it: loads the replay, then shows it
export function ReplayTab({ urlId, topElement }: ReplayTabProps) {
  const query = useReplayQuery(urlId);
  const bootstrap = useBootstrap();
  const { encounter, phaseName } = useEncounterView();

  if (!query.data) {
    return (
      <div className="r-replay">
        <div className="r-replay-stage">
          <div className="r-replay-map" />
          <div className="r-replay-message">
            {query.isError ? 'The replay could not be loaded.' : <><span className="r-replay-spinner" /> Loading the replay&hellip;</>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Replay
      data={query.data}
      buffTabs={encounter.buff_tabs}
      buffs={encounter.buffs}
      specialisation={(profession, elite) => specName(bootstrap, profession ?? '', elite ?? '')}
      phase={phaseName}
      topElement={topElement}
    />
  );
}

export function Replay({ data, buffTabs, buffs, specialisation, phase, topElement, mapTheme }: ReplayProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const viewer = React.useRef<Viewer | null>(null);
  const [view, setView] = React.useState<ReplayView | null>(null);
  const show = useUiState().replayShow;

  // the viewer takes over the map, controls and timeline boxes for as long as the data stays the same
  React.useEffect(() => {
    const node = root.current;
    if (!node) return;
    // the buffs of the tabs with these ids, also where the site has merged them into a tab of groups
    const tabOrder = (ids: string[]) => buffTabs.flatMap(tab => tab.groups && tab.groupIds
      ? tab.groups.filter((_, i) => ids.includes(tab.groupIds![i])).flat()
      : ids.includes(tab.id) ? tab.order : []);
    const created = new window.RaidarReplay.Viewer(node, data, {
      staticRoot: IMG,
      topElement: topElement?.current,
      specialisation,
      buffOrder: tabOrder(BUFF_TABS),
      conditionOrder: tabOrder(['conditions']),
      // the replay describes the buffs on targets the encounter's own list lacks; the site's boon icons win
      buffInfo: { ...(data.buffs || {}), ...buffs },
      mapTheme,
      onView: setView,
    });
    viewer.current = created;
    created.scrollIntoView();
    return () => {
      created.destroy();
      viewer.current = null;
      // the viewer leaves the elements it added; a new one starts from empty boxes
      node.querySelectorAll('.r-replay-map, .r-replay-controls, .r-replay-timeline').forEach(box => box.replaceChildren());
    };
    // the viewer is made once per replay; the other props are read when it is made
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // the phase menu jumps to the chosen phase
  React.useEffect(() => {
    const current = viewer.current;
    if (!current || !phase || phase === 'All') return;
    const found = current.data.phases.find(p => p.name === phase);
    if (found) current.seek(found.start);
  }, [phase, data]);

  const select = (index: number) => viewer.current?.select(index);

  return (
    <div className="r-replay" ref={root}>
      <div className="r-replay-stage">
        <div className="r-replay-map" />
        <div className="r-replay-controls" />
        <div className="r-replay-timeline" />
      </div>
      {view && <ReplayPanel view={view} show={show} onSelect={select} />}
    </div>
  );
}

// ---- the panel: bosses, then the players by party, then the other targets

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
    <div className="r-replay-toggles">
      {items.map(([key, label, what]) => (
        <button
          key={key}
          type="button"
          className={`uk-button uk-button-default uk-button-small r-replay-toggle${show[key] ? ' uk-active' : ''}`}
          title={`${show[key] ? 'Hide' : 'Show'} ${what}`}
          aria-pressed={show[key]}
          onClick={() => toggle([group, key])}
        >
          {label}
        </button>
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
    <div className={`r-replay-buffs${conditions ? ' r-replay-conditions' : ''}`}>
      {buffs.map(buff => (
        <span key={buff.code} className="r-replay-buff" title={buff.name + (buff.stacks > 1 ? ` (${buff.stacks})` : '')}>
          <img src={buff.icon} alt={buff.name} />
          {buff.stacks > 1 && <span className="r-replay-buff-stacks">{buff.stacks}</span>}
        </span>
      ))}
    </div>
  );
}

interface TargetProps {
  target: ViewTarget;
  show: { boons: boolean; conditions: boolean };
  onSelect: (i: number) => void;
}

function Target({ target, show, onSelect }: TargetProps) {
  return (
    <div
      className={`r-replay-unit r-replay-target${target.boss ? ' r-replay-boss' : ''} r-replay-${target.state}${target.selected ? ' r-replay-selected' : ''}`}
      onClick={() => onSelect(target.index)}
    >
      <div className="r-replay-unit-body">
        <div className="r-replay-unit-line">
          <span className="r-replay-unit-name truncate">{target.name}</span>
          <span className="r-replay-unit-value">{target.state === 'dead' ? 'Dead' : `${num(target.health, 1)}%`}</span>
        </div>
        <div className="r-replay-bar"><div className="r-replay-bar-fill" style={{ width: `${target.health}%` }} /></div>
        {target.breakbar != null && (
          // the defiance bar, while it is up, right under the HP bar; 0 is a broken bar
          <div className="r-replay-bar r-replay-breakbar" title={`Defiance bar ${Math.round(target.breakbar)}%`}>
            <div className="r-replay-bar-fill" style={{ width: `${target.breakbar}%` }} />
          </div>
        )}
        {show.boons && target.buffs.length > 0 && <BuffList buffs={target.buffs} />}
        {show.conditions && target.conditions.length > 0 && <BuffList buffs={target.conditions} conditions />}
      </div>
    </div>
  );
}

const STATE_TEXT: Record<string, string> = { dead: 'Dead', down: 'Downed', dc: 'Disconnected' };

interface ReplayPanelProps {
  view: ReplayView;
  show: ReplayShow;
  onSelect: (index: number) => void;
}

function ReplayPanel({ view, show, onSelect }: ReplayPanelProps) {
  const targetToggles: [string, string, string][] = [['boons', 'Boons', 'boons and buffs'], ['conditions', 'Condis', 'conditions']];
  return (
    <div className="r-replay-side">
      {view.bosses.length > 0 && (
        <div className="r-replay-group">
          <div className="r-replay-section-head">
            <h6 className="r-replay-group-title">{view.bosses.length > 1 ? 'Bosses' : 'Boss'}</h6>
            <Toggles group="bosses" items={targetToggles} />
          </div>
          {view.bosses.map(target => <Target key={target.index} target={target} show={show.bosses} onSelect={onSelect} />)}
        </div>
      )}

      {view.parties.length > 0 && (
        <div className="r-replay-section-head">
          <h6 className="r-replay-group-title">Players</h6>
          <Toggles group="players" items={[['dps', 'DPS', 'boss and total DPS'], ...targetToggles]} />
        </div>
      )}
      {view.parties.map(party => (
        <div key={party.party} className="r-replay-group">
          <h6 className="r-replay-group-title">
            <span className="r-replay-swatch" style={{ backgroundColor: party.colour }} />Party {party.party}
          </h6>
          {party.players.map(player => (
            <div
              key={player.index}
              className={`r-replay-unit r-replay-${player.state}${player.selected ? ' r-replay-selected' : ''}`}
              onClick={() => onSelect(player.index)}
            >
              {player.spec && <img className="r-replay-spec" src={specIcon(player.spec, 48)} alt={player.spec} title={player.spec} />}
              <div className="r-replay-unit-body">
                <div className="r-replay-unit-line">
                  {player.private ? (
                    <span className="private" data-text="PRIVATE">PRIVATE</span>
                  ) : (
                    <span className="r-replay-unit-name truncate">{player.commander && <CommanderTag />}{player.name}</span>
                  )}
                  <span className="r-replay-unit-value">{STATE_TEXT[player.state] ?? `${Math.round(player.health)}%`}</span>
                </div>
                <div
                  className="r-replay-bar"
                  title={`Health ${Math.round(player.health)}%${player.barrier ? `, barrier ${Math.round(player.barrier)}%` : ''}`}
                >
                  {/* health, then barrier after it; with more barrier than missing health, the two share the bar */}
                  <div className="r-replay-bar-fill" style={{ width: `${player.bar.health}%` }} />
                  {player.barrier > 0 && (
                    <div className="r-replay-bar-barrier" style={{ left: `${player.bar.health}%`, width: `${player.bar.barrier}%` }} />
                  )}
                </div>
                {show.players.dps && (
                  // boss DPS, and total DPS behind it, so far in the fight; the squad's highest total fills the bar
                  <div className="r-replay-dps" title={`Boss DPS ${num(player.dps.boss, 0)}, total DPS ${num(player.dps.total, 0)}`}>
                    <div className="r-replay-dps-total" style={{ width: `${player.dps.totalWidth}%` }} />
                    <div className="r-replay-dps-boss" style={{ width: `${player.dps.bossWidth}%` }} />
                    <span className="r-replay-dps-text">{player.dps.text}</span>
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
        <div className="r-replay-group">
          <div className="r-replay-section-head">
            <h6 className="r-replay-group-title">Targets</h6>
            <Toggles group="targets" items={targetToggles} />
          </div>
          {view.adds.map(target => <Target key={target.index} target={target} show={show.targets} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}
