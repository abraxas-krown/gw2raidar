// The groups of buffs on a tab of several kinds of buff (Equipped Buffs): side by side, half a buff's width apart,
// each as wide as the whole columns of buffs it shows. When the row is too narrow for every buff of every group in
// one row, the groups get fewer columns (in proportion to their buffs) and their buffs wrap within them.
import * as React from 'react';
import s from './StatsTable.module.css';

const CELL = 74;       // a buff's width (px)
const CELL_GAP = 8;    // between buffs
const GROUP_GAP = 37;  // between groups: half a buff's width

const widthOf = (columns: number) => columns * (CELL + CELL_GAP) - CELL_GAP;

// the columns of each group (it has `counts[i]` buffs) so that together they fit `width`
export function fitColumns(counts: number[], width: number): number[] {
  const columns = [...counts];
  const total = () => columns.reduce((sum, c) => sum + widthOf(c), (columns.length - 1) * GROUP_GAP);
  while (total() > width) {
    let narrowest = -1;
    columns.forEach((c, i) => {
      if (c > 1 && (narrowest < 0 || c / counts[i] > columns[narrowest] / counts[narrowest])) narrowest = i;
    });
    if (narrowest < 0) break;
    columns[narrowest]--;
  }
  return columns;
}

export interface BuffGroupsProps {
  // the groups' buffs: as many columns as buffs, at most
  counts: number[];
  children: React.ReactNode;
}

export function BuffGroups({ counts, children }: BuffGroupsProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(Infinity);
  const key = counts.join(',');

  React.useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const columns = React.useMemo(() => fitColumns(counts, width), [key, width]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={root} className={s.buffGroups} style={{ gridTemplateColumns: columns.map(c => `${widthOf(c)}px`).join(' ') }}>
      {children}
    </div>
  );
}
