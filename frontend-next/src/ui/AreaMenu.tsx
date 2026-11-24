// The encounter menu of Personal Stats and Global Stats: a button per kind of encounter (raids, fractals, …);
// each opens, across the whole row, the kind's "all" entry and its wings, a column each, with their bosses.
// Below small screens, a select instead.
import * as React from 'react';
import type { Bootstrap } from '../api/types';
import { Button, cx, Icon, Select } from './controls';
import styles from './AreaMenu.module.css';

export interface AreaEntry {
  // shown after the name, e.g. a count
  suffix?: string;
  // an entry that cannot be chosen (no data)
  disabled?: boolean;
  // a link's address, so it can be opened in a new tab
  href?: string;
}

export interface AreaMenuProps {
  bootstrap: Bootstrap;
  // the chosen area: an area id, or an "all" name ("All raid bosses")
  selected: string;
  onSelect: (area: string) => void;
  entry?: (area: string) => AreaEntry;
}

export const areaLabel = (bootstrap: Bootstrap, id: string) => {
  const area = bootstrap.areas[id];
  return area ? area.name + (area.tag ? ' ' + area.tag : '') : id;
};

export function AreaMenu({ bootstrap, selected, onSelect, entry = () => ({}) }: AreaMenuProps) {
  const [open, setOpen] = React.useState<number | null>(null);
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open === null) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const choose = (event: React.MouseEvent, area: string) => {
    // a link opened in a new tab is left to the browser
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (entry(area).disabled) return;
    onSelect(area);
    setOpen(null);
  };

  const link = (area: string, label: string) => {
    const { suffix, disabled, href } = entry(area);
    return (
      <li key={area} className={cx(selected === area && styles.active, disabled && styles.disabled)}>
        <a href={href ?? '#'} onClick={event => choose(event, area)} aria-disabled={disabled}>
          {label}{suffix ? ` ${suffix}` : ''}
        </a>
      </li>
    );
  };

  return (
    <>
      <div ref={root} className={cx(styles.menu, 'show-s')}>
        {bootstrap.boss_locations.map((location, index) => {
          const bosses = location.wings.flatMap(wing => wing.bosses.map(String));
          const active = selected === location.all || bosses.includes(selected);
          return (
            <Button
              key={location.name}
              variant={active ? 'primary' : 'plain'}
              aria-expanded={open === index}
              onClick={() => setOpen(open === index ? null : index)}
            >
              {active && <>{bootstrap.areas[selected] ? areaLabel(bootstrap, selected) : selected} &mdash;&nbsp;</>}
              {location.name} <Icon name="expand_more" />
            </Button>
          );
        })}
        {open !== null && bootstrap.boss_locations[open] && (
          <div className={styles.box}>
            {bootstrap.boss_locations[open].all && (
              <ul className={styles.all}>{link(bootstrap.boss_locations[open].all!, bootstrap.boss_locations[open].all!)}</ul>
            )}
            <div
              className={styles.wings}
              style={{ '--columns': bootstrap.boss_locations[open].columns ?? 3 } as React.CSSProperties}
            >
              {bootstrap.boss_locations[open].wings.map(wing => (
                <ul key={wing.name} className={styles.wing}>
                  <li className={styles.header}>{wing.name}</li>
                  {wing.bosses.map(boss => link(String(boss), areaLabel(bootstrap, String(boss))))}
                </ul>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* phones */}
      <h6 className={cx(styles.selectTitle, 'hide-s')}>Encounter</h6>
      <Select className={cx(styles.select, 'hide-s')} value={selected} onChange={e => onSelect(e.target.value)} aria-label="Encounter">
        {bootstrap.boss_locations.map(location => (
          <React.Fragment key={location.name}>
            {location.all && (
              <option value={location.all} disabled={entry(location.all).disabled}>
                {location.all}{entry(location.all).suffix ? ` ${entry(location.all).suffix}` : ''}
              </option>
            )}
            {location.wings.map(wing => (
              <optgroup key={wing.name} label={wing.name}>
                {wing.bosses.map(boss => {
                  const { suffix, disabled } = entry(String(boss));
                  return (
                    <option key={boss} value={String(boss)} disabled={disabled}>
                      {areaLabel(bootstrap, String(boss))}{suffix ? ` ${suffix}` : ''}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </React.Fragment>
        ))}
      </Select>
    </>
  );
}
