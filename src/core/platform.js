// Which keyboard the person has: Apple's (⌘, ⌥, ⇧) or everyone else's
// (Ctrl, Alt, Shift). Pure: it reads what the browser says of itself, passed in.

/**
 * An Apple device (macOS, iOS, iPadOS)? From navigator.userAgentData.platform
 * where the browser has it («macOS»), else navigator.platform («MacIntel»,
 * «iPhone», «iPad»; iPadOS says «MacIntel» too).
 */
export function isApplePlatform(nav) {
  const platform = nav?.userAgentData?.platform || nav?.platform || '';
  return /^(mac|iphone|ipad|ipod|ios)/i.test(platform);
}
