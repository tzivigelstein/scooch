/** What the browser says of its platform (a Navigator, or part of one). */
export interface PlatformInfo {
  userAgentData?: { platform?: string } | null;
  platform?: string;
}

export function isApplePlatform(nav: PlatformInfo | null | undefined): boolean;
