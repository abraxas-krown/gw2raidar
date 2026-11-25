// The encounter page's tab bar: the tabs on the left (Overview, Buffs ▾, Boss Metrics, Replay), and the phase
// menu on the right, as breadcrumbs (lib/phases.ts)
import * as React from 'react';
import { formatTime } from '../../lib/format';
import { phaseNav } from '../../lib/phases';
import { uiStore } from '../../lib/uiState';
import { cx, Icon } from '../../ui/controls';
import { Dropdown } from '../../ui/Dropdown';
import dropdownStyles from '../../ui/Dropdown.module.css';
import { useTooltip } from '../../ui/Tooltip';
import { useEncounterView } from './EncounterContext';
import styles from './EncounterTabs.module.css';

const setTab = (encounterTab: string) => uiStore.set({ encounterTab });

export interface EncounterTabsProps {
  // the open tab: 'combat_stats', 'boss_metrics', 'replay', or a buff tab's id
  tab: string;
}

export const EncounterTabs = React.forwardRef<HTMLElement, EncounterTabsProps>(function EncounterTabs({ tab }, ref) {
  const { encounter } = useEncounterView();
  const isBuffTab = tab !== 'combat_stats' && tab !== 'boss_metrics' && tab !== 'replay';

  return (
    <nav ref={ref} className={styles.bar} aria-label="Encounter">
      <ul className={styles.tabs}>
        <li className={cx(tab === 'combat_stats' && styles.active)}>
          <button type="button" onClick={() => setTab('combat_stats')}>Overview</button>
        </li>
        <li className={cx(isBuffTab && styles.active)}>
          <Dropdown
            toggle={(open, setOpen) => (
              <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
                Buffs <Icon name="keyboard_arrow_down" />
              </button>
            )}
          >
            {close => (
              <ul className={dropdownStyles.nav}>
                {encounter.buff_tabs.map(buffTab => (
                  <li key={buffTab.id}>
                    <button type="button" onClick={() => { setTab(buffTab.id); close(); }}>{buffTab.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </Dropdown>
        </li>
        <li className={cx(tab === 'boss_metrics' && styles.active)}>
          <button type="button" onClick={() => setTab('boss_metrics')}>Boss Metrics</button>
        </li>
        {encounter.has_replay && (
          <li className={cx(tab === 'replay' && styles.active)}>
            <button type="button" onClick={() => setTab('replay')}>Replay</button>
          </li>
        )}
      </ul>
      <div className={cx(styles.right, 'show-m')}>
        <PhaseMenu />
      </div>
    </nav>
  );
});

// The path to the chosen level of phases, then that level's phases as tabs. When the tabs do not fit, they
// scroll sideways (the mouse wheel scrolls them), and the chosen phase is kept in view.
function PhaseMenu() {
  const { encounter, phaseName, setPhase } = useEncounterView();
  const tooltip = useTooltip();
  const row = React.useRef<HTMLUListElement>(null);
  const nav = phaseNav(encounter, phaseName);

  // fade the edges with tabs scrolled out of sight
  const markEdges = React.useCallback(() => {
    const tabs = row.current;
    if (!tabs) return;
    tabs.classList.toggle(styles.moreLeft, tabs.scrollLeft > 1);
    tabs.classList.toggle(styles.moreRight, tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1);
  }, []);

  // keep the chosen phase in view
  React.useLayoutEffect(() => {
    const tabs = row.current;
    if (!tabs) return;
    const chosen = tabs.querySelector<HTMLElement>(`.${styles.active}`);
    if (!chosen) {
      tabs.scrollLeft = 0;
    } else {
      const left = chosen.getBoundingClientRect().left - tabs.getBoundingClientRect().left + tabs.scrollLeft;
      const right = left + chosen.offsetWidth;
      if (left < tabs.scrollLeft) tabs.scrollLeft = left;
      else if (right > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = right - tabs.clientWidth;
    }
    markEdges();
  }, [phaseName, markEdges]);

  React.useEffect(() => {
    const tabs = row.current;
    if (!tabs) return;
    const onWheel = (event: WheelEvent) => {
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      tabs.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    // React's wheel listeners are passive; this one stops the page from scrolling
    tabs.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', markEdges);
    return () => {
      tabs.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', markEdges);
    };
  }, [markEdges]);

  return (
    <div className={styles.phaseNav}>
      {nav.path.length > 0 && (
        <ul className={styles.path}>
          {nav.path.map(phase => (
            <li key={phase.name} className={cx(phase.active && styles.active)} {...tooltip(formatTime(phase.duration))}>
              <button type="button" onClick={() => setPhase(phase.name)}>{phase.name}</button>
            </li>
          ))}
        </ul>
      )}
      <ul ref={row} className={cx(styles.tabs, styles.phaseTabs)} onScroll={markEdges}>
        {nav.tabs.map(phase => (
          <li key={phase.name} className={cx(phase.active && styles.active)} {...tooltip(formatTime(phase.duration))}>
            <button type="button" onClick={() => setPhase(phase.name)}>
              {phase.name}{phase.parts && <> <Icon name="chevron_right" /></>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
