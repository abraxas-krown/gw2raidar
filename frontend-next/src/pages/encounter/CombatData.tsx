// The Overview tab (encounter_combat_data.html): per squad, party and player, their damage, damage received,
// breakbar damage, boons and a few other figures, as bars and values coloured by how they compare (percentiles)
import * as React from 'react';
import type { Member, Party, Performance, Phase, StatBlock } from '../../api/types';
import { clamp, num, perc, th } from '../../lib/format';
import { bsearch, bsearchLow, NEUTRAL } from '../../lib/percentiles';
import { useSettings } from '../../lib/settings';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { badgeClass, cx } from '../../ui/controls';
import { useTooltip } from '../../ui/Tooltip';
import { useEncounterView } from './EncounterContext';
import {
  Bar, Block, BuffCell, Chart, Line, memberRowProps, PartyCell, PlayerCell, SquadCell, SquadLabel, statsStyles as s,
  Tick, TickValue, Value, type Anchor,
} from './rows';
import { buffPoints, memberKey, n, points } from './stats';

type Variant = 'squad' | 'party' | 'member';

interface Scales {
  squadDps: number;
  squadRecv: number;
  playerDps: number;
  playerRecv: number;
}

const ratio = (value: number, scale: number) => clamp((100 * value) / scale);

interface ToggleProps {
  on: 0 | 1;
  labels: [string, string];
  onPick: (index: 0 | 1) => void;
  className?: string;
}

function Toggle({ on, labels, onPick, className }: ToggleProps) {
  return (
    <div className={cx(s.toggle, className)}>
      <button type="button" className={cx(on === 0 && s.on)} onClick={() => onPick(0)}>{labels[0]}</button>
      {' | '}
      <button type="button" className={cx(on === 1 && s.on)} onClick={() => onPick(1)}>{labels[1]}</button>
    </div>
  );
}

interface TitleProps {
  children: React.ReactNode;
  // the first in its cell: no space under it
  first?: boolean;
}

const Title = ({ children, first }: TitleProps) => (
  <h6 className={cx(s.cellTitle, 'hide-l')} style={first ? undefined : { marginBottom: 8 }}>{children}</h6>
);

export function CombatData() {
  const { encounter, phase: squad, dpsBoss, setDpsBoss, breakbarBoss, setBreakbarBoss, boonOutput, setBoonOutput } =
    useEncounterView();
  const bootstrap = useBootstrap();
  const allReceived = n(encounter.phases.All?.received?.total);
  const scales: Scales = {
    squadDps: n(squad.actual?.dps),
    squadRecv: Math.max(n(squad.group?.max_total_received) || allReceived, allReceived),
    playerDps: Math.max(n(squad.individual?.max_dps) || n(encounter.max_player_dps), n(encounter.max_player_dps)),
    playerRecv: Math.max(n(squad.individual?.max_total_received) || n(encounter.max_player_recv), n(encounter.max_player_recv)),
  };
  const order = bootstrap.buff_tabs[0]?.order ?? [];

  const buffs = (stats: StatBlock, variant: Variant) => (
    <div className={s.buffs}>
      {order.map(code => (
        <BuffCell
          key={code}
          code={code}
          buff={bootstrap.buffs[code]}
          value={(boonOutput ? stats.buffs_out : stats.buffs)?.[code] ?? 0}
          points={variant === 'party' ? undefined : buffPoints(stats.performance, boonOutput, code)}
          output={boonOutput}
          neutral={variant === 'party'}
          hideZero={variant === 'member'}
        />
      ))}
    </div>
  );

  const cells = (stats: StatBlock, variant: Variant) => (
    <>
      <div>
        {variant === 'squad' ? <Title first>DPS</Title> : variant === 'member' && <Title>{dpsBoss ? 'Boss DPS' : 'Total DPS'}</Title>}
        <DpsChart variant={variant} stats={stats} squad={squad} scales={scales} />
      </div>
      <div className="show-m">
        <Title>Damage Received</Title>
        <ReceivedChart variant={variant} stats={stats} squad={squad} scales={scales} />
      </div>
      <div className="show-m">
        <Title>{breakbarBoss ? 'Boss Breakbar' : 'Total Breakbar'}</Title>
        <BreakbarChart variant={variant} stats={stats} squad={squad} />
      </div>
      {buffs(stats, variant)}
      {variant === 'party' && <PartyMisc stats={stats} />}
      {variant === 'member' && <MemberMisc stats={stats} />}
    </>
  );

  return (
    <div>
      <Block sticky>
        <div className={cx(s.row, s.header)}>
          <div className="show-l">Spec</div>
          <div>
            <div>Damage</div>
            <Toggle on={dpsBoss ? 0 : 1} labels={['Boss', 'Total']} onPick={i => setDpsBoss(i === 0)} />
          </div>
          <div className="show-l">Damage Received</div>
          <div className="show-l">
            <div>Breakbar</div>
            <Toggle on={breakbarBoss ? 0 : 1} labels={['Boss', 'Total']} onPick={i => setBreakbarBoss(i === 0)} />
          </div>
          <Toggle
            className={s.boonToggle}
            on={boonOutput ? 1 : 0}
            labels={['Uptime', 'Output']}
            onPick={i => setBoonOutput(i === 1)}
          />
          <div className="show-l">Misc</div>
        </div>
      </Block>

      <Block squad index={1}>
        <div className={s.row}>
          <SquadCell />
          {cells(squad, 'squad')}
        </div>
      </Block>

      {Object.entries(squad.parties).map(([partyNo, party]: [string, Party], index) => (
        <Block key={partyNo} index={index + 2}>
          <div className={cx(s.row, s.party)}>
            <PartyCell partyNo={partyNo} count={party.members.length} events={party.events} />
            {cells(party, 'party')}
          </div>
          {party.members.map((member: Member, i) => (
            <div key={memberKey(member, i)} {...memberRowProps(member, encounter.duration)}>
              <PlayerCell member={member} align="m" />
              {cells(member, 'member')}
            </div>
          ))}
        </Block>
      ))}
    </div>
  );
}

// ---- damage

interface DpsChartProps {
  variant: Variant;
  stats: StatBlock;
  squad: Phase;
  scales: Scales;
}

function DpsChart({ variant, stats, squad, scales }: DpsChartProps) {
  const { dpsBoss, setDpsBoss, dpsToggled } = useEncounterView();
  const { comparePerc } = useSettings();
  const scale = variant === 'member' ? scales.playerDps : scales.squadDps;

  const total = n(stats.actual?.dps);
  const boss = n(stats.actual_boss?.dps);
  const dps = dpsBoss ? boss : total;
  const other = dpsBoss ? total : boss;
  const name = dpsBoss ? 'Boss DPS' : 'Total DPS';
  const otherName = dpsBoss ? 'Total DPS' : 'Boss DPS';

  const perf = dpsBoss ? stats.performance?.actual_boss : stats.performance?.actual;
  const pts = points(perf, 'dps_perc');
  const avg = variant === 'party' ? n(dpsBoss ? squad.group?.avg_dps_boss : squad.group?.avg_dps) : n(perf?.dps_avg);
  const best = n(perf?.dps_max);
  const percentile = variant === 'party' ? NEUTRAL : bsearch(dps, pts);

  const width = ratio(dps, scale);
  const otherWidth = ratio(other, scale);
  const tickX = ratio(n(pts[comparePerc]), scale);
  const animate = !dpsToggled;
  const clickMore = <><h5>{otherName}</h5><strong>{num(other, 0)}</strong> DPS.<br />Click for more details.</>;
  const main = (
    <>
      <h5>{name}</h5><strong>{num(dps, 0)}</strong> DPS.
      {variant !== 'party' && <><br /><strong>Performance:</strong> {th(percentile)} Percentile</>}
      {avg > 0 && <><br />This role's average {name} is <strong>{num(avg, 0)}</strong>.</>}
    </>
  );

  let valueX = width;
  let valueAnchor: Anchor;
  if (variant === 'squad') valueAnchor = width > 90 ? 'end' : 'start';
  else if (variant === 'party') { valueX = width < 12 ? 0 : width; valueAnchor = width < 12 ? 'start' : 'end'; }
  else valueAnchor = width < 25 ? 'start' : 'end';
  const tickAnchor: Anchor = variant === 'squad'
    ? (tickX > 90 ? 'end' : 'middle')
    : tickX < 25 ? 'start' : tickX > 80 ? 'end' : 'middle';
  const squadLine = ratio(n(dpsBoss ? squad.actual_boss?.dps : squad.actual?.dps), scale);

  return (
    <Chart>
      {variant === 'squad' && <Line width={100} />}
      {variant === 'member' && <Line width={ratio(best, scale)} />}
      {variant === 'party' && <Line width={squadLine} />}
      {variant !== 'party' && <Tick x={tickX} />}
      {dpsBoss && (
        <Bar width={otherWidth} percentile={percentile} opacity={0.3} animate={animate} tooltip={clickMore} onClick={() => setDpsBoss(false)} />
      )}
      <Bar width={width} percentile={percentile} animate={animate} tooltip={main} />
      {!dpsBoss && (
        <Bar width={otherWidth} opacity={0.15} animate={animate} tooltip={clickMore} onClick={() => setDpsBoss(true)} />
      )}
      {variant === 'party' && <SquadLabel x={squadLine} anchor={squadLine < 25 ? 'start' : 'end'} />}
      <Value x={valueX} anchor={valueAnchor}>{num(dps, 0)}</Value>
      {variant !== 'party' && <TickValue x={tickX} anchor={tickAnchor}>{num(pts[comparePerc], 0)}</TickValue>}
    </Chart>
  );
}

// ---- damage received (lower is better)

interface ReceivedChartProps {
  variant: Variant;
  stats: StatBlock;
  squad: Phase;
  scales: Scales;
}

function ReceivedChart({ variant, stats, squad, scales }: ReceivedChartProps) {
  const { comparePerc } = useSettings();
  const scale = variant === 'member' ? scales.playerRecv : scales.squadRecv;
  const recv = n(stats.received?.total);
  const width = ratio(recv, scale);

  if (variant === 'party') {
    const squadLine = ratio(n(squad.received?.total), scale);
    return (
      <Chart>
        <Line width={squadLine} />
        <rect className="chart pctl" style={{ ['--pctl-bg' as string]: 'var(--pctl-neutral)' }} x="0%" y="16px" height="16px" width={`${width}%`} />
        <SquadLabel x={squadLine} anchor={squadLine < 35 ? 'start' : 'end'} />
        <Value x={width < 35 ? 0 : width} anchor={width < 35 ? 'start' : 'middle'}>{num(recv, 0)}</Value>
      </Chart>
    );
  }

  const perf = stats.performance?.received;
  const pts = points(perf, 'total_perc');
  const percentile = bsearchLow(recv, pts);
  const tickX = ratio(n(pts[100 - comparePerc]), scale);
  const performance = <><br /><strong>Performance:</strong> {th(percentile)} Percentile</>;

  let tooltip: React.ReactNode;
  if (variant === 'squad') {
    const avg = n(squad.group?.avg_total_received);
    tooltip = (
      <>
        <h5>Damage Received</h5><strong>{num(recv, 0)}</strong> damage received and{' '}
        <strong>{num(n(stats.received?.dps), 0)}</strong> per second.
        {avg > 0 && <><br />Squad average is <strong>{num(avg, 0)}</strong> and <strong>{num(n(squad.group?.avg_dps_received), 0)}</strong> per second.</>}
        {performance}
      </>
    );
  } else {
    const avg = n(perf?.total_avg);
    tooltip = (
      <>
        <h5>Damage Received</h5><strong>{num(recv, 0)}</strong> damage received.
        {avg > 0 && <><br />This role's average is <strong>{num(avg, 0)}</strong>.</>}
        {performance}
      </>
    );
  }
  const shield = n(stats.shielded?.total);

  return (
    <Chart>
      <Line width={variant === 'squad' ? 100 : ratio(n(perf?.total_max), scale)} />
      <Tick x={tickX} />
      <Bar width={width} percentile={percentile} tooltip={tooltip} />
      {variant === 'member' && (
        <Bar
          x={ratio(recv - shield, scale)}
          width={ratio(shield, scale)}
          opacity={0.6}
          fill="#FCF1E2"
          tooltip={<><h5>Barrier</h5>Up to <strong>{num(shield, 0)} ({perc(recv ? (100 * shield) / recv : 0)})</strong> damage absorbed by barrier</>}
        />
      )}
      <Value x={width < (variant === 'squad' ? 25 : 35) ? 0 : width} anchor={width < (variant === 'squad' ? 25 : 35) ? 'start' : variant === 'squad' ? 'end' : 'middle'}>
        {num(recv, 0)}
      </Value>
      <TickValue x={tickX} anchor={(variant === 'squad' ? width : tickX) < 25 ? 'start' : 'middle'}>
        {num(pts[100 - comparePerc], 0)}
      </TickValue>
    </Chart>
  );
}

// ---- breakbar damage: against the squad's (squad and parties) or the best player's

interface BreakbarChartProps {
  variant: Variant;
  stats: StatBlock;
  squad: Phase;
}

function BreakbarChart({ variant, stats, squad }: BreakbarChartProps) {
  const { encounter, breakbarBoss, setBreakbarBoss } = useEncounterView();
  const scale = variant === 'member' ? n(encounter.max_player_breakbar) : n(squad.actual?.breakbar);
  const total = n(stats.actual?.breakbar);
  const boss = n(stats.actual_boss?.breakbar);
  const value = breakbarBoss ? boss : total;
  const name = breakbarBoss ? 'Boss Breakbar Damage' : 'Total Breakbar Damage';
  const of = (v: number) => (scale ? ratio(v, scale) : 0);
  const width = of(value);
  const percentile = variant === 'party' ? NEUTRAL : 0;
  const squadLine = of(n(breakbarBoss ? squad.actual_boss?.breakbar : squad.actual?.breakbar));

  return (
    <Chart>
      {variant === 'party' && (
        <>
          <Line width={squadLine} />
          <SquadLabel x={squadLine} anchor={squadLine < 35 ? 'start' : 'end'} />
        </>
      )}
      {breakbarBoss && (
        <Bar
          width={of(total)}
          percentile={percentile}
          opacity={0.3}
          animate={false}
          onClick={() => setBreakbarBoss(false)}
          tooltip={<><h5>Total Breakbar Damage</h5><strong>{num(total, 0)}</strong> damage to all defiance bars.<br />Click for more details.</>}
        />
      )}
      <Bar
        width={width}
        percentile={percentile}
        animate={false}
        tooltip={<><h5>{name}</h5><strong>{num(value, 0)}</strong> damage to {breakbarBoss ? 'the defiance bars of the boss' : 'all defiance bars'}.</>}
      />
      {!breakbarBoss && (
        <Bar
          width={of(boss)}
          opacity={0.15}
          animate={false}
          onClick={() => setBreakbarBoss(true)}
          tooltip={<><h5>Boss Breakbar Damage</h5><strong>{num(boss, 0)}</strong> damage to the defiance bars of the boss.<br />Click for more details.</>}
        />
      )}
      <Value x={width < 35 ? 0 : width} anchor={width < 35 ? 'start' : 'end'}>{num(value, 0)}</Value>
    </Chart>
  );
}

// ---- critical hits, scholar and flanking uptime, barrier

interface MiscBadgeProps {
  letter: string;
  percentile: number;
  tooltip: React.ReactNode;
}

function MiscBadge({ letter, percentile, tooltip: content }: MiscBadgeProps) {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const badge = pc(percentile, badgeClass());
  return <span className={badge.className} style={badge.style} {...tooltip(content, { pos: 'left' })}>{letter}</span>;
}

interface PartyMiscProps {
  stats: StatBlock;
}

function PartyMisc({ stats }: PartyMiscProps) {
  const boss = stats.actual_boss;
  return (
    <div className={cx(s.misc, 'show-l')}>
      <MiscBadge letter="C" percentile={NEUTRAL} tooltip={<>Critical: {perc(100 * n(boss?.crit))}</>} />
      <MiscBadge letter="S" percentile={NEUTRAL} tooltip={<>Scholar Uptime: {perc(100 * n(boss?.scholar))}</>} />
      <MiscBadge letter="F" percentile={NEUTRAL} tooltip={<>Flanking Uptime: {perc(100 * n(boss?.flanking))}</>} />
      <MiscBadge letter="B" percentile={NEUTRAL} tooltip={<>Barrier: {num(n(stats.shielded?.total), 0)}</>} />
    </div>
  );
}

interface MemberMiscProps {
  stats: StatBlock;
}

function MemberMisc({ stats }: MemberMiscProps) {
  const boss = stats.actual_boss;
  const perf: Performance | undefined = stats.performance;
  const shielded = n(stats.shielded?.total);

  const figure = (label: string, value: string, key: 'crit' | 'scholar' | 'flanking') => {
    const percentile = perf ? bsearch(n(boss?.[key]), points(perf.actual_boss, `${key}_perc`)) : 0;
    return {
      percentile,
      tooltip: (
        <>
          <strong>{label}:</strong> {value}
          {perf && <><br /><strong>Average:</strong> {perc(100 * n(perf.actual_boss?.[`${key}_avg`]))}<br /><strong>Performance:</strong> {th(percentile)} Percentile</>}
        </>
      ),
    };
  };
  const crit = figure('Critical', perc(100 * n(boss?.crit)), 'crit');
  const scholar = figure('Scholar Uptime', perc(100 * n(boss?.scholar)), 'scholar');
  const flanking = figure('Flanking Uptime', perc(100 * n(boss?.flanking)), 'flanking');
  const barrierPercentile = perf ? bsearch(shielded, points(perf.shielded, 'total_perc')) : 0;

  return (
    <div className={cx(s.misc, 'show-l')}>
      <MiscBadge letter="C" {...crit} />
      <MiscBadge letter="S" {...scholar} />
      <MiscBadge letter="F" {...flanking} />
      <MiscBadge
        letter="B"
        percentile={barrierPercentile}
        tooltip={
          <>
            <strong>Barrier:</strong> {num(shielded, 0)}
            {perf && <><br /><strong>Average:</strong> {num(n(perf.actual_boss?.shielded?.total_avg), 0)}<br /><strong>Performance:</strong> {th(barrierPercentile)} Percentile</>}
          </>
        }
      />
    </div>
  );
}
