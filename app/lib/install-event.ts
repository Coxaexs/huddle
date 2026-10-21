/**
 * Runs in <head> before React: keeps the browser's one-time
 * `beforeinstallprompt` event on window for app/components/install-prompt.tsx.
 * It lives outside that client module so the server layout gets the string itself.
 */
export const INSTALL_EVENT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){window.__hoffleInstall=e;window.dispatchEvent(new Event("hoffle-installable"))});window.addEventListener("appinstalled",function(){window.__hoffleInstall=null});`;
