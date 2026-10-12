import { basePath } from "../../lib/client";

export type PdfJs = typeof import("pdfjs-dist");

// 96 CSS px per 72 pt: pdf.js "scale 1" is 72 dpi, but a "100%" zoom label
// should match what every other PDF reader calls 100%.
export const CSS_UNITS = 96 / 72;

/** Safari and older Chromium lack a few ES proposals that pdf.js / pdf-lib use. */
export function ensurePdfRuntimeCompatibility() {
  type CompatibleBytes = typeof Uint8Array & {
    fromBase64?: (value: string) => Uint8Array;
  };
  type CompatibleBytesInstance = Uint8Array & { toHex?: () => string };
  const bytesPrototype = Uint8Array.prototype as CompatibleBytesInstance;
  if (typeof bytesPrototype.toHex !== "function") {
    Object.defineProperty(bytesPrototype, "toHex", {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let result = "";
        for (const byte of this) result += byte.toString(16).padStart(2, "0");
        return result;
      },
    });
  }
  const bytesConstructor = Uint8Array as CompatibleBytes;
  if (typeof bytesConstructor.fromBase64 !== "function") {
    Object.defineProperty(bytesConstructor, "fromBase64", {
      configurable: true,
      writable: true,
      value(value: string) {
        const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
        return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
      },
    });
  }

  type CompatibleMap = Map<unknown, unknown> & {
    getOrInsertComputed?: (
      key: unknown,
      callback: (key: unknown) => unknown,
    ) => unknown;
  };
  const prototype = Map.prototype as CompatibleMap;
  if (typeof prototype.getOrInsertComputed !== "function") {
    Object.defineProperty(prototype, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value(
        this: Map<unknown, unknown>,
        key: unknown,
        callback: (key: unknown) => unknown,
      ) {
        if (!this.has(key)) this.set(key, callback(key));
        return this.get(key);
      },
    });
  }
}

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    ensurePdfRuntimeCompatibility();
    pdfjsPromise = import("pdfjs-dist").then((module) => {
      module.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.mjs`;
      return module;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

/** Character maps and the 14 standard fonts, so CJK and un-embedded fonts render. */
export const PDF_ASSET_URLS = {
  cMapUrl: `${basePath}/pdfjs/cmaps/`,
  standardFontDataUrl: `${basePath}/pdfjs/standard_fonts/`,
};
