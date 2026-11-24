import { Link } from 'react-router';
import type { EncounterRow } from '../../api/types';
import { archetypeIcon, specIcon, specName } from '../../lib/assets';
import { formatDate, formatTime, perc } from '../../lib/format';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { Badge, ModeTag, badgeClass } from '../../ui/controls';
import { useTooltip } from '../../ui/Tooltip';
import styles from './Encounters.module.css';

export interface EncounterRowLinkProps {
  row: EncounterRow;
  index: number;
}

// One encounter of the list, a link to its page
export function EncounterRowLink({ row, index }: EncounterRowLinkProps) {
  const bootstrap = useBootstrap();
  const pc = usePercentile();
  const tooltip = useTooltip();
  const archetype = bootstrap.archetypes[String(row.archetype)];
  const spec = specName(bootstrap, row.profession, row.elite);
  const date = pc(0, badgeClass('primary', true));

  return (
    <Link
      to={`/encounter/${row.url_id}`}
      className={styles.row}
      role="row"
      style={{ animationDelay: `${Math.min(index + 1, 15) * 20}ms` }}
    >
      <div className={`${styles.cell} ${styles.first}`} role="cell">
        {/* a wipe: the boss's health left, as a thin bar down the row's edge */}
        {!row.success && row.boss_health != null && (
          <div className={styles.bossHp} {...tooltip(`Boss health left: ${perc(row.boss_health, 1)}`)}>
            <div className={styles.bossHpFill} style={{ height: `${row.boss_health}%` }} />
          </div>
        )}
        <h4 className="m-0">{row.area} <ModeTag mode={row.mode_tag} /></h4>
        <Badge bold tone={row.success ? 'success' : 'danger'}>
          {row.success ? 'Success' : 'Wipe'} ({formatTime(row.duration)})
        </Badge>
        <span className={date.className} style={date.style}>{formatDate(row.started_at)}</span>
        {row.tags.map(tag => <Badge key={tag} bold className={styles.tag}>{tag}</Badge>)}
      </div>
      <div className={`${styles.cell} ${styles.character}`} role="cell">
        <p className="m-0">
          <img alt={archetype} src={archetypeIcon(archetype)} />
          <img alt={spec} src={specIcon(spec, 20)} />
          {row.character}
        </p>
        <p className="text-small m-0">Account: {row.account}</p>
      </div>
      <div className={`${styles.cell} show-m`} role="cell">{formatDate(row.uploaded_at)}</div>
      <div className={`${styles.cell} show-m`} role="cell">
        {row.category ? bootstrap.categories[String(row.category)] : ''}
      </div>
    </Link>
  );
}
