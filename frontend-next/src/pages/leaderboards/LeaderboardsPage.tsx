// The Leaderboards page (frontend/src/partials/leaderboards.html): the ten fastest kills of each boss, for a kind
// of encounter (raids, fractals, …), an era, and a week of it or the whole era. A boss's card shows its top
// four; chosen, it opens to all ten, with their damage, boons and composition.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../api/endpoints';
import type { Bootstrap } from '../../api/types';
import { encounterIcon, specIcon, specName } from '../../lib/assets';
import { formatDate, formatTime, num, perc } from '../../lib/format';
import { NEUTRAL } from '../../lib/percentiles';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { Button, ButtonGroup, cx, Icon, ModeTag } from '../../ui/controls';
import { Loader } from '../../ui/Loader';
import styles from './Leaderboards.module.css';

interface Line {
  id: number;
  url_id: string;
  duration: number;
  dps: number;
  dps_boss: number;
  buffs: Partial<Record<string, number>>;
  // [archetype, profession, elite] of each player
  comp: [number, number, number][];
  tags: string;
}

interface BossBoards {
  // week start (seconds, as a string) or "Era" -> the fastest kills
  periods: Record<string, Line[]>;
  max_max_dps: number;
}

type Leaderboards = Record<string, BossBoards> & {
  eras: { id: number; name: string }[];
  era: number;
  kind: number;
};

const KINDS = [0, 1, 2];
const BUFFS = ['might', 'fury', 'quickness', 'alacrity'];
// the rank's colour, by place: the percentile colours from the 99th down
const RANK_PERCENTILES = ['99', '90', '80', '70', '60', '50', '40', '30', '30', '30'];

export function LeaderboardsPage() {
  const bootstrap = useBootstrap();
  const [kind, setKind] = React.useState(0);
  const [era, setEra] = React.useState<string>('');
  const [week, setWeek] = React.useState('Era');
  const [open, setOpen] = React.useState<number | null>(null);

  const query = useQuery({
    queryKey: ['leaderboards', kind, era],
    queryFn: async () => (await api.leaderboards(kind, era || null)).leaderboards as Leaderboards,
    staleTime: 5 * 60 * 1000,
  });
  const boards = query.data;
  const location = bootstrap.boss_locations[kind];

  // the weeks any of this kind's bosses has kills in, newest first, then the whole era
  const weeks = React.useMemo(() => {
    if (!boards || !location) return ['Era'];
    const found = new Set<string>();
    location.wings.forEach(wing => wing.bosses.forEach(boss => {
      Object.keys(boards[boss]?.periods ?? {}).forEach(w => { if (w !== 'Era') found.add(w); });
    }));
    return [...Array.from(found).sort((a, b) => Number(b) - Number(a)), 'Era'];
  }, [boards, location]);
  const shownWeek = weeks.includes(week) ? week : 'Era';
  const weekLabel = (w: string) => (w === 'Era' ? 'Era' : formatDate(Number(w), true));

  return (
    <>
      <div className={styles.filters}>
        <h6 className={cx(styles.filterTitle, 'hide-s')}>Encounter Filter</h6>
        <ButtonGroup className={styles.kinds}>
          {KINDS.map(id => bootstrap.boss_locations[id] && (
            <Button
              key={id}
              variant={kind === id ? 'primary' : 'plain'}
              onClick={() => { setKind(id); setOpen(null); }}
            >
              {bootstrap.boss_locations[id].name}
            </Button>
          ))}
        </ButtonGroup>

        <div className={styles.toggles}>
          <label className={styles.custom}>
            <select value={era} onChange={e => setEra(e.target.value)} aria-label="Era">
              <option value="">This Era</option>
              <option disabled>──────────</option>
              {boards?.eras.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
            </select>
            <span className={styles.on}>
              {/* the era shown: the chosen one, or the current one the backend answered with */}
              {boards?.eras.find(e => String(e.id) === (era || String(boards.era)))?.name ?? 'This Era'}
            </span>{' '}
            <Icon name="keyboard_arrow_down" />
          </label>
          {' | '}
          <label className={styles.custom}>
            <select value={shownWeek} onChange={e => setWeek(e.target.value)} aria-label="Week">
              {weeks.map(w => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
            <span className={styles.on}>Fastest Kills</span>{shownWeek !== 'Era' && <> <span className={styles.on}>{weekLabel(shownWeek)}</span></>}{' '}
            <Icon name="keyboard_arrow_down" />
          </label>
        </div>
      </div>

      {query.isPending ? <Loader /> : boards && location?.wings.map(wing => (
        <div key={wing.name} className={styles.wing}>
          <h4 className={styles.heading}>{wing.name}</h4>
          {wing.bosses.map(boss => {
            // a boss without kills in the period still has its card
            const lines = boards[boss]?.periods[shownWeek] ?? [];
            return (
              <BossCard
                key={boss}
                boss={boss}
                lines={lines}
                maxDps={boards[boss]?.max_max_dps ?? 1}
                open={open === boss}
                onOpen={() => setOpen(boss)}
                onClose={() => setOpen(null)}
                bootstrap={bootstrap}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

interface BossCardProps {
  boss: number;
  lines: Line[];
  maxDps: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  bootstrap: Bootstrap;
}

// A boss's fastest kills: its top four, or all ten once opened
function BossCard({ boss, lines, maxDps, open, onOpen, onClose, bootstrap }: BossCardProps) {
  const pc = usePercentile();
  const area = bootstrap.areas[String(boss)];
  const [iconHidden, setIconHidden] = React.useState(false);

  return (
    <div className={cx(styles.encounter, open && styles.expanded)} onClick={open ? undefined : onOpen}>
      <img
        src={encounterIcon(area?.icon)}
        alt={area?.name}
        width="50"
        style={iconHidden ? { visibility: 'hidden' } : undefined}
        onError={() => setIconHidden(true)}
      />
      <h2 className={cx(styles.name, 'truncate')}>{area?.name} <ModeTag mode={area?.tag} /></h2>
      <button
        type="button"
        className={cx(styles.close, !open && 'invisible')}
        aria-label="Close"
        onClick={event => { event.stopPropagation(); onClose(); }}
      >
        <Icon name="close" />
      </button>
      {lines.map((line, index) => (
        <Link
          key={line.id}
          to={`/encounter/${line.url_id}`}
          className={styles.row}
          // a closed card opens on a click; its rows lead to the encounter once it is open
          onClick={event => { if (!open) event.preventDefault(); }}
        >
          <div className={styles.rank} style={{ backgroundColor: `var(--pctl-default-${RANK_PERCENTILES[index] ?? '30'})` }}>
            {index + 1}
          </div>
          <div className={styles.time}>
            <h3>{formatTime(line.duration)}</h3>
            <div className={cx(styles.remaining, 'truncate')}>
              {area?.enrage ? <>{formatTime(area.enrage - line.duration)} remaining{line.tags && ' · '}</> : null}
              {line.tags}
            </div>
          </div>
          <div className={styles.damage}>
            <svg className="chart" width="100%" height="29px" preserveAspectRatio="xMinYMax meet" xmlns="http://www.w3.org/2000/svg">
              <rect {...pc(NEUTRAL, 'chart')} x="0" y="3px" height="24px" width={`${(100 * line.dps) / maxDps}%`} opacity="0.3" />
              <rect {...pc(NEUTRAL, 'chart')} x="0" y="3px" height="24px" width={`${(100 * line.dps_boss) / maxDps}%`} />
            </svg>
            <span className="text-mono">({num(line.dps_boss, 0)}) {num(line.dps, 0)} DPS</span>
          </div>
          <div className={styles.buffs}>
            {BUFFS.map(code => {
              const buff = bootstrap.buffs[code];
              if (!buff) return null;
              const value = line.buffs?.[code];
              const number = pc(NEUTRAL, styles.buffNumber);
              return (
                <div key={code} className={styles.buff}>
                  <div className={styles.buffIcon}><img src={buff.icon} alt={buff.name} width="20" /></div>
                  <div className={number.className} style={number.style}>{buff.stacks ? num(value, 2) : perc(value, 2)}</div>
                </div>
              );
            })}
          </div>
          <div className={styles.composition}>
            {line.comp.map(([archetype, profession, elite], i) => {
              const spec = specName(bootstrap, profession, elite);
              return <img key={i} alt={`${bootstrap.archetypes[String(archetype)]} ${spec}`} src={specIcon(spec, 48)} />;
            })}
          </div>
        </Link>
      ))}
    </div>
  );
}
