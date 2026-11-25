// Filtering, sorting and paging the encounter list (encountersFiltered, encounterPages in frontend/assets/script.js)
import type { EncounterRow } from '../../api/types';
import type { EncounterFilter, SortProp } from '../../lib/settings';

export const PAGE_SIZE = 10;
const PAGINATION_WINDOW = 5;

const DURATION = /^([0-9]+)(?::([0-5]?[0-9](?:\.[0-9]{0,3})?)?)?/;
const DATE = /^(\d{4})(?:-(?:(\d{1,2})(?:-(?:(\d{1,2}))?)?)?)?$/;

// the start of a "yyyy[-mm[-dd]]" date, in seconds; with `after`, the start of the next year, month or day
function dateBound(text: string, after: boolean): number | null {
  const m = text.match(DATE);
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1 || 0, +m[3] || 1);
  if (after) {
    if (m[3]) date.setDate(date.getDate() + 1);
    else if (m[2]) date.setMonth(date.getMonth() + 1);
    else date.setFullYear(date.getFullYear() + 1);
  }
  return date.getTime() / 1000;
}

// "m[:ss]" in seconds
function durationBound(text: string): number | null {
  const m = text.match(DURATION);
  if (!m) return null;
  return (+m[1] || 0) * 60 + (+m[2] || 0);
}

// The encounters the filter lets through, and whether any filter applies
export function filterEncounters(encounters: EncounterRow[], filter: EncounterFilter): { rows: EncounterRow[]; any: boolean } {
  let rows = encounters;
  let any = false;
  const keep = (test: (row: EncounterRow) => boolean) => {
    any = true;
    rows = rows.filter(test);
  };

  if (filter.success != null) keep(e => e.success === filter.success);
  if (filter.area) keep(e => e.area === filter.area);
  if (filter.mode != null) keep(e => (e.mode ?? 0) === filter.mode);

  const bound = (text: string | null | undefined, toBound: (text: string) => number | null, test: (row: EncounterRow, b: number) => boolean) => {
    if (!text) return;
    const b = toBound(text);
    if (b !== null) keep(row => test(row, b));
  };
  bound(filter.started_from, t => dateBound(t, false), (e, b) => e.started_at >= b);
  bound(filter.started_till, t => dateBound(t, true), (e, b) => e.started_at < b);
  bound(filter.duration_from, durationBound, (e, b) => e.duration >= b);
  bound(filter.duration_till, durationBound, (e, b) => e.duration <= b);
  bound(filter.uploaded_from, t => dateBound(t, false), (e, b) => e.uploaded_at >= b);
  bound(filter.uploaded_till, t => dateBound(t, true), (e, b) => e.uploaded_at < b);

  if (filter.character) keep(e => e.character === filter.character);
  if (filter.account) keep(e => e.account === filter.account);
  if (filter.category != null) {
    const category = filter.category || null;  // 0: uncategorised
    keep(e => e.category === category);
  }
  if (filter.tag) {
    const tag = filter.tag.toLowerCase();
    keep(e => e.tags.some(t => t.toLowerCase().startsWith(tag)));
  }
  return { rows, any };
}

// encounters of the same boss are ordered by mode (normal, CM, LCM)
const sortValue = (row: EncounterRow, prop: SortProp) =>
  prop === 'area' ? row.area + '\u0000' + (row.mode || 0) : (row[prop] as string | number | null);

export function sortEncounters(rows: EncounterRow[], prop: SortProp, dir: 'up' | 'down'): EncounterRow[] {
  const sign = dir === 'up' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, prop) ?? '';
    const vb = sortValue(b, prop) ?? '';
    return va > vb ? sign : va < vb ? -sign : 0;
  });
}

export const distinct = (values: string[]) => Array.from(new Set(values)).sort();

// The pagination links: previous, first, a window around the current page (with gaps), last, next
export interface PageLink {
  label: string;
  page?: number;     // where it leads; none for a gap
  active?: boolean;
  disabled?: boolean;
  kind?: 'previous' | 'next';
}

export function pageLinks(page: number, total: number): PageLink[] {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const min = Math.max(2, page - PAGINATION_WINDOW);
  const max = Math.min(pages - 1, page + PAGINATION_WINDOW);
  const links: PageLink[] = [{ label: '<', page: page - 1, disabled: page <= 1, kind: 'previous' }];
  links.push({ label: '1', page: 1, active: page === 1 });
  if (min > 2) links.push({ label: '…', disabled: true });
  for (let i = min; i <= max; i++) links.push({ label: String(i), page: i, active: i === page });
  if (max < pages - 1) links.push({ label: '…', disabled: true });
  if (pages > 1) links.push({ label: String(pages), page: pages, active: page === pages });
  links.push({ label: '>', page: page + 1, disabled: page >= pages, kind: 'next' });
  return links;
}
