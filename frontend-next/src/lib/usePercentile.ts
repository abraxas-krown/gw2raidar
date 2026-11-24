import * as React from 'react';
import { percentileStyle } from './percentiles';
import { useSettings } from './settings';

// Props that colour an element by a percentile (0-100, or NEUTRAL) in the user's palette:
//   const pc = usePercentile();
//   <span {...pc(87)}>…</span>       (className "pctl" and its style)
export function usePercentile() {
  const { palette = 'default' } = useSettings();
  return React.useCallback(
    (percentile: number, className?: string) => ({
      className: className ? `pctl ${className}` : 'pctl',
      style: percentileStyle(percentile, palette),
    }),
    [palette],
  );
}
