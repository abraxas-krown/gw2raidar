// The pages and their URLs: the same URLs as the current frontend (frontend/assets/router.js), so the page
// locations in docker/nginx-next.conf (and docker/nginx.conf) serve this app's shell for them.
//
//   /                                         Help for guests, Release notes for users
//   /<name>[/<no>]                            encounters, leaderboards, profile, uploads, account, register, login,
//                                             reset_pw, info-help, info-releasenotes, info-contact, info-about,
//                                             info-framework, info-api
//   /encounter/<url_id>                       one encounter
//   /global_stats[/<era>][/area-<id>|/<kind>] global stats (also under /api/global_stats…)
import * as React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ResetPassword } from './pages/auth/ResetPassword';
import { EncounterPage } from './pages/encounter/EncounterPage';
import { EncountersPage } from './pages/encounters/EncountersPage';
import { AccountPage } from './pages/account/AccountPage';
import { GlobalStatsPage } from './pages/globalStats/GlobalStatsPage';
import { About } from './pages/info/About';
import { Api } from './pages/info/Api';
import { Contact } from './pages/info/Contact';
import { Framework } from './pages/info/Framework';
import { Help } from './pages/info/Help';
import { ReleaseNotes } from './pages/info/ReleaseNotes';
import { LeaderboardsPage } from './pages/leaderboards/LeaderboardsPage';
import { NotFound } from './pages/Placeholder';
import { ProfilePage } from './pages/profile/ProfilePage';
import { UploadsPage } from './pages/uploads/UploadsPage';
import { useSignedIn } from './session/SessionProvider';

interface SignedInProps {
  children: React.ReactNode;
}

// pages for signed-in users only; guests are sent to log in, and come back here after
function SignedIn({ children }: SignedInProps) {
  const signedIn = useSignedIn();
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

interface GuestProps {
  children: React.ReactNode;
}

// the login and registration pages are for guests; once signed in, the user goes on to the page that sent them
// here (or the default page)
function Guest({ children }: GuestProps) {
  const signedIn = useSignedIn();
  const from = (useLocation().state as { from?: string } | null)?.from;
  return signedIn ? <Navigate to={from || '/'} replace /> : children;
}

function Home() {
  return <Navigate to={useSignedIn() ? '/info-releasenotes' : '/info-help'} replace />;
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },

      { path: 'login', element: <Guest><Login /></Guest> },
      { path: 'register', element: <Guest><Register /></Guest> },
      { path: 'reset_pw', element: <Guest><ResetPassword /></Guest> },

      { path: 'encounters/:page?', element: <SignedIn><EncountersPage /></SignedIn> },
      { path: 'encounter/:urlId', element: <EncounterPage /> },

      // the current site sends guests to log in for these too
      { path: 'leaderboards/:no?', element: <SignedIn><LeaderboardsPage /></SignedIn> },
      { path: 'profile/:era?', element: <SignedIn><ProfilePage /></SignedIn> },
      { path: 'uploads/:no?', element: <SignedIn><UploadsPage /></SignedIn> },
      { path: 'account/:no?', element: <SignedIn><AccountPage /></SignedIn> },

      { path: 'global_stats/*', element: <GlobalStatsPage /> },
      { path: 'api/global_stats/*', element: <GlobalStatsPage /> },

      { path: 'info-help/:no?', element: <Help /> },
      { path: 'info-releasenotes/:no?', element: <ReleaseNotes /> },
      { path: 'info-contact/:no?', element: <Contact /> },
      { path: 'info-about/:no?', element: <About /> },
      { path: 'info-framework/:no?', element: <Framework /> },
      { path: 'info-api/:no?', element: <Api /> },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
