/**
 * True inside the Hoffle iOS/Android apps (mobile/, Capacitor).
 *
 * App Store and Play rules: no links to outside payments (Ko-fi, Sponsors)
 * from inside the app, so those are hidden there and stay on the website.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}
