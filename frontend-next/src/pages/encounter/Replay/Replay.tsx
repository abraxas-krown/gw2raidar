// The Replay tab: the encounter replayed on the boss's map, with playback controls and a timeline under it, and a
// panel of the players and targets next to it.
//
//   Replay            selection, target lock, playback (usePlayback): the state the parts share
//   ├ stage
//   │ ├ ReplayCanvas    the map, drawn on a canvas from the clock
//   │ ├ ReplayControls  play, skip, speed, lock
//   │ └ ReplayTimeline  phases, downs and deaths, scrubbing
//   └ ReplayPanel     bosses, players by party, other targets
//
// model.ts has the data model; it knows nothing of React or the DOM.
import * as React from 'react';
import { useReplayQuery } from '../../../api/queries';
import type { BuffInfo, BuffTab } from '../../../api/types';
import { specName } from '../../../lib/assets';
import { useBootstrap } from '../../../session/SessionProvider';
import { useEncounterView } from '../EncounterContext';
import { actorName, buffLookup, prepareReplay, WINDOW_MARGIN_TOP } from './model';
import { ReplayCanvas } from './ReplayCanvas';
import { ReplayControls } from './ReplayControls';
import { ReplayPanel } from './ReplayPanel';
import { ReplayTimeline } from './ReplayTimeline';
import type { ReplayData } from './types';
import { usePlayback } from './usePlayback';
import styles from './Replay.module.css';

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
  const specialisation = React.useCallback(
    (profession: number | undefined, elite: number | undefined) => specName(bootstrap, profession ?? '', elite ?? ''),
    [bootstrap],
  );

  if (!query.data) {
    return (
      <div className={styles.replay}>
        <div className={styles.stage}>
          <div className={styles.map} />
          <div className={styles.message}>
            {query.isError
              ? 'The replay could not be loaded.'
              : <><span className={styles.spinner} /> Loading the replay&hellip;</>}
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
      specialisation={specialisation}
      phase={phaseName}
      topElement={topElement}
    />
  );
}

// each replay gets a viewer of its own: another replay starts from the start, with nothing selected and the whole
// map shown
const dataKeys = new WeakMap<ReplayData, number>();
let lastDataKey = 0;
function dataKey(data: ReplayData) {
  let key = dataKeys.get(data);
  if (key === undefined) dataKeys.set(data, key = ++lastDataKey);
  return key;
}

export function Replay(props: ReplayProps) {
  return <ReplayViewer key={dataKey(props.data)} {...props} />;
}

function ReplayViewer({ data, buffTabs, buffs, specialisation, phase, topElement, mapTheme }: ReplayProps) {
  const replay = React.useMemo(() => prepareReplay(data, specialisation), [data, specialisation]);
  const playback = usePlayback(replay.duration);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [locked, setLocked] = React.useState(false);
  const stage = React.useRef<HTMLDivElement>(null);
  const [stageHeight, setStageHeight] = React.useState<number | null>(null);

  const buffInfo = React.useMemo(() => {
    // the buffs of the tabs with these ids, also where the site has merged them into a tab of groups
    const tabOrder = (ids: string[]) => buffTabs.flatMap(tab => tab.groups && tab.groupIds
      ? tab.groups.filter((_, i) => ids.includes(tab.groupIds![i])).flat()
      : ids.includes(tab.id) ? tab.order : []);
    // the replay describes the buffs on targets the encounter's own list lacks; the site's boon icons win
    return buffLookup({ ...(data.buffs || {}), ...buffs }, tabOrder(BUFF_TABS), tabOrder(['conditions']));
  }, [data, buffTabs, buffs]);

  // selecting the selected one again deselects them, which ends the lock; selecting someone else while locked
  // moves the lock to them
  const select = React.useCallback((index: number) => {
    const next = selected === index ? null : index;
    setSelected(next);
    if (next === null) setLocked(false);
  }, [selected]);
  const setLock = React.useCallback((on: boolean) => setLocked(on && selected !== null), [selected]);

  // the phase menu jumps to the chosen phase
  const { seek } = playback;
  React.useEffect(() => {
    if (!phase || phase === 'All') return;
    const found = data.phases.find(p => p.name === phase);
    if (found) seek(found.start);
  }, [phase, data, seek]);

  // scroll the page so the top element is at the top of the window, and with it the map and timeline
  React.useEffect(() => {
    const top = topElement?.current;
    if (!top) return;
    window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - WINDOW_MARGIN_TOP, behavior: 'smooth' });
  }, [topElement]);

  // the panel next to the map is no taller than the map with its controls and timeline, and scrolls
  React.useLayoutEffect(() => {
    const node = stage.current!;
    const observer = new ResizeObserver(() => setStageHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const selectedName = selected === null ? null : actorName(replay.actors[selected]);

  return (
    <div
      className={styles.replay}
      style={stageHeight === null ? undefined : { '--replay-stage-height': `${stageHeight}px` } as React.CSSProperties}
    >
      <div className={styles.stage} ref={stage}>
        <ReplayCanvas
          replay={replay}
          clock={playback.clock}
          selected={selected}
          locked={locked}
          onSelect={select}
          onLockChange={setLock}
          onToggle={playback.toggle}
          onSkip={playback.skip}
          topElement={topElement}
          mapTheme={mapTheme}
        />
        <ReplayControls
          playback={playback}
          duration={replay.duration}
          selectedName={selectedName}
          locked={locked}
          onLockChange={setLock}
        />
        <ReplayTimeline replay={replay} playback={playback} />
      </div>
      <ReplayPanel replay={replay} clock={playback.clock} selected={selected} buffs={buffInfo} onSelect={select} />
    </div>
  );
}
