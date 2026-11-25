// The pieces the encounter's tables share: the player and party cells, a buff, and the bar charts' shapes
import * as React from 'react';
import type { BuffInfo, Member, PlayerEvents } from '../../api/types';
import { archetypeIcon, specIcon, specName } from '../../lib/assets';
import { activity, formatTime, perc, th } from '../../lib/format';
import { bsearch, NEUTRAL } from '../../lib/percentiles';
import { useSettings } from '../../lib/settings';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { cx, PlayerName } from '../../ui/controls';
import { useTooltip, type TooltipOptions } from '../../ui/Tooltip';
import { useEncounterView } from './EncounterContext';
import { formatBuff } from './stats';
import styles from './StatsTable.module.css';

const PLAYER_TOOLTIP: TooltipOptions = { pos: 'bottom-left', delay: 350 };

// ---- blocks and rows

export interface BlockProps {
  squad?: boolean;
  sticky?: boolean;
  mechanics?: boolean;
  index?: number;
  children: React.ReactNode;
}

export function Block({ squad, sticky, mechanics, index = 0, children }: BlockProps) {
  return (
    <div
      className={cx(styles.container, squad && styles.squad, sticky && styles.sticky, mechanics && styles.mechanics)}
      style={{ animationDelay: `${Math.min(index + 1, 15) * 40}ms` }}
    >
      {children}
    </div>
  );
}

// a player's row: the bar down its edge shows how much of the fight they were up
export function memberRowProps(member: Member, duration: number, className?: string) {
  return {
    className: cx(styles.row, styles.member, className),
    style: { '--activity': activity(member.events, duration) } as React.CSSProperties,
  };
}

export type Align = 'm' | 'l' | 'all';
const alignClass = (align: Align) => (align === 'all' ? 'text-right' : align === 'l' ? 'text-right-l' : 'text-right-m');

function eventsText(events: PlayerEvents | undefined, bold: boolean): React.ReactNode {
  if (!events) return null;
  const labelText = (label: string) => (bold ? <strong>{label}:</strong> : `${label}:`);
  const line = (label: string, count?: number, time?: number) => (
    <>{labelText(label)} {count ?? 0}{count ? ` (${formatTime((time ?? 0) / 1000)})` : ''}</>
  );
  return (
    <>
      {line('Deaths', events.dead_count, events.dead_time)}<br />
      {line(bold ? 'Downed' : 'Downs', events.down_count, events.down_time)}<br />
      {line('Disconnects', events.disconnect_count, events.disconnect_time)}
    </>
  );
}

// ---- the player column

export interface PlayerCellProps {
  member: Member;
  align?: Align;
}

export function PlayerCell({ member, align = 'l' }: PlayerCellProps) {
  const bootstrap = useBootstrap();
  const { encounter } = useEncounterView();
  const tooltip = useTooltip();
  const archetype = bootstrap.archetypes[String(member.archetype)];
  const spec = specName(bootstrap, member.profession, member.elite);

  const content = (
    <>
      {member.name ? <>{member.name}<br /><strong>Account:</strong> {member.account}</> : 'ACCOUNT PRIVATE'}
      <br /><strong>Activity:</strong> {perc(activity(member.events, encounter.duration), 0)}
      <br />{eventsText(member.events, true)}
    </>
  );

  return (
    <div className={cx(styles.player, alignClass(align))} {...tooltip(content, PLAYER_TOOLTIP)}>
      <div className={styles.playerText}>
        <h6 className={cx(styles.archetypeName, 'truncate')}>{archetype}</h6>
        <PlayerName name={member.name} commander={member.commander} />
      </div>
      <div className={styles.playerImage}>
        <img alt={spec} src={specIcon(spec, 48)} />
        <img className={styles.archetypeIcon} alt={archetype} src={archetypeIcon(archetype)} />
      </div>
    </div>
  );
}

export interface PartyCellProps {
  partyNo: string;
  count: number;
  events?: PlayerEvents;
  align?: Align;
}

export function PartyCell({ partyNo, count, events, align = 'l' }: PartyCellProps) {
  const tooltip = useTooltip();
  return (
    <div className={cx(styles.player, alignClass(align))} {...tooltip(events && eventsText(events, false), PLAYER_TOOLTIP)}>
      <div>
        <h5 className="m-0">Party {partyNo}</h5>
        <h6 className={styles.partyCount}>{count} member{count > 1 ? 's' : ''}</h6>
      </div>
    </div>
  );
}

export interface SquadCellProps {
  align?: Align;
}

export function SquadCell({ align = 'l' }: SquadCellProps) {
  return (
    <div className={cx(styles.player, alignClass(align))}>
      <div><h5 className="m-0">Squad</h5></div>
    </div>
  );
}

// ---- a buff: its icon, its value coloured by percentile, and (on hover) the compared percentile's value

export interface BuffCellProps {
  code: string;
  buff: BuffInfo | undefined;
  value: number | undefined;
  // the stored percentile points to compare against (only the boons have them)
  points?: Float32Array;
  // without points: the percentile to colour the value by, and what it is relative to
  percentile?: number;
  relativeTo?: string;
  output: boolean;
  // players' buffs they never had are left out (their place kept)
  hideZero?: boolean;
  // party rows: no percentile
  neutral?: boolean;
  stacksByKey?: boolean;
}

export function BuffCell({ code, buff, value, points, percentile: given, relativeTo, output, hideZero, neutral, stacksByKey }: BuffCellProps) {
  const { comparePerc } = useSettings();
  const pc = usePercentile();
  const tooltip = useTooltip();
  if (!buff) return null;

  const percentile = neutral ? NEUTRAL : points ? bsearch(value, points) : given ?? NEUTRAL;
  const name = `${buff.name} ${output ? 'Output' : 'Uptime'}`;
  const content = percentile === NEUTRAL ? <h5>{name}</h5> : (
    <><h5>{name}</h5><strong>Performance:</strong> {th(percentile)} Percentile{relativeTo && <> {relativeTo}</>}</>
  );
  const valueStyle = pc(percentile, styles.buffNumber);
  const compareStyle = pc(comparePerc, cx(styles.buffNumber, styles.compare));

  return (
    <div
      data-buff={code}
      className={cx(styles.buff, (neutral || !points) && styles.single, 'help', hideZero && !(Number(value) > 0) && 'invisible')}
      {...tooltip(content, { pos: 'bottom-left' })}
    >
      <img src={buff.icon} alt={buff.name} />
      <span className={valueStyle.className} style={valueStyle.style}>{formatBuff(buff, value ?? 0, stacksByKey)}</span>
      {!neutral && points && (
        <span className={compareStyle.className} style={compareStyle.style}>{formatBuff(buff, points[comparePerc], stacksByKey)}</span>
      )}
    </div>
  );
}

// ---- bar charts: 56px high, a bar at 16px, a line under it at 36px, the value above and the tick's value below

export interface ChartProps {
  children: React.ReactNode;
}

export function Chart({ children }: ChartProps) {
  return (
    <svg className="chart" preserveAspectRatio="xMinYMax meet" xmlns="http://www.w3.org/2000/svg" height="56px" width="100%">
      {children}
    </svg>
  );
}

// (CSS variables work in style, not in SVG attributes)
const LINE: React.CSSProperties = { fill: 'var(--c-chart-line)' };
const TEXT: React.CSSProperties = { fontFamily: 'var(--font-body)', fill: 'var(--c-text)' };
const MUTED: React.CSSProperties = { fill: 'var(--c-muted)' };

// the line the bar is measured against (the squad, or the role's best), and the tick at the compared percentile
export interface LineProps {
  // percent of the chart
  width: number;
}

export const Line = ({ width }: LineProps) => (
  <rect className="chart" x="0" y="36px" height="2px" width={`${width}%`} style={LINE} />
);

export interface TickProps {
  // percent of the chart
  x: number;
}

export const Tick = ({ x }: TickProps) => (
  <rect className="chart" x={`${x}%`} y="36px" height="6px" width="2px" style={LINE} />
);

export type Anchor = 'start' | 'middle' | 'end';

export interface ValueProps {
  x: number;
  anchor: Anchor;
  children: React.ReactNode;
  className?: string;
}

export function Value({ x, anchor, children, className }: ValueProps) {
  return (
    <text className={className} x={`${x}%`} y="-1px" alignmentBaseline="hanging" textAnchor={anchor}
      style={TEXT} fontSize="14">
      {children}
    </text>
  );
}

export interface TickValueProps {
  x: number;
  anchor: Anchor;
  children: React.ReactNode;
}

// the value at the compared percentile, under the tick, with the percentile after it
export function TickValue({ x, anchor, children }: TickValueProps) {
  const { comparePerc } = useSettings();
  return (
    <text x={`${x}%`} y="44px" alignmentBaseline="hanging" textAnchor={anchor}
      style={TEXT} fontSize="11">
      {children} <tspan style={MUTED} alignmentBaseline="hanging">({th(comparePerc)})</tspan>
    </text>
  );
}

export interface SquadLabelProps {
  x: number;
  anchor: Anchor;
}

// "Squad", where the squad's line ends (in a party's row)
export function SquadLabel({ x, anchor }: SquadLabelProps) {
  return (
    <text x={`${x}%`} y="42px" alignmentBaseline="hanging" textAnchor={anchor}
      style={{ ...TEXT, ...MUTED }} fontSize="11">
      Squad
    </text>
  );
}

export interface BarProps {
  width: number;
  percentile?: number;
  opacity?: number;
  animate?: boolean;
  x?: number;
  fill?: string;
  tooltip?: React.ReactNode;
  onClick?: () => void;
}

// a bar; coloured by a percentile (or NEUTRAL), or the plain black of an overlay without one
export function Bar({ width, percentile, opacity = 1, animate = true, x = 0, fill, tooltip: content, onClick }: BarProps) {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const colour = percentile === undefined ? null : pc(percentile);
  return (
    <rect
      className={cx(animate && 'chart', 'chart-hover', colour?.className)}
      style={colour?.style}
      x={`${x}%`}
      y="16px"
      height="16px"
      width={`${Math.max(0, width)}%`}
      opacity={opacity}
      fill={fill}
      onClick={onClick}
      {...tooltip(content, { pos: 'bottom-left', delay: 350 })}
    />
  );
}

export { styles as statsStyles };
