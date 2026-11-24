// Reading the encounter's stats: the loosely shaped objects of encounter/<id>.json
import type { BuffInfo, Member, Performance } from '../../api/types';
import { num, perc } from '../../lib/format';
import { pctl } from '../../lib/percentiles';

export const n = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// the stored percentile points under a key of a performance section (e.g. "dps_perc", "might_perc")
export function points(section: Partial<Record<string, unknown>> | undefined, key: string): Float32Array {
  const value = section?.[key];
  return pctl(typeof value === 'string' ? value : undefined);
}

export function buffPoints(performance: Performance | undefined, output: boolean, code: string): Float32Array {
  return points(output ? performance?.buffs_out : performance?.buffs, `${code}_perc`);
}

// stacking buffs (might) are counts, the others uptimes in percent. The Overview's buffs (bootstrap.json) say
// so with a true `stacks`; the Buffs tabs' (the encounter's own) by having the key at all.
export function formatBuff(buff: BuffInfo, value: number | undefined, stacksByKey = false): string {
  if (value === undefined) return '';
  const stacks = stacksByKey ? 'stacks' in buff : !!buff.stacks;
  return stacks ? num(value, 1) : perc(value, 1);
}

export const memberKey = (member: Member, index: number) => `${member.account ?? 'private'}-${member.name ?? ''}-${index}`;
