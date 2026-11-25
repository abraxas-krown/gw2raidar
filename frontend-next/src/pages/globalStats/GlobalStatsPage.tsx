// The Global Stats page (frontend/src/partials/global_stats.html): for an era and an encounter (or a kind of
// encounter), the full group's duration, DPS and damage received, then each archetype's specialisations: their
// DPS and their top boons, at the percentiles chosen to compare.
// URL: /global_stats[/<era>][/area-<id> | /<kind name>] (also under /api/global_stats…)
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Bootstrap } from '../../api/types';
import { IMG, specIcon } from '../../lib/assets';
import { num, perc } from '../../lib/format';
import { pctl } from '../../lib/percentiles';
import { updateSettings, useSettings } from '../../lib/settings';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { AreaMenu } from '../../ui/AreaMenu';
import { Button, cx, Icon } from '../../ui/controls';
import { Dropdown } from '../../ui/Dropdown';
import dropdownStyles from '../../ui/Dropdown.module.css';
import { Loader } from '../../ui/Loader';
import { useToast } from '../../ui/Toast';
import { useTooltip } from '../../ui/Tooltip';
import styles from './GlobalStats.module.css';

const DEFAULT_STATS_PAGE = 'All raid bosses';
const PAGE_URL = /^\/(?:api\/)?global_stats(?:\/([0-9]+))?(?:\/(?:area-)?([0-9]+|[A-Za-z ]+))?\/?$/;
const COMPARE = [99, 90, 80, 70, 60, 50, 30];
const ARCHETYPES = [1, 2, 5];

interface Stat {
  [key: string]: number | string | Stat | undefined;
}

interface Era {
  id: number;
  name: string;
  started_at: number;
}

interface GlobalStats {
  eras: Record<string, Era>;
  stats: {
    group?: Stat;
    individual?: Stat;
    // profession -> elite -> archetype -> stats
    build?: Record<string, Record<string, Record<string, Stat>>>;
  };
}

export const globalStatsURL = (eraId: string | null, statsPage: string) =>
  '/global_stats' + (eraId ? `/${eraId}` : '') + (Number(statsPage) > 0 ? `/area-${statsPage}` : `/${statsPage}`);

const n = (value: unknown) => (typeof value === 'number' ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

// "4:05"
function formatTimeShort(seconds: number | undefined): string {
  if (seconds === undefined || Number.isNaN(seconds)) return '';
  const whole = Math.trunc(seconds);
  const minutes = Math.trunc(whole / 60);
  const rest = whole - minutes * 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function GlobalStatsPage() {
  const bootstrap = useBootstrap();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const notify = useToast();
  const { compareGlobalPerc } = useSettings();

  const match = PAGE_URL.exec(decodeURIComponent(pathname));
  const eraId = match?.[1] ?? null;
  const statsPage = match?.[2] ?? DEFAULT_STATS_PAGE;

  const query = useQuery({
    queryKey: ['global_stats', eraId, statsPage],
    queryFn: async () => (await api.globalStats(eraId, statsPage)).global_stats as GlobalStats,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  React.useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 404) notify('There is no such era', 'danger');
  }, [query.error, notify]);

  const data = query.data;
  const eraOrder = React.useMemo(
    () => Object.values(data?.eras ?? {}).sort((a, b) => b.started_at - a.started_at),
    [data],
  );

  // the compared percentiles: at least one, highest first
  const toggleCompare = (p: number) => updateSettings(s => {
    const list = s.compareGlobalPerc.includes(p)
      ? s.compareGlobalPerc.filter(q => q !== p)
      : [...s.compareGlobalPerc, p].sort((a, b) => b - a);
    return list.length ? { ...s, compareGlobalPerc: list } : s;
  });

  return (
    <div>
      <div className={styles.top}>
        <div className={styles.menu}>
          <AreaMenu
            bootstrap={bootstrap}
            selected={statsPage}
            onSelect={area => navigate(globalStatsURL(eraId, area))}
            entry={area => ({ href: globalStatsURL(eraId, area) })}
          />
        </div>
        <ComparePercentiles selected={compareGlobalPerc} onToggle={toggleCompare} />
      </div>

      <div className={styles.timeFrame}>
        <h6 className={styles.smallTitle}>Time Frame</h6>
        <Dropdown
          toggle={(open, setOpen) => (
            <Button onClick={() => setOpen(!open)}>
              {eraId ? data?.eras[eraId]?.name : 'Most recent'}<Icon name="expand_more" />
            </Button>
          )}
        >
          {close => (
            <ul className={dropdownStyles.nav}>
              {eraOrder.map(era => (
                <li key={era.id}>
                  <button type="button" onClick={() => { navigate(globalStatsURL(String(era.id), statsPage)); close(); }}>
                    {era.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dropdown>
      </div>

      {query.isPending ? <Loader /> : data && (
        <>
          <h2 className={styles.headingLine}><span>Full Group</span></h2>
          <GroupStats group={data.stats.group ?? {}} compare={compareGlobalPerc} />
          {ARCHETYPES.map(archetype => (
            <ArchetypeStats
              key={archetype}
              archetype={archetype}
              stats={data.stats}
              compare={compareGlobalPerc}
              combined={!(Number(statsPage) > 0)}
              bootstrap={bootstrap}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ---- the percentiles to compare: any of them, at least one

interface ComparePercentilesProps {
  selected: number[];
  onToggle: (percentile: number) => void;
}

function ComparePercentiles({ selected, onToggle }: ComparePercentilesProps) {
  const pc = usePercentile();
  return (
    <div className={cx(styles.compare, 'show-m')}>
      <h6 className={styles.smallTitle}>Compare Percentile</h6>
      {COMPARE.map(p => {
        const badge = pc(p, styles.badge);
        return (
          <button
            key={p}
            type="button"
            aria-pressed={selected.includes(p)}
            className={cx(styles.compareChoice, selected.includes(p) && styles.chosen)}
            onClick={() => onToggle(p)}
          >
            <span className={badge.className} style={badge.style}>{perc(p, 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- bars at the compared percentiles, one under the other, their values next to them

interface PercentileBarsProps {
  compare: number[];
  // the values at a percentile: the bar, and the fainter one behind it (none for one bar)
  value: (p: number) => number;
  behind?: (p: number) => number;
  max: number;
  // the bars' tooltips and value texts
  tooltip: (p: number) => React.ReactNode;
  text: (p: number) => string;
  // texts start at the bar's end when it is short
  flipShort?: boolean;
  // nudges the texts of the middle bars to the right, in percent
  nudge?: number;
}

function PercentileBars({ compare, value, behind, max, tooltip: content, text, flipShort, nudge = 0.5 }: PercentileBarsProps) {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const width = (v: number) => (max ? (100 * v) / max : 0);
  const TEXT: React.CSSProperties = { fontFamily: 'var(--font-body)', fill: 'var(--c-text)' };
  return (
    <svg className="chart" xmlns="http://www.w3.org/2000/svg" height={`${24 + compare.length * 12}px`} width="100%" preserveAspectRatio="xMinYMax meet">
      {compare.map((p, i) => {
        const front = width(value(p));
        const textX = behind ? width(behind(p)) : front;
        const short = flipShort && textX < 25;
        const y = 14 + i * 12;
        let label: React.ReactNode;
        if (i === 0) {
          label = <text x={`${textX}%`} y={`${10 + i * 12}px`} dominantBaseline="alphabetic" textAnchor={short ? 'start' : 'end'} style={TEXT} fontSize="11">{text(p)}</text>;
        } else if (i < compare.length - 1) {
          label = <text x={`${textX + nudge}%`} y={`${18 + i * 12}px`} dominantBaseline="middle" textAnchor="start" style={TEXT} fontSize="11">{text(p)}</text>;
        } else {
          label = <text x={`${textX}%`} y={`${24 + i * 12}px`} dominantBaseline="hanging" textAnchor={short ? 'start' : 'end'} style={TEXT} fontSize="11">{text(p)}</text>;
        }
        return (
          <React.Fragment key={p}>
            {behind && (
              <rect {...pc(p, 'chart chart-hover')} x="0%" y={`${y}px`} height="8px" width={`${width(behind(p))}%`} opacity="0.3"
                {...tooltip(content(p), { pos: 'bottom-left', delay: 350 })} />
            )}
            <rect {...pc(p, 'chart chart-hover')} x="0%" y={`${y}px`} height="8px" width={`${front}%`}
              {...tooltip(content(p), { pos: 'bottom-left', delay: 350 })} />
            {label}
          </React.Fragment>
        );
      })}
    </svg>
  );
}

// ---- the full group: how long the fights took, its DPS and the damage it took

interface GroupStatsProps {
  group: Stat;
  compare: number[];
}

function GroupStats({ group, compare }: GroupStatsProps) {
  const pc = usePercentile();
  const duration = React.useMemo(() => pctl(str(group.per_duration)), [group]);
  const dps = React.useMemo(() => pctl(str(group.per_dps)), [group]);
  const bossDps = React.useMemo(() => pctl(str(group.per_dps_boss)), [group]);
  const received = React.useMemo(() => pctl(str(group.per_dps_received)), [group]);

  return (
    <div className={cx(styles.container, styles.group)}>
      <div className={cx(styles.row, styles.header, 'show-l')}>
        <div>Duration</div>
        <div>DPS</div>
        <div>DPS Recieved</div>
      </div>
      <div className={styles.row}>
        {group.per_duration ? (
          <>
            <div className={styles.duration}>
              <h6 className={cx(styles.cellTitle, 'hide-l')}>Duration</h6>
              {compare.map(p => {
                const item = pc(p, styles.durationItem);
                return <div key={p} className={item.className} style={item.style}>{formatTimeShort(duration[100 - p])}</div>;
              })}
            </div>
            <div className={styles.damage}>
              <h6 className={cx(styles.cellTitle, 'm-0', 'hide-l')}>Damage Per Second</h6>
              <PercentileBars
                compare={compare}
                max={n(group.max_dps)}
                behind={p => dps[p]}
                value={p => bossDps[p]}
                tooltip={p => <><h5>Total | Boss | {p}th Percentile</h5>({num(bossDps[p], 0)}) {num(dps[p], 0)} Damage Per Second</>}
                text={p => `(${num(bossDps[p], 0)}) ${num(dps[p], 0)}`}
              />
            </div>
            <div className={styles.damageIn}>
              <h6 className={cx(styles.cellTitle, 'hide-l')}>DPS Recieved</h6>
              <PercentileBars
                compare={compare}
                max={n(group.max_dps_received)}
                value={p => received[100 - p]}
                tooltip={p => <><h5>Received | {p}th Percentile</h5>{num(received[100 - p], 0)} Damage Per Second</>}
                text={p => num(received[100 - p], 0)}
                nudge={1}
              />
            </div>
          </>
        ) : (
          <div className={styles.damage}>Not enough data to display for group statistics</div>
        )}
      </div>
    </div>
  );
}

// ---- an archetype's specialisations, best boss DPS (99th percentile) first

// how far to trust a specialisation's figures, by how many logs they come from
function confidence(count: number, combined: boolean): { icon: string; tone: string; title: string; text: string } {
  if (combined) {
    return { icon: 'info', tone: 'warning', title: 'Medium Confidence Level',
      text: `Statistics that combine multiple encounters may be heavily skewed by the fact that different classes are used at different bosses, regardless of sample size (${count})` };
  }
  if (count >= 200) {
    return { icon: 'stars', tone: 'success', title: 'High Confidence Level',
      text: `This indicates a large sample size (${count}) and the statistics shown should be an accurate representation.` };
  }
  if (count >= 50) {
    return { icon: 'info', tone: 'warning', title: 'Medium Confidence Level',
      text: `This indicates a moderate sample size (${count}) and the statistics are probably a good representation but could contain some outliers that are skewing numbers up or down.` };
  }
  return { icon: 'cancel', tone: 'danger', title: 'Low Confidence Level',
    text: `This indicates a small sample size (${count}) there is enough data to be shown (more than 10 logs) but it's probably heavily skewed by outliers.` };
}

// the boons a specialisation gives most of (helpers.highestBuffs): by average output, weighted by importance
const BUFF_IMPORTANCE: Record<string, number> = {
  might: 80, fury: 10, quickness: 25, alacrity: 15, protection: 15, retaliation: 5, resolution: 5,
  aegis: 25, resist: 15, stab: 8, vigor: 15,
};

function highestBuffs(buffsOut: Stat | undefined): { name: string; percentiles: Float32Array }[] {
  if (!buffsOut) return [];
  return Object.keys(buffsOut)
    .filter(key => key.startsWith('max_'))
    .map(key => key.slice(4))
    .map(name => ({
      name,
      percentiles: pctl(str(buffsOut[`per_${name}`])),
      importance: (BUFF_IMPORTANCE[name] ?? 1) * n(buffsOut[`avg_${name}`]),
    }))
    .filter(buff => buff.importance >= 500)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
}

interface ArchetypeStatsProps {
  archetype: number;
  stats: GlobalStats['stats'];
  compare: number[];
  // stats over several encounters (a kind's "all" page)
  combined: boolean;
  bootstrap: Bootstrap;
}

function ArchetypeStats({ archetype, stats, compare, combined, bootstrap }: ArchetypeStatsProps) {
  const rows = React.useMemo(() => {
    const found: { profession: string; elite: string; stat: Stat; dps: Float32Array; bossDps: Float32Array }[] = [];
    Object.entries(stats.build ?? {}).forEach(([profession, elites]) => {
      Object.entries(elites ?? {}).forEach(([elite, archetypes]) => {
        const stat = archetypes?.[String(archetype)];
        if (profession === 'All' || elite === 'All' || !stat || !('count' in stat)) return;
        found.push({ profession, elite, stat, dps: pctl(str(stat.per_dps)), bossDps: pctl(str(stat.per_dps_boss)) });
      });
    });
    return found.sort((a, b) => (b.bossDps[99] ?? 0) - (a.bossDps[99] ?? 0));
  }, [stats, archetype]);
  const name = bootstrap.archetypes[String(archetype)];
  const maxDps = n(stats.individual?.max_dps);

  return (
    <>
      <h2 className={styles.headingLine}><span>{name}</span></h2>
      <div className={styles.container}>
        <div className={cx(styles.row, styles.header, 'show-l')}>
          <div />
          <div>Damage Per Second</div>
          <div>Buffs</div>
        </div>
        {rows.length ? rows.map(row => (
          <SpecRow key={`${row.profession}-${row.elite}`} {...row} compare={compare} combined={combined} maxDps={maxDps} bootstrap={bootstrap} />
        )) : (
          <div className={styles.row}>
            <div className={styles.damage}>Not enough data to display for {name} specialisations</div>
          </div>
        )}
      </div>
    </>
  );
}

interface SpecRowProps {
  profession: string;
  elite: string;
  stat: Stat;
  dps: Float32Array;
  bossDps: Float32Array;
  compare: number[];
  combined: boolean;
  maxDps: number;
  bootstrap: Bootstrap;
}

function SpecRow({ profession, elite, stat, dps, bossDps, compare, combined, maxDps, bootstrap }: SpecRowProps) {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const spec = bootstrap.specialisations[profession]?.[elite];
  const level = confidence(n(stat.count), combined);
  const buffs = highestBuffs(stat.buffs_out as Stat | undefined);

  return (
    <div className={styles.row}>
      <div className={styles.spec}>
        <div>
          <h6 className={styles.profession}>{bootstrap.specialisations[profession]?.['0']}</h6>
          <h5 className={cx('m-0', 'help')} {...tooltip(<><h5>{level.title}</h5>{level.text}</>, { pos: 'bottom-left', delay: 350 })}>
            <Icon name={level.icon} className={cx(styles.indicator, `text-${level.tone}`)} />&nbsp;{spec}
          </h5>
        </div>
        <img alt={spec} src={specIcon(spec, 48)} />
      </div>
      <div className={styles.damage}>
        <h6 className={cx(styles.cellTitle, 'm-0', 'hide-l')}>Damage Per Second</h6>
        <PercentileBars
          compare={compare}
          max={maxDps}
          behind={p => dps[p]}
          value={p => bossDps[p]}
          tooltip={p => <><h5>Total | Boss | {p}th Percentile</h5>({num(bossDps[p], 0)}) {num(dps[p], 0)} Damage Per Second</>}
          text={p => `(${num(bossDps[p], 0)}) ${num(dps[p], 0)}`}
          flipShort
        />
      </div>
      <div className={cx(styles.buffs, styles.buffContainer)}>
        <h6 className={cx(styles.cellTitle, 'm-0', 'hide-l')}>Buffs</h6>
        {Array.from({ length: 5 }, (_, i) => buffs[i]).map((buff, i) => (
          <div key={buff?.name ?? i} className={styles.buff}>
            {buff && (
              <>
                <div className={styles.buffIcon}>
                  <img src={`${IMG}buff/${buff.name}.png`} alt={buff.name} width="20" />
                </div>
                {compare.map(p => {
                  const pretty = buff.name.replace('_', ' ');
                  const stacks = buff.name === 'might';
                  const number = pc(p, cx(styles.buffNumber, 'chart-hover'));
                  const content = stacks
                    ? <><h5>{pretty} Stacks | {p}th Percentile</h5>Average output of {num(buff.percentiles[p], 0)} stacks of {pretty}</>
                    : <><h5>{pretty} Uptime | {p}th Percentile</h5>Average output of {num(buff.percentiles[p], 0)}% {pretty} uptime</>;
                  return (
                    <div key={p} className={number.className} style={number.style} {...tooltip(content, { pos: 'bottom-left', delay: 350 })}>
                      {num(buff.percentiles[p], 0)}{!stacks && <sup>%</sup>}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
