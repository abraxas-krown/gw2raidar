// A Buffs tab (encounter_buffs.html): the uptime (or output) of one group of buffs, per squad, party and player.
// The buff tabs and the buffs on them differ per encounter (encounter.buff_tabs, encounter.buffs).
import * as React from 'react';
import type { BuffInfo, StatBlock } from '../../api/types';
import { bsearch } from '../../lib/percentiles';
import { cx } from '../../ui/controls';
import { useEncounterView } from './EncounterContext';
import { Block, BuffCell, memberRowProps, PartyCell, PlayerCell, SquadCell, statsStyles as s } from './rows';
import { buffPoints, memberKey } from './stats';

type Variant = 'squad' | 'party' | 'member';

export interface BuffsProps {
  tabId: string;
}

export function Buffs({ tabId }: BuffsProps) {
  const { encounter, phase, boonOutput, setBoonOutput } = useEncounterView();
  const buffTab = encounter.buff_tabs.find(tab => tab.id === tabId);

  // Only the boons have percentiles to compare against. On the other tabs an uptime is coloured by its share of
  // the fight (a stacking buff's by its stacks of the most it can have), and an output, or the uptime of a
  // stacking buff whose most is not known, by how it ranks among the squad's players.
  const hasPercentiles = tabId === 'boons';
  const squad = React.useMemo(() => {
    const byCode: Record<string, Float32Array> = {};
    if (!buffTab || hasPercentiles) return byCode;
    const members = Object.values(phase.parties).flatMap(party => party.members);
    for (const code of buffTab.order) {
      byCode[code] = Float32Array.from(members.map(member => Number((boonOutput ? member.buffs_out : member.buffs)?.[code]) || 0)).sort();
    }
    return byCode;
  }, [hasPercentiles, boonOutput, phase, buffTab]);

  // an uptime in percent; for a stacking buff, its stacks of the most it can have (undefined when not known)
  const uptimePercent = (buff: BuffInfo | undefined, value: number): number | undefined => {
    if (!buff || !('stacks' in buff)) return Math.max(0, Math.min(100, value));
    return typeof buff.stacks === 'number' && buff.stacks > 0 ? Math.min(100, (100 * value) / buff.stacks) : undefined;
  };

  if (!buffTab) return null;

  const buffs = (stats: StatBlock, variant: Variant) => (
    <div className={s.buffs}>
      {buffTab.order.map(code => {
        const buff = encounter.buffs[code];
        const value = (boonOutput ? stats.buffs_out : stats.buffs)?.[code] ?? 0;
        const own = hasPercentiles && variant !== 'party';
        let percentile: number | undefined;
        let relativeTo: string | undefined;
        if (!hasPercentiles && variant !== 'party') {
          const share = boonOutput ? undefined : uptimePercent(buff, value);
          if (share !== undefined) {
            percentile = Math.round(share);
          } else if (variant === 'member') {
            percentile = bsearch(value, squad[code] ?? new Float32Array(0));
            if (boonOutput) relativeTo = 'in the squad';
          }
        }
        return (
          <BuffCell
            key={code}
            code={code}
            buff={buff}
            value={value}
            points={own ? buffPoints(stats.performance, boonOutput, code) : undefined}
            percentile={percentile}
            relativeTo={relativeTo}
            output={boonOutput}
            neutral={variant === 'party'}
            hideZero={variant === 'member'}
            stacksByKey
          />
        );
      })}
    </div>
  );

  return (
    <div>
      <Block sticky>
        <div className={cx(s.row, s.header, s.buffsRow)}>
          <div className="show-m">Spec</div>
          <div className={s.toggle}>
            <button type="button" className={cx(!boonOutput && s.on)} onClick={() => setBoonOutput(false)}>Uptime</button>
            {' | '}
            <button type="button" className={cx(boonOutput && s.on)} onClick={() => setBoonOutput(true)}>Output</button>
          </div>
        </div>
      </Block>

      <Block squad index={1}>
        <div className={cx(s.row, s.buffsRow)}>
          <SquadCell align="m" />
          {buffs(phase, 'squad')}
        </div>
      </Block>

      {Object.entries(phase.parties).map(([partyNo, party], index) => (
        <Block key={partyNo} index={index + 2}>
          <div className={cx(s.row, s.buffsRow, s.party)}>
            <PartyCell partyNo={partyNo} count={party.members.length} events={party.events} align="m" />
            {buffs(party, 'party')}
          </div>
          {party.members.map((member, i) => (
            <div key={memberKey(member, i)} {...memberRowProps(member, encounter.duration, s.buffsRow)}>
              <PlayerCell member={member} align="m" />
              {buffs(member, 'member')}
            </div>
          ))}
        </Block>
      ))}
    </div>
  );
}
