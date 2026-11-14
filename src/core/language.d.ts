export type Language = 'es' | 'en' | 'zh-Hans' | 'hi';
/** The option of «Idioma»: 'auto' follows the browser's languages. */
export type LanguageChoice = 'auto' | Language;

export const LANGUAGES: readonly Language[];
export function isLanguage(value: unknown): value is Language;
export function matchLanguage<T extends string>(tags: readonly string[] | undefined | null, supported: readonly T[]): T;
export function resolveLanguage(choice: LanguageChoice, tags: readonly string[] | undefined | null): Language;
