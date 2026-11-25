// The Boss Metrics tab (encounter_boss_metrics.html): the encounter's mechanics (how often each was hit, and
// the like), per squad, party and player
import type { BossMetric, StatBlock } from '../../api/types';
import { cx } from '../../ui/controls';
import { useTooltip } from '../../ui/Tooltip';
import { useEncounterView } from './EncounterContext';
import { Block, memberRowProps, PartyCell, PlayerCell, SquadCell, statsStyles as s } from './rows';
import { memberKey } from './stats';

interface ValuesProps {
  metrics: BossMetric[];
  stats: StatBlock;
}

function Values({ metrics, stats }: ValuesProps) {
  return (
    <>
      {metrics.map(metric => (
        <div key={metric.name} className={s.mechanicsValue}>
          <h6 className="hide-l m-0">{metric.short_name}</h6>
          {stats.mechanics?.[metric.name]}
        </div>
      ))}
    </>
  );
}

export function BossMetrics() {
  const { encounter, phase } = useEncounterView();
  const tooltip = useTooltip();
  const metrics = encounter.boss_metrics ?? [];

  return (
    <div>
      <Block sticky mechanics>
        <div className={cx(s.row, s.header, 'show-l')}>
          <div>Totals</div>
          {metrics.map(metric => (
            <div key={metric.name} className={s.mechanicsValue} {...tooltip(metric.long_name, { pos: 'bottom-center' })}>
              {metric.short_name}
            </div>
          ))}
        </div>
      </Block>

      <Block squad mechanics index={1}>
        <div className={s.row}>
          <SquadCell align="all" />
          <Values metrics={metrics} stats={phase} />
        </div>
      </Block>

      {Object.entries(phase.parties).map(([partyNo, party], index) => (
        <Block key={partyNo} mechanics index={index + 2}>
          <div className={cx(s.row, s.party)}>
            <PartyCell partyNo={partyNo} count={party.members.length} events={party.events} align="all" />
            <Values metrics={metrics} stats={party} />
          </div>
          {party.members.map((member, i) => (
            <div key={memberKey(member, i)} {...memberRowProps(member, encounter.duration)}>
              <PlayerCell member={member} align="all" />
              <Values metrics={metrics} stats={member} />
            </div>
          ))}
        </Block>
      ))}
    </div>
  );
}
