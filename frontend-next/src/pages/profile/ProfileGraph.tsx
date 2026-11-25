// The graph of one of a player's stats over their last encounters (profile_graph.json), against the global 99th,
// 90th and 50th percentiles and average of that stat: in a dialog, as the current site's Chart.js line chart
import * as React from 'react';
import { createPortal } from 'react-dom';
import { formatDate, num } from '../../lib/format';
import { Icon } from '../../ui/controls';
import styles from './Profile.module.css';

export interface GraphData {
  globals?: { per: number[]; avg: number } | null;
  data: number[];
  times: number[];
}

export interface ProfileGraphProps {
  title: string;
  statName: string;
  graph: GraphData;
  onClose: () => void;
}

const W = 1000;
const H = 560;
const PAD = { left: 70, right: 20, top: 60, bottom: 90 };

// a round step for the y axis, about 6 of them up to max
function niceStep(max: number) {
  const raw = max / 6 || 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find(u => u * power >= raw) ?? 10;
  return unit * power;
}

export function ProfileGraph({ title, statName, graph, onClose }: ProfileGraphProps) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // a single point is drawn in the middle
  const single = graph.data.length === 1;
  const values = single ? [graph.data[0], graph.data[0], graph.data[0]] : graph.data;
  const labels = single ? ['', formatDate(graph.times[0]), ''] : graph.times.map(t => formatDate(t));
  const lines = graph.globals
    ? [
      { label: 'P99', value: graph.globals.per[99], dash: '1 1', colour: 'rgb(128 128 128)' },
      { label: 'P90', value: graph.globals.per[90], dash: '4 4', colour: 'rgb(128 128 128)' },
      { label: 'P50', value: graph.globals.per[50], dash: '7 7', colour: 'rgb(128 128 128)' },
      { label: 'avg', value: graph.globals.avg, dash: undefined, colour: 'rgb(255 0 255)' },
    ]
    : [];

  const top = Math.max(1, ...values, ...lines.map(l => l.value ?? 0));
  const step = niceStep(top);
  const yMax = Math.ceil(top / step) * step;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (values.length > 1 ? (i * plotW) / (values.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const legend = [...lines.map(l => ({ label: l.label, colour: l.colour, dash: l.dash })), { label: statName, colour: 'rgb(0 0 0)', dash: undefined }];

  return createPortal(
    <div className={styles.modal} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.dialog} onClick={event => event.stopPropagation()}>
        <button type="button" className={styles.closeDialog} aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.graph} role="img" aria-label={title}>
          <text x={W / 2} y={22} textAnchor="middle" className={styles.graphTitle}>{title}</text>
          {legend.map((item, i) => (
            <g key={item.label} transform={`translate(${W / 2 - (legend.length * 90) / 2 + i * 90}, 40)`}>
              <line x1="0" x2="30" y1="0" y2="0" stroke={item.colour} strokeWidth="2" strokeDasharray={item.dash} />
              <text x="36" y="4" className={styles.graphLabel}>{item.label}</text>
            </g>
          ))}
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(0 0 0 / 0.1)" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={styles.graphLabel}>{num(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => label && (
            <text key={i} transform={`translate(${x(i)}, ${H - PAD.bottom + 12}) rotate(-50)`} textAnchor="end" className={styles.graphLabel}>
              {label}
            </text>
          ))}
          {lines.map(l => l.value !== undefined && (
            <line key={l.label} x1={x(0)} x2={x(values.length - 1)} y1={y(l.value)} y2={y(l.value)}
              stroke={l.colour} strokeWidth="2" strokeDasharray={l.dash} />
          ))}
          <path d={`${path} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="rgb(0 0 0 / 0.05)" />
          <path d={path} fill="none" stroke="rgb(0 0 0)" strokeWidth="2" />
          {values.map((v, i) => (!single || i === 1) && (
            <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="white" stroke="black">
              <title>{`${labels[i]}: ${num(v, 0)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>,
    document.body,
  );
}
