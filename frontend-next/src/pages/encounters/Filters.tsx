// The encounter list's filters, in a column next to it
import * as React from 'react';
import type { EncounterRow } from '../../api/types';
import { updateEncounterFilter, type EncounterFilter } from '../../lib/settings';
import { useBootstrap } from '../../session/SessionProvider';
import { Button, ButtonGroup, FieldLabel, Icon, Input, Select } from '../../ui/controls';
import { useTooltip } from '../../ui/Tooltip';
import { distinct } from './filtering';
import styles from './Encounters.module.css';

// <select> values are strings; "" stands for "no filter"
const optional = (value: string) => (value === '' ? null : value);

export interface FiltersProps {
  encounters: EncounterRow[];
  filter: EncounterFilter;
}

export function Filters({ encounters, filter }: FiltersProps) {
  const bootstrap = useBootstrap();
  const tooltip = useTooltip();
  const [more, setMore] = React.useState(false);

  const areas = React.useMemo(() => distinct(encounters.map(e => e.area)), [encounters]);
  const characters = React.useMemo(() => distinct(encounters.map(e => e.character)), [encounters]);
  const accounts = React.useMemo(() => distinct(encounters.map(e => e.account)), [encounters]);

  const choice = <T,>(current: T, value: T, label: React.ReactNode, onPick: (value: T) => void, title?: string) => (
    <Button
      small
      variant={current === value ? 'primary' : 'default'}
      onClick={() => onPick(value)}
      aria-pressed={current === value}
      {...tooltip(title)}
    >
      {label}
    </Button>
  );

  const text = (name: keyof EncounterFilter, placeholder: string, type = 'text', id?: string) => (
    <Input
      id={id}
      type={type}
      placeholder={placeholder}
      value={(filter[name] as string | null | undefined) ?? ''}
      onChange={e => updateEncounterFilter({ [name]: optional(e.target.value) })}
    />
  );

  return (
    <form className={styles.filters} onSubmit={e => e.preventDefault()}>
      <legend className={styles.filtersTitle}>Filters</legend>

      <div className={styles.filter}>
        <ButtonGroup aria-label="By success">
          {choice(filter.success, true, <><Icon name="check_circle" className="text-success" /> Success</>, v => updateEncounterFilter({ success: v }))}
          {choice(filter.success, false, <><Icon name="cancel" className="text-danger" /> Wipe</>, v => updateEncounterFilter({ success: v }))}
          {choice(filter.success, null, 'All', v => updateEncounterFilter({ success: v }))}
        </ButtonGroup>
      </div>

      <div className={styles.filter}>
        <ButtonGroup aria-label="By mode">
          {choice(filter.mode ?? null, 0, 'Normal', v => updateEncounterFilter({ mode: v }))}
          {choice(filter.mode ?? null, 1, 'CM', v => updateEncounterFilter({ mode: v }), 'Challenge mode')}
          {choice(filter.mode ?? null, 2, 'LCM', v => updateEncounterFilter({ mode: v }), 'Legendary challenge mode')}
          {choice(filter.mode ?? null, null, 'All', v => updateEncounterFilter({ mode: v }))}
        </ButtonGroup>
      </div>

      <div className={styles.filter}>
        <Select aria-label="By encounter" value={filter.area ?? ''} onChange={e => updateEncounterFilter({ area: optional(e.target.value) })}>
          <option value="">-- Show all encounters --</option>
          {areas.map(area => <option key={area} value={area}>{area}</option>)}
        </Select>
      </div>
      <div className={styles.filter}>
        <Select aria-label="By character" value={filter.character ?? ''} onChange={e => updateEncounterFilter({ character: optional(e.target.value) })}>
          <option value="">-- Show all characters --</option>
          {characters.map(name => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>
      <div className={styles.filter}>
        <Select aria-label="By account" value={filter.account ?? ''} onChange={e => updateEncounterFilter({ account: optional(e.target.value) })}>
          <option value="">-- Show all accounts --</option>
          {accounts.map(name => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>

      {more && (
        <>
          <div className={styles.filter}>
            <FieldLabel className={styles.filterLabel}>By Encounter Duration</FieldLabel>
            <div className={styles.pair}>
              {text('duration_from', 'Longer than...')}
              {text('duration_till', 'Shorter than...')}
            </div>
          </div>
          <div className={styles.filter}>
            <FieldLabel className={styles.filterLabel}>By Encounter Time</FieldLabel>
            <div className={styles.pair}>
              <div><FieldLabel htmlFor="started-from">From</FieldLabel>{text('started_from', 'From', 'date', 'started-from')}</div>
              <div><FieldLabel htmlFor="started-till">Till</FieldLabel>{text('started_till', 'Till', 'date', 'started-till')}</div>
            </div>
          </div>
          <div className={styles.filter}>
            <FieldLabel className={styles.filterLabel}>By Uploaded Time</FieldLabel>
            <div className={styles.pair}>
              <div><FieldLabel htmlFor="uploaded-from">From</FieldLabel>{text('uploaded_from', 'From', 'date', 'uploaded-from')}</div>
              <div><FieldLabel htmlFor="uploaded-till">Till</FieldLabel>{text('uploaded_till', 'Till', 'date', 'uploaded-till')}</div>
            </div>
          </div>
          <div className={styles.filter}>
            <FieldLabel className={styles.filterLabel} htmlFor="filter-category">By Category</FieldLabel>
            <Select
              id="filter-category"
              value={filter.category == null ? '' : String(filter.category)}
              onChange={e => updateEncounterFilter({ category: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
            >
              <option value="">-- no filter --</option>
              <option value="0">-- uncategorised --</option>
              {Object.entries(bootstrap.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </div>
          <div className={styles.filter}>
            <FieldLabel className={styles.filterLabel} htmlFor="filter-tag">By Tag</FieldLabel>
            {text('tag', 'Tag search', 'text', 'filter-tag')}
          </div>
        </>
      )}
      <a className="show-s" href="#more" onClick={e => { e.preventDefault(); setMore(!more); }}>
        {more ? 'Less' : 'More'} Filters
      </a>
    </form>
  );
}
