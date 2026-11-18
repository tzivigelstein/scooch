/** «now», «3 minutes ago», «yesterday», «Nov 12»… */
export function relativeTime(then: number, now?: number, options?: { locale?: string }): string;
/** From this share of the browser's space on, using it is a warning. */
export const STORAGE_WARN: number;
/** How much of the browser's space is used, for a bar; null without a quota. */
export function storageShare(usage: number, quota: number | undefined): { share: number; percent: number | null; fill: number; warning: boolean } | null;
/** «820 B», «3.2 MB» (base 1000). */
export function formatBytes(bytes: number, options?: { locale?: string }): string;
