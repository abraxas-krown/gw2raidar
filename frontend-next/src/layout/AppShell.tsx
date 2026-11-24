// The page around every page: the header (top bar and navigation), the page itself, and the footer
import { Outlet } from 'react-router';
import { useSettings } from '../lib/settings';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import styles from './AppShell.module.css';

export function AppShell() {
  const { palette = 'default' } = useSettings();
  return (
    <div data-palette={palette}>
      <Navbar />
      <div className={styles.container}>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
