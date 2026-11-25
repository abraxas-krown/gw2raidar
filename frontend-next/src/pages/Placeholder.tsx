// The pages this frontend has not ported yet: they have their URLs (the same as the current frontend's), and
// say so for now
import styles from './Placeholder.module.css';

export interface PlaceholderProps {
  title: string;
}

export function Placeholder({ title }: PlaceholderProps) {
  return (
    <section className={styles.placeholder}>
      <h2>{title}</h2>
      <p className="text-muted">This page has not been ported to the new frontend yet.</p>
    </section>
  );
}

export function NotFound() {
  return (
    <section className={styles.placeholder}>
      <h2>Page not found</h2>
      <p className="text-muted">There is no page at this address.</p>
    </section>
  );
}
