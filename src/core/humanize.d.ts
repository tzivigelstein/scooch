/** «ahora», «hace 3 minutos», «ayer», «12 nov»… */
export function relativeTime(then: number, now?: number, options?: { locale?: string }): string;
/** «820 B», «3,2 MB» (base 1000). */
export function formatBytes(bytes: number, options?: { locale?: string }): string;
