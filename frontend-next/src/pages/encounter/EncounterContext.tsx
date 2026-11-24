// The encounter page's view state, which its tables share: the phase shown, and the Boss/Total and
// Uptime/Output toggles (page.* in the current frontend)
import * as React from 'react';
import type { Encounter, Phase } from '../../api/types';

export interface EncounterView {
  encounter: Encounter;
  phaseName: string;
  phase: Phase;
  setPhase: (name: string) => void;
  // damage and breakbar damage show the figures against the boss first
  dpsBoss: boolean;
  setDpsBoss: (boss: boolean) => void;
  // once the damage toggle is used, the bars stop animating in
  dpsToggled: boolean;
  breakbarBoss: boolean;
  setBreakbarBoss: (boss: boolean) => void;
  boonOutput: boolean;
  setBoonOutput: (output: boolean) => void;
}

const EncounterContext = React.createContext<EncounterView | null>(null);

export interface EncounterViewProviderProps {
  encounter: Encounter;
  children: React.ReactNode;
}

export function EncounterViewProvider({ encounter, children }: EncounterViewProviderProps) {
  const [phaseName, setPhase] = React.useState('All');
  const [dpsBoss, setDpsBossState] = React.useState(true);
  const [dpsToggled, setDpsToggled] = React.useState(false);
  const [breakbarBoss, setBreakbarBoss] = React.useState(true);
  const [boonOutput, setBoonOutput] = React.useState(false);

  const phase = encounter.phases[phaseName] ?? encounter.phases.All;
  const value: EncounterView = {
    encounter,
    phaseName: encounter.phases[phaseName] ? phaseName : 'All',
    phase,
    setPhase,
    dpsBoss,
    setDpsBoss: boss => {
      setDpsBossState(boss);
      setDpsToggled(true);
    },
    dpsToggled,
    breakbarBoss,
    setBreakbarBoss,
    boonOutput,
    setBoonOutput,
  };
  return <EncounterContext.Provider value={value}>{children}</EncounterContext.Provider>;
}

export function useEncounterView(): EncounterView {
  const value = React.useContext(EncounterContext);
  if (!value) throw new Error('useEncounterView() outside <EncounterViewProvider>');
  return value;
}
