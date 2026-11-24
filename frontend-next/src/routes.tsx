// The pages and their URLs: the same URLs as the current frontend (frontend/assets/router.js), so the page
// locations in docker/nginx-next.conf (and docker/nginx.conf) serve this app's shell for them.
//
//   /                                         Help for guests, Release notes for users
//   /<name>[/<no>]                            encounters, leaderboards, profile, uploads, account, register, login,
//                                             reset_pw, info-help, info-releasenotes, info-contact, info-about,
//                                             info-framework, info-api
//   /encounter/<url_id>                       one encounter
//   /global_stats[/<era>][/area-<id>|/<kind>] global stats (also under /api/global_stats…)
//
// Each page's code is loaded when its route is first visited (`lazy`), so the first load carries only the page
// around the pages (AppShell), the session and these routes.
import * as React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { AppShell } from './layout/AppShell';
import { NotFound } from './pages/Placeholder';
import { useSignedIn } from './session/SessionProvider';
import { Loader } from './ui/Loader';

interface GuardProps {
  children: React.ReactNode;
}

// pages for signed-in users only; guests are sent to log in, and come back here after
function SignedIn({ children }: GuardProps) {
  const signedIn = useSignedIn();
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

// the login and registration pages are for guests; once signed in, the user goes on to the page that sent them
// here (or the default page)
function Guest({ children }: GuardProps) {
  const signedIn = useSignedIn();
  const from = (useLocation().state as { from?: string } | null)?.from;
  return signedIn ? <Navigate to={from || '/'} replace /> : children;
}

function Home() {
  return <Navigate to={useSignedIn() ? '/info-releasenotes' : '/info-help'} replace />;
}

// A route's `lazy`: loads the page's module, then shows its component, inside a guard when there is one
function page(load: () => Promise<React.ComponentType>, Guard?: React.ComponentType<GuardProps>) {
  return async () => {
    const Page = await load();
    return { element: Guard ? <Guard><Page /></Guard> : <Page /> };
  };
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    // while the first page's code loads
    hydrateFallbackElement: <Loader />,
    children: [
      { index: true, element: <Home /> },

      { path: 'login', lazy: page(() => import('./pages/auth/Login').then(m => m.Login), Guest) },
      { path: 'register', lazy: page(() => import('./pages/auth/Register').then(m => m.Register), Guest) },
      { path: 'reset_pw', lazy: page(() => import('./pages/auth/ResetPassword').then(m => m.ResetPassword), Guest) },

      { path: 'encounters/:page?', lazy: page(() => import('./pages/encounters/EncountersPage').then(m => m.EncountersPage), SignedIn) },
      { path: 'encounter/:urlId', lazy: page(() => import('./pages/encounter/EncounterPage').then(m => m.EncounterPage)) },

      // the current site sends guests to log in for these too
      { path: 'leaderboards/:no?', lazy: page(() => import('./pages/leaderboards/LeaderboardsPage').then(m => m.LeaderboardsPage), SignedIn) },
      { path: 'profile/:era?', lazy: page(() => import('./pages/profile/ProfilePage').then(m => m.ProfilePage), SignedIn) },
      { path: 'uploads/:no?', lazy: page(() => import('./pages/uploads/UploadsPage').then(m => m.UploadsPage), SignedIn) },
      { path: 'account/:no?', lazy: page(() => import('./pages/account/AccountPage').then(m => m.AccountPage), SignedIn) },

      { path: 'global_stats/*', lazy: page(() => import('./pages/globalStats/GlobalStatsPage').then(m => m.GlobalStatsPage)) },
      { path: 'api/global_stats/*', lazy: page(() => import('./pages/globalStats/GlobalStatsPage').then(m => m.GlobalStatsPage)) },

      { path: 'info-help/:no?', lazy: page(() => import('./pages/info/Help').then(m => m.Help)) },
      { path: 'info-releasenotes/:no?', lazy: page(() => import('./pages/info/ReleaseNotes').then(m => m.ReleaseNotes)) },
      { path: 'info-contact/:no?', lazy: page(() => import('./pages/info/Contact').then(m => m.Contact)) },
      { path: 'info-about/:no?', lazy: page(() => import('./pages/info/About').then(m => m.About)) },
      { path: 'info-framework/:no?', lazy: page(() => import('./pages/info/Framework').then(m => m.Framework)) },
      { path: 'info-api/:no?', lazy: page(() => import('./pages/info/Api').then(m => m.Api)) },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
