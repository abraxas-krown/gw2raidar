// The Help page (frontend/src/partials/info_help.html): the text, with a menu of its sections that stays in view
// on wider screens and marks the section being read
import * as React from 'react';
import { cx } from '../../ui/controls';
import { HelpContent } from './HelpContent';
import styles from './Info.module.css';

const SECTIONS: [string, string][] = [
  ['what', 'What is GW2 Raidar?'],
  ['getting-started', 'Getting Started'],
  ['uploading', 'Uploading Logs'],
  ['how-it-works', 'How GW2 Raidar Works'],
  ['encounter-list', 'Encounter List'],
  ['encounter-page', 'Encounter Page'],
  ['personal-stats', 'Personal Stats'],
  ['global-stats', 'Global Stats'],
  ['api', 'API'],
  ['faq', 'FAQ'],
];

// the section whose heading was last scrolled past (uk-scrollspy-nav)
function useCurrentSection(): string {
  const [current, setCurrent] = React.useState(SECTIONS[0][0]);
  React.useEffect(() => {
    const update = () => {
      let found = SECTIONS[0][0];
      for (const [id] of SECTIONS) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= 80) found = id;
      }
      setCurrent(found);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return current;
}

export function Help() {
  const current = useCurrentSection();

  const goTo = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(history.state, '', `#${id}`);
  };

  return (
    <div className={styles.help}>
      <nav className={styles.helpMenu} aria-label="Help sections">
        <ul>
          {SECTIONS.map(([id, title]) => (
            <li key={id} className={cx(current === id && styles.current)}>
              <a href={`#${id}`} onClick={event => goTo(event, id)}>{title}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className={styles.page}>
        <HelpContent />
      </article>
    </div>
  );
}
