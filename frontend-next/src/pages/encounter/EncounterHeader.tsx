// The encounter's header: its boss icon (with where the log came from on hover), name, result, date, links, the
// category and tags (editable by those who took part), and the percentile the tables compare against
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { keys } from '../../api/queries';
import type { Encounter, EncounterRow } from '../../api/types';
import { encounterIcon } from '../../lib/assets';
import { formatDate, formatTime, perc } from '../../lib/format';
import { updateSettings, useSettings } from '../../lib/settings';
import { usePercentile } from '../../lib/usePercentile';
import { useBootstrap } from '../../session/SessionProvider';
import { Badge, Button, FieldLabel, ModeTag, Select, badgeClass, cx } from '../../ui/controls';
import { Dropdown } from '../../ui/Dropdown';
import { TagsInput } from '../../ui/TagsInput';
import { useToast } from '../../ui/Toast';
import { useTooltip } from '../../ui/Tooltip';
import { useEncounterView } from './EncounterContext';
import styles from './EncounterHeader.module.css';

const COMPARE = [99, 90, 80, 70, 60, 50, 30];

export function EncounterHeader() {
  const { encounter } = useEncounterView();
  const bootstrap = useBootstrap();
  const { comparePerc } = useSettings();
  const pc = usePercentile();
  const tooltip = useTooltip();
  const [iconHidden, setIconHidden] = React.useState(false);

  const arcdps = encounter.evtc_version ? `arcdps v${encounter.evtc_version}` : undefined;
  const date = pc(0, badgeClass('primary', true));

  return (
    <div className={styles.header}>
      <div className={styles.media}>
        <div className={styles.iconWrap}>
          <img
            width="70"
            src={encounterIcon(encounter.icon)}
            alt={encounter.name}
            style={iconHidden ? { visibility: 'hidden' } : undefined}
            onError={() => setIconHidden(true)}
          />
          {/* where the log came from, on hover (uk-drop) */}
          <div className={styles.drop}>
            <span className="text-muted">Uploaded as</span>{' '}
            {encounter.evtc_url ? (
              <a href={encounter.evtc_url}>{encounter.filename}</a>
            ) : encounter.downloadable ? (
              <a href={bootstrap.urls.download + encounter.url_id} {...tooltip(arcdps)}>{encounter.filename}</a>
            ) : (
              <span {...tooltip(arcdps)}>{encounter.filename}</span>
            )}{' '}
            <span className="text-muted">by</span> {encounter.uploaded_by}{' '}
            <span className="text-muted">at</span> {formatDate(encounter.uploaded_at)}
          </div>
        </div>
        <div>
          <h2 className={styles.title}>{encounter.name} <ModeTag mode={encounter.mode_tag} /></h2>
          <div className={styles.badges}>
            <Badge bold tone={encounter.success ? 'success' : 'danger'}>
              {encounter.success ? 'Success' : 'Wipe'} ({formatTime(encounter.duration)})
              {!encounter.success && encounter.boss_health != null && <>&nbsp;{perc(encounter.boss_health, 1)}</>}
            </Badge>
            <span className={date.className} style={date.style}>{formatDate(encounter.started_at)}</span>
            {encounter.has_report && (
              <a
                href={bootstrap.urls.report + encounter.url_id}
                target="_blank"
                rel="noopener"
                className={badgeClass('primary', true)}
                {...tooltip('Open the Elite Insights report of this log, with the combat replay, in a new tab')}
              >
                Elite Insights
              </a>
            )}
            {encounter.participated ? (
              <TagsEditor encounter={encounter} />
            ) : (
              encounter.tags && <Badge bold className="show-m">{encounter.tags}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className={cx(styles.compare, 'show-s')}>
        <h6 className={styles.compareTitle}>Compare Percentile</h6>
        <div role="radiogroup" aria-label="Compare percentile">
          {COMPARE.map(p => {
            const badge = pc(p, badgeClass('primary', true));
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={comparePerc === p}
                className={cx(styles.compareChoice, comparePerc === p && styles.chosen)}
                onClick={() => updateSettings(s => ({ ...s, comparePerc: p }))}
              >
                <span className={badge.className} style={badge.style}>{perc(p, 0)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TagsEditorProps {
  encounter: Encounter;
}

// The category and tags of an encounter the user took part in, in a dropdown under its badge
function TagsEditor({ encounter }: TagsEditorProps) {
  const bootstrap = useBootstrap();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [category, setCategory] = React.useState(encounter.category == null ? '' : String(encounter.category));
  const [tags, setTags] = React.useState(encounter.tags || '');

  const save = useMutation({
    mutationFn: () => api.setTagsAndCategory(encounter.id, tags, category || null),
    onSuccess: () => {
      const categoryValue = category ? Number(category) : null;
      queryClient.setQueryData<Encounter>(keys.encounter(encounter.url_id), old =>
        old && { ...old, tags, category: categoryValue });
      // the list may not be loaded yet, and need not hold this encounter
      queryClient.setQueryData<EncounterRow[]>(keys.encounters, rows => rows?.map(row =>
        row.id === encounter.id ? { ...row, category: categoryValue, tags: tags ? tags.split(',') : [] } : row));
      notify('Category and tags saved.', 'success');
    },
    onError: error => notify(error.message, 'danger'),
  });

  return (
    <Dropdown
      className="show-m"
      toggle={(open, setOpen) => (
        <button type="button" className={cx(badgeClass('primary', true), styles.tagsToggle)} aria-expanded={open} onClick={() => setOpen(!open)}>
          {encounter.tags ? `Tags: ${encounter.tags}` : 'Add Tags'}
        </button>
      )}
    >
      {close => (
        <form
          className={styles.tagsForm}
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            save.mutate(undefined, { onSuccess: close });
          }}
        >
          <FieldLabel htmlFor="encounter-category">Category</FieldLabel>
          <Select id="encounter-category" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">No category</option>
            {Object.entries(bootstrap.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
          <TagsInput className={styles.tagsField} value={tags} onChange={setTags} placeholder="Tags" />
          <Button type="submit" variant="primary" small disabled={save.isPending}>Save</Button>
        </form>
      )}
    </Dropdown>
  );
}
