/**
 * ThermoShift - Safe formatting utilities
 * Prevents NaN, Infinity, Invalid Date, undefined, null, or malformed strings from crashing UI components.
 */

/**
 * Format a date string safely (e.g., '2026-09-15' -> 'Sep 15, 2026')
 */
export function formatSafeDate(value: unknown, fallback = 'Not specified'): string {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'Invalid Date') {
    return fallback;
  }

  // Check ISO format YYYY-MM-DD
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts.map((p) => parseInt(p, 10));
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  return trimmed || fallback;
}

/**
 * Format a time string safely (e.g. '07:00:00' -> '07:00')
 */
export function formatSafeTime(value: unknown, fallback = 'Not specified'): string {
  if (!value || typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed.includes('NaN')) {
    return fallback;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = match[1].padStart(2, '0');
    const mins = match[2];
    return `${hours}:${mins}`;
  }

  return trimmed || fallback;
}

/**
 * Format duration in minutes safely (e.g. 150 -> '2h 30m')
 */
export function formatSafeDuration(minutes: unknown, fallback = '0m'): string {
  if (minutes === null || minutes === undefined) return fallback;
  const num = typeof minutes === 'number' ? minutes : parseFloat(String(minutes));
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) return fallback;

  const totalMinutes = Math.round(num);
  if (totalMinutes === 0) return '0m';

  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;

  if (hours > 0 && remainingMins > 0) {
    return `${hours}h ${remainingMins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainingMins}m`;
}

/**
 * Format finite numbers safely
 */
export function formatSafeNumber(value: unknown, fallback: number | string = 0): string {
  if (value === null || value === undefined) return String(fallback);
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return String(fallback);
  }
  return num.toLocaleString();
}

/**
 * Ensures an array is returned safely
 */
export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  return [];
}

/**
 * Ensures a safe string
 */
export function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  if (str === 'null' || str === 'undefined' || str === 'NaN') return fallback;
  return str || fallback;
}

/**
 * Safely lowercase a string or unknown value
 */
export function safeLowerCase(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Safely uppercase a string or unknown value
 */
export function safeUpperCase(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

/**
 * Case-insensitive comparison of two values
 */
export function safeEqualsIgnoreCase(a: unknown, b: unknown): boolean {
  return safeLowerCase(a) === safeLowerCase(b);
}

/**
 * Case-insensitive substring check
 */
export function safeContainsIgnoreCase(str: unknown, sub: unknown): boolean {
  const s = safeLowerCase(str);
  const target = safeLowerCase(sub);
  if (!target) return true;
  return s.includes(target);
}

