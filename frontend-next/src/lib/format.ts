// Number, time and date formatting, as the current frontend's helpers (frontend/assets/script.js) do it.

const twoDigits = (n: number) => (n < 10 ? '0' + n : String(n));

// num(1234.5) is "1,234.5", num(1234.5, 2) "1,234.50", num(1234.5, 0) "1,234"; nothing for undefined
export function num(n: number | null | undefined, digits?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  const text = digits == null ? n.toString() : n.toFixed(digits);
  const parts = text.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// a percentage, with 2 decimals unless told otherwise: perc(23.2) is "23.20%", perc(23.2, 0) "23%"
export function perc(n: number | null | undefined, digits: number | null = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  return num(n, digits ?? undefined) + '%';
}

// 1 -> "1st", 22 -> "22nd", 13 -> "13th"
export function th(n: number): string {
  const ones = n % 10;
  const tens = (n % 100) - ones;
  const suffix = tens === 10 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
  return n + suffix;
}

// a bar's width in percent, at most max (100)
export function clamp(n: number, max = 100): number {
  return Math.min(Number.isFinite(n) ? n : 0, max);
}

// seconds since the epoch -> "2024-01-31 18:04:05" (local time), or the date alone
export function formatDate(timestamp: number | null | undefined, onlyDate = false): string {
  if (timestamp === undefined || timestamp === null) return '';
  const date = new Date(timestamp * 1000);
  const day = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
  if (onlyDate) return day;
  return `${day} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

// seconds -> "4:05.120", or "5.120" under a minute
export function formatTime(duration: number | null | undefined): string {
  if (duration === undefined || duration === null) return '';
  let seconds = Math.trunc(duration);
  const minutes = Math.trunc(seconds / 60);
  const ms = Math.trunc((duration - seconds) * 1000);
  seconds -= minutes * 60;
  const msText = ms < 10 ? '00' + ms : ms < 100 ? '0' + ms : String(ms);
  if (minutes) return `${minutes}:${twoDigits(seconds)}.${msText}`;
  return `${seconds}.${msText}`;
}

// a player's activity in an encounter: the share of the fight they were up (not down, dead or disconnected)
export interface Events {
  dead_count?: number;
  dead_time?: number;
  down_count?: number;
  down_time?: number;
  disconnect_count?: number;
  disconnect_time?: number;
}
export function activity(events: Events | undefined, duration: number): number {
  if (!events || !duration) return 100;
  const away = ((events.down_time || 0) + (events.dead_time || 0) + (events.disconnect_time || 0)) / 1000;
  return Math.max(0, Math.min(100, ((duration - away) / duration) * 100));
}
