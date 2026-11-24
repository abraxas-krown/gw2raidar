// One encounter (/encounter/<url_id>): its header, the tabs (Overview, a Buffs tab per buff group, Boss Metrics
// and Replay) with the phase menu, and the tab's table
import * as React from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useEncounterQuery } from '../../api/queries';
import { uiStore, useUiState } from '../../lib/uiState';
import { useSignedIn } from '../../session/SessionProvider';
import { Loader } from '../../ui/Loader';
import { BossMetrics } from './BossMetrics';
import { Buffs } from './Buffs';
import { CombatData } from './CombatData';
import { EncounterHeader } from './EncounterHeader';
import { EncounterTabs } from './EncounterTabs';
import { EncounterViewProvider, useEncounterView } from './EncounterContext';
import { ReplayTab } from './Replay/Replay';
import styles from './EncounterPage.module.css';

export function EncounterPage() {
  const { urlId } = useParams();
  const query = useEncounterQuery(urlId);
  const signedIn = useSignedIn();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [urlId]);

  if (query.isPending) return <Loader />;
  if (query.error) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <div className={styles.missing}>
          <h2>Encounter not found</h2>
          <p>There is no encounter <code>{urlId}</code>. It may have been removed, or the link may be wrong.</p>
          {signedIn && <p><Link to="/encounters">Back to your encounters</Link></p>}
        </div>
      );
    }
    // reported already, as a notification
    return null;
  }

  // a new encounter starts at the whole fight, with the figures against the boss (the view state is per encounter)
  return (
    <EncounterViewProvider key={query.data.url_id} encounter={query.data}>
      <EncounterBody />
    </EncounterViewProvider>
  );
}

function EncounterBody() {
  const { encounterTab } = useUiState();
  const tabsRef = React.useRef<HTMLElement>(null);
  const { encounter } = useEncounterView();

  // the tab is kept from encounter to encounter, but not every encounter has a replay
  const tab = encounterTab === 'replay' && !encounter.has_replay ? 'combat_stats' : encounterTab;
  React.useEffect(() => {
    if (tab !== encounterTab) uiStore.set({ encounterTab: tab });
  }, [tab, encounterTab]);

  let content;
  if (tab === 'combat_stats') content = <CombatData />;
  else if (tab === 'boss_metrics') content = <BossMetrics />;
  else if (tab === 'replay') content = <ReplayTab urlId={encounter.url_id} topElement={tabsRef} />;
  else content = <Buffs tabId={tab} />;

  return (
    <>
      <EncounterHeader />
      <EncounterTabs ref={tabsRef} tab={tab} />
      {content}
      <p>
        Found an error?{' '}
        <Link to="/info-contact" state={{ subject: `Error report: ${encounter.url_id}` }}>Contact us</Link>!
      </p>
    </>
  );
}
