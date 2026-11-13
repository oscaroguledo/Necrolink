import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging Tailwind classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Convert ISO date to Wayback timestamp (YYYYMMDDhhmmss)
 */
export function toWaybackTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Convert Wayback timestamp to Date
 */
export function fromWaybackTimestamp(timestamp: string): Date {
  const year = parseInt(timestamp.substring(0, 4));
  const month = parseInt(timestamp.substring(4, 6)) - 1;
  const day = parseInt(timestamp.substring(6, 8));
  const hours = parseInt(timestamp.substring(8, 10) || '0');
  const minutes = parseInt(timestamp.substring(10, 12) || '0');
  const seconds = parseInt(timestamp.substring(12, 14) || '0');
  
  return new Date(year, month, day, hours, minutes, seconds);
}

/**
 * Result type for error handling
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function Ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function Err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
