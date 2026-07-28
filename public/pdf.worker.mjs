// PDF.js 6 uses the Uint8Array Base64/hex proposal. Safari versions that do
// not yet ship it need the methods inside the worker's own global scope.
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value() {
      let result = "";
      for (const byte of this) result += byte.toString(16).padStart(2, "0");
      return result;
    },
  });
}

if (typeof Uint8Array.fromBase64 !== "function") {
  Object.defineProperty(Uint8Array, "fromBase64", {
    configurable: true,
    writable: true,
    value(value) {
      const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
      }
      return bytes;
    },
  });
}

await import("./pdf.worker.min.mjs");
