// A Buffs tab (encounter_buffs.html): the uptime (or output) of one group of buffs, per squad, party and player.
// The buff tabs and the buffs on them differ per encounter (encounter.buff_tabs, encounter.buffs).
import type { StatBlock } from '../../api/types';
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
  if (!buffTab) return null;

  const buffs = (stats: StatBlock, variant: Variant) => (
    <div className={s.buffs}>
      {buffTab.order.map(code => (
        <BuffCell
          key={code}
          code={code}
          buff={encounter.buffs[code]}
          value={(boonOutput ? stats.buffs_out : stats.buffs)?.[code] ?? 0}
          points={variant === 'party' ? undefined : buffPoints(stats.performance, boonOutput, code)}
          output={boonOutput}
          neutral={variant === 'party'}
          hideZero={variant === 'member'}
          stacksByKey
        />
      ))}
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
