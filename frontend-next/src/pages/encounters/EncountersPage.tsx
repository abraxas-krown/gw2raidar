// The signed-in user's encounters: a filterable, sortable list, ten to a page (/encounters/<page>)
import * as React from 'react';
import { useParams } from 'react-router';
import { useEncountersQuery } from '../../api/queries';
import { updateEncounterFilter, updateEncounterSort, useSettings, type SortProp } from '../../lib/settings';
import { Button, Icon } from '../../ui/controls';
import { Loader } from '../../ui/Loader';
import { EncounterRowLink } from './EncounterRow';
import { Filters } from './Filters';
import { filterEncounters, PAGE_SIZE, sortEncounters } from './filtering';
import { Pagination } from './Pagination';
import styles from './Encounters.module.css';

const COLUMNS: { prop: SortProp; label: string; dir: 'up' | 'down'; className?: string }[] = [
  { prop: 'area', label: 'Encounter', dir: 'up', className: styles.encounterHead },
  { prop: 'started_at', label: 'Time', dir: 'down' },
  { prop: 'duration', label: 'Dur.', dir: 'down' },
  { prop: 'character', label: 'Character', dir: 'up' },
  { prop: 'account', label: 'Account', dir: 'up' },
  { prop: 'uploaded_at', label: 'Upload', dir: 'down' },
  { prop: 'category', label: 'Category', dir: 'up' },
];

export function EncountersPage() {
  const { page: pageParam } = useParams();
  const page = Math.max(1, Number(pageParam) || 1);
  const { encounterSort: sort } = useSettings();
  const query = useEncountersQuery(true);
  const encounters = query.data;

  const { rows, any } = React.useMemo(
    () => filterEncounters(sortEncounters(encounters ?? [], sort.prop, sort.dir), sort.filter),
    [encounters, sort.prop, sort.dir, sort.filter],
  );

  if (query.isPending) return <Loader />;
  if (!encounters) return null;
  if (!encounters.length) {
    return <p>No encounters yet. Uploading logs is not part of the new frontend yet.</p>;
  }

  const onSort = (prop: SortProp, dir: 'up' | 'down') => {
    if (prop === sort.prop) updateEncounterSort({ dir: sort.dir === 'up' ? 'down' : 'up' });
    else updateEncounterSort({ prop, dir });
  };
  const clearFilters = () => updateEncounterFilter({
    success: null, mode: null, area: null, character: null, account: null, duration_from: null,
    duration_till: null, started_from: null, started_till: null, uploaded_from: null, uploaded_till: null,
    category: null, tag: null,
  });

  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div>
        <Button onClick={() => updateEncounterSort({ filters: !sort.filters })}>
          {sort.filters ? 'Show' : 'Hide'} Filters <Icon name="filter_list" />
        </Button>{' '}
        {any && <Button onClick={clearFilters}>Clear Filters <Icon name="close" /></Button>}
      </div>
      <div className={`${styles.layout} ${sort.filters ? styles.full : ''}`}>
        {!sort.filters && <Filters encounters={encounters} filter={sort.filter} />}
        <div className={styles.list}>
          <div className={styles.table} role="table" aria-label="Encounters">
            <div className={styles.head} role="row">
              {COLUMNS.map(column => (
                <div
                  key={column.prop}
                  role="columnheader"
                  aria-sort={sort.prop === column.prop ? (sort.dir === 'up' ? 'ascending' : 'descending') : undefined}
                  className={`${styles.headCell} ${column.className ?? ''}`}
                  onClick={() => onSort(column.prop, column.dir)}
                >
                  {column.label}{' '}
                  {sort.prop !== column.prop ? (
                    <span>-</span>
                  ) : (
                    <Icon name={sort.dir === 'up' ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} className={styles.sortIcon} />
                  )}
                </div>
              ))}
            </div>
            {slice.map((row, index) => <EncounterRowLink key={row.id} row={row} index={index} />)}
          </div>
        </div>
      </div>
      <Pagination page={page} total={rows.length} />
    </>
  );
}
