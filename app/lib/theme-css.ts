/**
 * Stylesheets that belong to one theme (MSN, Winamp, TeamSpeak, Minecraft…)
 * live in app/theme-css/ and load only while that theme is on, instead of in
 * the global CSS every visitor downloads. The theme is applied from
 * localStorage after the page loads, so this adds no flash for the default
 * theme; the first switch to one of these themes waits a moment for its file.
 */
const sheets = import.meta.glob("../theme-css/*.css");
const loading = new Map<string, Promise<unknown>>();

/** The file a theme's rules are in: "msn" covers msn and msn-dark. */
export function themeCssFile(themeId: string): string | null {
  const group = themeId.startsWith("msn") ? "msn" : themeId;
  const path = `../theme-css/${group}.css`;
  return path in sheets ? path : null;
}

/** Loads the theme's stylesheet once; resolves at once for themes without one. */
export function loadThemeCss(themeId: string): Promise<unknown> {
  const path = themeCssFile(themeId);
  if (!path) return Promise.resolve();
  let pending = loading.get(path);
  if (!pending) {
    pending = sheets[path]().catch((error) => {
      // Let a later switch try again (a deploy can replace the file's hash).
      loading.delete(path);
      console.warn("Could not load the theme's stylesheet", error);
    });
    loading.set(path, pending);
  }
  return pending;
}
