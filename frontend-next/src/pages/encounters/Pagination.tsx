import { Link } from 'react-router';
import { pageLinks } from './filtering';
import styles from './Encounters.module.css';

export interface PaginationProps {
  page: number;
  total: number;
}

export function Pagination({ page, total }: PaginationProps) {
  return (
    <ul className={styles.pagination} aria-label="Pages">
      {pageLinks(page, total).map((link, index) => (
        <li key={index} className={link.active ? styles.current : link.disabled ? styles.disabled : undefined}>
          {link.active || link.disabled || !link.page ? (
            <span aria-current={link.active ? 'page' : undefined}>{link.label}</span>
          ) : (
            <Link to={`/encounters/${link.page}`} aria-label={link.kind ? `${link.kind} page` : `page ${link.label}`}>
              {link.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
