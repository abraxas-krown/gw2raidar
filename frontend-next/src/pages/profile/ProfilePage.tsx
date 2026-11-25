// The Personal Stats page (frontend/src/partials/profile.html): for an era and an encounter the user has played,
// how much they were up, and per archetype the specialisations they played: how often, how long they were
// downed or dead, and their DPS against everyone's, with a graph of it over their encounters.
// URL: /profile[/<era>]
import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/endpoints';
import type { Bootstrap } from '../../api/types';
import { archetypeIcon, encounterIcon, IMG, specIcon } from '../../lib/assets';
import { num, perc, th } from '../../lib/format';
import { bsearch, pctl } from '../../lib/percentiles';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { AreaMenu, areaLabel } from '../../ui/AreaMenu';
import { Badge, Button, cx, Icon, ModeTag } from '../../ui/controls';
import { Dropdown } from '../../ui/Dropdown';
import dropdownStyles from '../../ui/Dropdown.module.css';
import { Loader } from '../../ui/Loader';
import { useToast } from '../../ui/Toast';
import { useTooltip } from '../../ui/Tooltip';
import globalStyles from '../globalStats/GlobalStats.module.css';
import { ProfileGraph, type GraphData } from './ProfileGraph';
import styles from './Profile.module.css';

type Stat = Partial<Record<string, number | string>>;

interface BuildStats {
  count: number;
  actual?: Stat;
  actual_boss?: Stat;
  events?: Stat;
}

// area id -> archetype -> profession -> elite -> stats, with counts at each level
type UserStats = Record<string, Record<string, unknown> & { count: number }>;

interface Profile {
  username: string;
  joined_at: number;
  era: { id: number; name: string; started_at: number; stats: UserStats };
  eras_for_dropdown: { id: number; name: string; started_at: number }[];
}

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const isId = (key: string) => key !== 'count' && key !== '0' && !Number.isNaN(Number(key));

// keys in order, "All" last (helpers.keysWithAllLast)
const keysWithAllLast = (obj: object) =>
  Object.keys(obj).filter(k => k !== 'count').sort((a, b) => {
    const aAll = a === 'All', bAll = b === 'All';
    if (aAll !== bAll) return aAll ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

// the share of the fight the builds of an encounter spent up, downed and dead, weighted by how often they were played
function activityOf(enc: Record<string, unknown>) {
  let combat = 0, down = 0, dead = 0;
  for (const [arch, professions] of Object.entries(enc)) {
    if (!isId(arch)) continue;
    for (const [prof, elites] of Object.entries(professions as Record<string, unknown>)) {
      if (prof === 'count') continue;
      for (const build of Object.values(elites as Record<string, BuildStats>)) {
        const weight = n(build.count);
        combat += weight * n(build.events?.combat_time_avg);
        down += weight * n(build.events?.down_time_avg);
        dead += weight * n(build.events?.dead_time_avg);
      }
    }
  }
  if (!combat) return null;
  return { up: (100 * (combat - down - dead)) / combat, down: (100 * down) / combat, dead: (100 * dead) / combat };
}

export function ProfilePage() {
  const bootstrap = useBootstrap();
  const { era: eraParam } = useParams();
  const navigate = useNavigate();
  const [area, setArea] = React.useState('All raid bosses');

  const query = useQuery({
    queryKey: ['profile', eraParam ?? null],
    queryFn: async () => (await api.profile(eraParam ?? null)).profile as Profile,
    staleTime: 5 * 60 * 1000,
  });
  const profile = query.data;
  if (query.isPending) return <Loader />;
  if (!profile) return null;

  const stats = profile.era.stats;
  const enc = stats[area];
  const eras = [...profile.eras_for_dropdown].sort((a, b) => b.started_at - a.started_at);

  return (
    <div>
      <AreaMenu
        bootstrap={bootstrap}
        selected={area}
        onSelect={setArea}
        entry={id => {
          const count = n(stats[id]?.count);
          // the kinds' "all" entries can always be chosen; bosses only when played
          return { suffix: `(${count})`, disabled: !count && !Number.isNaN(Number(id)) };
        }}
      />

      <div className={styles.timeFrame}>
        <h6 className={globalStyles.smallTitle}>Time Frame</h6>
        <Dropdown toggle={(open, setOpen) => <Button onClick={() => setOpen(!open)}>{profile.era.name} <Icon name="expand_more" /></Button>}>
          {close => (
            <ul className={dropdownStyles.nav}>
              {eras.map(era => (
                <li key={era.id}>
                  <button type="button" onClick={() => { navigate(`/profile/${era.id}`); close(); }}>{era.name}</button>
                </li>
              ))}
            </ul>
          )}
        </Dropdown>
      </div>

      {enc && <EncounterStats area={area} enc={enc} eraId={profile.era.id} bootstrap={bootstrap} />}
    </div>
  );
}

interface EncounterStatsProps {
  area: string;
  enc: Record<string, unknown> & { count: number };
  eraId: number;
  bootstrap: Bootstrap;
}

function EncounterStats({ area, enc, eraId, bootstrap }: EncounterStatsProps) {
  const notify = useToast();
  const [iconHidden, setIconHidden] = React.useState(false);
  const [graph, setGraph] = React.useState<{ title: string; statName: string; data: GraphData } | null>(null);
  const load = useMutation({ mutationFn: api.profileGraph });
  const activity = activityOf(enc);
  const info = bootstrap.areas[area];

  // the graph of a stat of a build (or of all builds of an archetype, …)
  const openGraph = (archetype: string, profession: string, elite: string, stat: string, statName: string) => {
    const archetypeName = archetype === 'All' ? '' : bootstrap.archetypes[archetype] + ' ';
    const who = profession === 'All' ? `All ${archetypeName}specialisations'` : archetypeName + bootstrap.specialisations[profession]?.[elite];
    load.mutate({ era: eraId, area, archetype, profession, elite, stat }, {
      onSuccess: data => setGraph({ title: `${who} ${statName} on ${areaLabel(bootstrap, area)}`, statName, data: data as GraphData }),
      onError: error => notify(error.message, 'danger'),
    });
  };

  const badges = activity && (
    <>
      <Badge bold tone="success" className={styles.badge}>Alive {perc(activity.up)}</Badge>
      <Badge bold className={cx(styles.badge, styles.warning)}>Downed {perc(activity.down)}</Badge>
      {/* the primary colour, as the current site shows it (its uk-label-error has no style) */}
      <Badge bold>Dead {perc(activity.dead)}</Badge>
    </>
  );

  return (
    <>
      {Number.isNaN(Number(area)) ? (
        <>
          <h2>{area}</h2>
          {badges}
        </>
      ) : (
        <div className={styles.media}>
          <img
            width="70"
            src={encounterIcon(info?.icon)}
            alt={info?.name}
            style={iconHidden ? { visibility: 'hidden' } : undefined}
            onError={() => setIconHidden(true)}
          />
          <div>
            <h2 className={styles.title}>{info?.name} <ModeTag mode={info?.tag} /></h2>
            {badges}
          </div>
        </div>
      )}

      {Object.entries(enc).filter(([key]) => isId(key)).map(([archetypeId, archetype]) => {
        const builds = archetype as Record<string, unknown> & { count: number };
        const name = bootstrap.archetypes[archetypeId];
        return (
          <React.Fragment key={archetypeId}>
            <h2 className={globalStyles.headingLine}>
              <span><img alt={name} src={archetypeIcon(name)} /> {name}</span>
            </h2>
            <h6 className={styles.played}>
              Archetype played {perc(enc.count ? (100 * n(builds.count)) / enc.count : 0)} of encounters.
            </h6>
            <div className={styles.grid}>
              {keysWithAllLast(builds).flatMap(professionId => {
                const elites = builds[professionId] as Record<string, BuildStats>;
                return keysWithAllLast(elites).filter(eliteId => eliteId !== 'All').map(eliteId => (
                  <BuildCard
                    key={`${professionId}-${eliteId}`}
                    stats={elites[eliteId]}
                    spec={bootstrap.specialisations[professionId]?.[eliteId]}
                    onGraph={(stat, statName) => openGraph(archetypeId, professionId, eliteId, stat, statName)}
                  />
                ));
              })}
            </div>
          </React.Fragment>
        );
      })}

      {graph && <ProfileGraph title={graph.title} statName={graph.statName} graph={graph.data} onClose={() => setGraph(null)} />}
    </>
  );
}

interface BuildCardProps {
  stats: BuildStats;
  spec?: string;
  onGraph: (stat: string, statName: string) => void;
}

// A specialisation the user played: how often, time downed and dead, and total and boss DPS
function BuildCard({ stats, spec, onGraph }: BuildCardProps) {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const dpsPoints = React.useMemo(() => pctl(str(stats.actual?.dps_perc)), [stats]);
  const bossPoints = React.useMemo(() => pctl(str(stats.actual_boss?.dps_perc)), [stats]);
  const overallMax = dpsPoints[99] || 1;
  const combat = n(stats.events?.combat_time_avg);
  const downed = combat ? (100 * n(stats.events?.down_time_avg)) / combat : 0;
  const dead = combat ? (100 * n(stats.events?.dead_time_avg)) / combat : 0;

  const chart = (section: Stat | undefined, points: Float32Array, name: string, maxName: string, stat: string) => {
    const avg = n(section?.dps_avg);
    const max = n(section?.dps_max);
    const maxWidth = (100 * max) / overallMax;
    const TEXT: React.CSSProperties = { fontFamily: 'var(--font-body)', fill: 'var(--c-text)' };
    return (
      <svg className="chart" xmlns="http://www.w3.org/2000/svg" height="24px" width="100%">
        <rect
          {...pc(bsearch(avg, points), 'chart chart-hover')}
          x="0%" y="0" height="8px" width={`${maxWidth}%`}
          onClick={() => onGraph(stat, name)}
          {...tooltip(<><h6 className="text-mono text-upper m-0">{maxName}</h6>{num(max, 0)} Damage Per Second. <br /> Click for detailed graph.</>, { pos: 'bottom-left', delay: 350 })}
        />
        <rect
          className="chart chart-hover"
          x="0%" y="0" height="8px" width={`${(100 * avg) / overallMax}%`} opacity="0.15"
          onClick={() => onGraph(stat, name)}
          {...tooltip(<><h6 className="text-mono text-upper m-0">Average {name}</h6>{num(avg, 0)} Damage Per Second.<br /><strong>Performance: </strong>{th(bsearch(avg, points))} Percentile<br />Click for detailed graph.</>, { pos: 'bottom-left', delay: 350 })}
        />
        <text x={`${maxWidth}%`} y="12px" alignmentBaseline="hanging" textAnchor={maxWidth < 25 ? 'start' : 'end'} style={TEXT} fontSize="11">
          ({num(avg, 0)}) {num(max, 0)}
        </text>
      </svg>
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.profession}>
        <img alt={spec} src={specIcon(spec, 48)} />
        <div>
          <h4 className="m-0">{spec}</h4>
          <h6 className={cx(styles.smallMono, 'm-0')}>Encounters: {num(stats.count, 0)}</h6>
        </div>
      </div>

      <div className={styles.activity}>
        <div className="help" {...tooltip(<><h6 className="text-mono text-upper m-0">Downstate</h6>Spent an average of {perc(downed)} of encounter time in down state.</>, { pos: 'bottom-left' })}>
          <img width="18" src={`${IMG}icon/Downed_ally.png`} alt="Time spent in downed state" />
          <span className={styles.activityBadge}>{perc(downed)}</span>
        </div>
        <div className="help" {...tooltip(<><h6 className="text-mono text-upper m-0">Dead</h6>Spent an average of {perc(dead)} of encounter time dead.</>, { pos: 'bottom-left' })}>
          <img width="18" src={`${IMG}icon/Downed_enemy.png`} alt="Time spent dead" />
          <span className={styles.activityBadge}>{perc(dead)}</span>
        </div>
      </div>

      <div className={styles.damage}>
        <h6 className={cx(styles.smallMono, styles.chartTitle)}>Total DPS (Average) Max</h6>
        {chart(stats.actual, dpsPoints, 'DPS', 'Max DPS', 'dps')}
        <h6 className={cx(styles.smallMono, styles.chartTitle)}>Boss DPS (Average) Max</h6>
        {chart(stats.actual_boss, bossPoints, 'Boss DPS', 'Max Boss DPS', 'dps_boss')}
      </div>
    </div>
  );
}
