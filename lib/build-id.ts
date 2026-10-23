/**
 * Which build this code came from. vite.config.ts stamps one id into the
 * server and the page alike, so a page that gets a different answer from
 * /api/version knows the server was redeployed (or rolled back) after it
 * loaded. Outside a vite build (the tests) there is no stamp.
 */
export const buildId: string = typeof __HOFFLE_BUILD__ === "string" ? __HOFFLE_BUILD__ : "dev";
