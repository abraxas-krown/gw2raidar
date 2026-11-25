import { Link } from 'react-router';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.columns}>
          <ul className={styles.links}>
            <li><Link to="/info-help">Help</Link></li>
            <li><Link to="/info-releasenotes">Release Notes</Link></li>
            <li><a target="_blank" rel="noopener" href="https://github.com/GW2Raidar/gw2raidar">Contribute</a></li>
          </ul>
          <ul className={styles.links}>
            <li><Link to="/info-contact">Contact Us</Link></li>
            <li><Link to="/info-about">About Us</Link></li>
          </ul>
        </div>
        <div className={styles.legal}>
          <p>GW2Raidar is not sponsored by or affiliated with NCsoft or ArenaNet.</p>
          <p>
            All associated logos &amp; designs not openly released as public assets are trademarks or registered
            trademarks of NCsoft Corporation.
          </p>
        </div>
      </div>
    </footer>
  );
}
