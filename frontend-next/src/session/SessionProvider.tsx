// The app starts once the reference data (bootstrap.json) and the signed-in user (initial.json) are in, as the
// current frontend does; both are fetched in parallel. Until then, the loading screen.
import * as React from 'react';
import { useBootstrapQuery, useInitialQuery } from '../api/queries';
import type { Bootstrap, Session } from '../api/types';
import { Loader } from '../ui/Loader';

interface SessionValue {
  bootstrap: Bootstrap;
  session: Session;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const bootstrap = useBootstrapQuery();
  const initial = useInitialQuery();

  if (bootstrap.isError || initial.isError) {
    return (
      <div className="text-center" style={{ padding: '96px 16px' }}>
        <h2>GW2 Raidar could not be reached</h2>
        <p>Please try again in a moment.</p>
      </div>
    );
  }
  if (!bootstrap.data || !initial.data) return <Loader />;

  return (
    <SessionContext.Provider value={{ bootstrap: bootstrap.data, session: initial.data }}>
      {children}
    </SessionContext.Provider>
  );
}

function useSessionValue(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error('useSession() outside <SessionProvider>');
  return value;
}

export const useBootstrap = () => useSessionValue().bootstrap;
export const useSession = () => useSessionValue().session;
export const useSignedIn = () => !!useSessionValue().session.username;
