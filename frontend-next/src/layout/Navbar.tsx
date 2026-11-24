// The header: a top bar with the account links (on wider screens), then the logo and the site's navigation
import * as React from 'react';
import { NavLink, useMatch } from 'react-router';
import { useEncounterQuery } from '../api/queries';
import { IMG } from '../lib/assets';
import { useBootstrap, useSession } from '../session/SessionProvider';
import { useAuth } from '../session/useAuth';
import { cx, Icon } from '../ui/controls';
import { useToast } from '../ui/Toast';
import { useTooltip } from '../ui/Tooltip';
import styles from './Navbar.module.css';

const headerStyle = { '--header-image': `url(${IMG}background/header-concept.jpg)` } as React.CSSProperties;

interface ItemProps {
  to: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
  title?: string;
}

function Item({ to, active, className, children, title }: ItemProps) {
  const tooltip = useTooltip();
  return (
    <li className={className}>
      <NavLink
        to={to}
        className={({ isActive }) => cx((active ?? isActive) && styles.active)}
        aria-label={title}
        {...tooltip(title, { pos: 'bottom' })}
      >
        {children}
      </NavLink>
    </li>
  );
}

export function Navbar() {
  const session = useSession();
  const bootstrap = useBootstrap();
  const { logout } = useAuth();
  const notify = useToast();
  const tooltip = useTooltip();
  const signedIn = !!session.username;

  // on an encounter's page, the admin link goes to that encounter in the admin
  const encounterMatch = useMatch('/encounter/:urlId');
  const encounter = useEncounterQuery(session.is_staff ? encounterMatch?.params.urlId : undefined);
  const encountersActive = !!useMatch('/encounters/*') || !!encounterMatch;
  const adminURL = bootstrap.urls.admin + (encounter.data ? `raidar/encounter/${encounter.data.id}/change/` : '');

  const onLogout = (event: React.MouseEvent) => {
    event.preventDefault();
    logout.mutate(undefined, { onError: error => notify(error.message, 'danger') });
  };

  const accountLabel = `Account: ${session.username}`;

  return (
    <header className={styles.header} style={headerStyle}>
      <div className={styles.topBar}>
        <div className={styles.container}>
          <nav className={cx(styles.navbar, styles.end)} aria-label="Account">
            <ul className={cx(styles.nav, 'show-m')}>
              {signedIn ? (
                <>
                  {session.is_staff && <li><a href={adminURL}>Admin</a></li>}
                  <Item to="/account" className={styles.noHover} title={accountLabel}>
                    <Icon name="perm_identity" className={styles.iconGap} />
                  </Item>
                  <li className={styles.noHover}>
                    <a href="/logout" onClick={onLogout} aria-label="Logout" {...tooltip('Logout', { pos: 'bottom' })}>
                      <Icon name="exit_to_app" className={styles.iconGap} />
                    </a>
                  </li>
                </>
              ) : (
                <>
                  <Item to="/login" className={styles.noHover} title="Login"><Icon name="input" className={styles.iconGap} /></Item>
                  <Item to="/register">Register</Item>
                </>
              )}
            </ul>
          </nav>
        </div>
      </div>

      <div className={styles.container}>
        <nav className={styles.navbar} aria-label="Site">
          <div className={styles.left}>
            <NavLink to="/" className={styles.logo}>
              <img className={cx(styles.logoFull, 'show-m')} width="190" src={`${IMG}logo/full-logo.svg`} alt="GW2 Raidar Logo" />
              <img className={cx(styles.logoMark, 'hide-m')} width="40" height="40" src={`${IMG}logo/mark-logo.svg`} alt="GW2 Raidar Logo" />
            </NavLink>
            <ul className={cx(styles.nav, styles.hover)}>
              <Item to="/global_stats">Global Stats</Item>
              <Item to="/leaderboards">Leaderboards</Item>
              {signedIn ? (
                <>
                  <Item to="/profile">Personal Stats</Item>
                  <Item to="/encounters" active={encountersActive}>Encounters</Item>
                  {session.is_staff && <li className="hide-m"><a href={adminURL}>Admin</a></li>}
                  <Item to="/account" className="hide-m" title={accountLabel}><Icon name="perm_identity" /></Item>
                  <li className="hide-m">
                    <a href="/logout" onClick={onLogout} aria-label="Logout"><Icon name="exit_to_app" /></a>
                  </li>
                </>
              ) : (
                <>
                  <Item to="/login" className="hide-m"><Icon name="input" className={styles.iconGap} /> Login</Item>
                  <Item to="/register" className="hide-m">Register</Item>
                </>
              )}
            </ul>
          </div>
          <div className={cx(styles.right, 'show-m')}>
            <ul className={cx(styles.nav, styles.hover)}>
              {signedIn && (
                <Item to="/uploads"><Icon name="file_upload" className={styles.iconGap} />Upload</Item>
              )}
              <Item to="/info-help"><Icon name="help_outline" className={styles.iconGap} />Help</Item>
            </ul>
          </div>
        </nav>
      </div>
    </header>
  );
}
