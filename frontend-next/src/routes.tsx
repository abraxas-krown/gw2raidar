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
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ResetPassword } from './pages/auth/ResetPassword';
import { EncounterPage } from './pages/encounter/EncounterPage';
import { EncountersPage } from './pages/encounters/EncountersPage';
import { NotFound, Placeholder } from './pages/Placeholder';
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

const placeholder = (path: string, title: string, signedIn = false): RouteObject => ({
  path,
  element: signedIn ? <SignedIn><Placeholder title={title} /></SignedIn> : <Placeholder title={title} />,
});

const INFO_PAGES: [string, string][] = [
  ['info-help', 'Help'],
  ['info-releasenotes', 'Release Notes'],
  ['info-contact', 'Contact Us'],
  ['info-about', 'About Us'],
  ['info-framework', 'Framework'],
  ['info-api', 'API'],
];

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

      // not ported yet
      placeholder('leaderboards/:no?', 'Leaderboards', true),
      placeholder('profile/:era?', 'Personal Stats', true),
      placeholder('uploads/:no?', 'Upload', true),
      placeholder('account/:no?', 'Account', true),
      placeholder('global_stats/*', 'Global Stats'),
      placeholder('api/global_stats/*', 'Global Stats'),
      ...INFO_PAGES.map(([path, title]) => placeholder(`${path}/:no?`, title)),

      { path: '*', element: <NotFound /> },
    ],
  },
]);
