// A row of tabs with uk-tab's look: muted links, the chosen one in the emphasis colour and underlined
import * as React from 'react';
import { cx } from './controls';
import styles from './Tabs.module.css';

export interface TabsProps<T extends string> {
  tabs: [T, React.ReactNode][];
  current: T;
  onChange: (tab: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, current, onChange, className }: TabsProps<T>) {
  return (
    <ul className={cx(styles.tabs, className)} role="tablist">
      {tabs.map(([id, label]) => (
        <li key={id} className={cx(current === id && styles.active)}>
          <button type="button" role="tab" aria-selected={current === id} onClick={() => onChange(id)}>{label}</button>
        </li>
      ))}
    </ul>
  );
}
