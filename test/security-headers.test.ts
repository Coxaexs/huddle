import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_CSP,
  isSecureRequest,
  securityHeaders,
  withSecurityHeaders,
} from "@/lib/security-headers";

const httpsRequest = () =>
  new Request("https://hoffle.example/hangout/api/health", {
    headers: { "x-forwarded-proto": "https" },
  });

const httpRequest = () => new Request("http://localhost:8730/hangout/api/health");

describe("securityHeaders", () => {
  it("always sends the baseline headers", () => {
    const headers = securityHeaders();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("allows exactly the browser permissions voice needs and denies the rest", () => {
    const policy = securityHeaders()["permissions-policy"];
    // Voice, screen share and video are the whole point of the app.
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("display-capture=(self)");
    // Nothing here needs these, and denying them costs nothing.
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
  });

  it("sends HSTS only over HTTPS", () => {
    expect(securityHeaders({}, true)["strict-transport-security"]).toContain(
      "max-age=31536000",
    );
    // Over plain HTTP it would pin self-hosters to a scheme they are not serving.
    expect(securityHeaders({}, false)["strict-transport-security"]).toBeUndefined();
  });

  it("leaves CSP off unless asked for, because a wrong one breaks voice", () => {
    expect(securityHeaders()["content-security-policy"]).toBeUndefined();
    expect(securityHeaders({ csp: "" })["content-security-policy"]).toBeUndefined();
  });

  it("sends the recommended policy when the flag is set", () => {
    expect(securityHeaders({ csp: "1" })["content-security-policy"]).toBe(
      RECOMMENDED_CSP,
    );
  });

  it("keeps the policies this app actually needs in the recommended CSP", () => {
    // Guards against someone tightening this and silently breaking features.
    expect(RECOMMENDED_CSP).toContain("blob:");
    expect(RECOMMENDED_CSP).toContain("'wasm-unsafe-eval'");
    expect(RECOMMENDED_CSP).toContain("wss:");
  });

  it("prefers an operator's literal policy over the bundled one", () => {
    const custom = securityHeaders({ csp: "1", cspPolicy: "default-src 'self'" });
    expect(custom["content-security-policy"]).toBe("default-src 'self'");
  });

  it("accepts an explicit policy without the enable flag", () => {
    const custom = securityHeaders({ cspPolicy: "  default-src 'none'  " });
    expect(custom["content-security-policy"]).toBe("default-src 'none'");
  });

  it("treats the off-values the same way other feature flags do", () => {
    for (const off of ["0", "false", "off", "no", ""]) {
      expect(securityHeaders({ csp: off })["content-security-policy"]).toBeUndefined();
    }
    expect(securityHeaders({ csp: "1" })["content-security-policy"]).toBe(RECOMMENDED_CSP);
  });
});

describe("isSecureRequest", () => {
  it("honours the first x-forwarded-proto hop", () => {
    expect(isSecureRequest(httpsRequest())).toBe(true);
    expect(isSecureRequest(httpRequest())).toBe(false);
  });

  it("falls back to the URL scheme when no proxy header is present", () => {
    expect(isSecureRequest(new Request("https://hoffle.example/"))).toBe(true);
  });
});

describe("withSecurityHeaders", () => {
  it("adds the headers without disturbing the body or status", async () => {
    const response = Response.json({ ok: true }, { status: 201 });
    const wrapped = withSecurityHeaders(httpsRequest(), response);

    expect(wrapped.status).toBe(201);
    expect(wrapped.headers.get("x-content-type-options")).toBe("nosniff");
    expect(wrapped.headers.get("strict-transport-security")).toContain("max-age=");
    expect(await wrapped.json()).toEqual({ ok: true });
  });

  it("never overrides a header a route set itself", () => {
    // The untrusted-image proxy sandboxes itself; loosening that would be a
    // regression, not a hardening.
    const response = new Response("<svg/>", {
      headers: { "content-security-policy": "default-src 'none'; sandbox" },
    });
    const wrapped = withSecurityHeaders(httpsRequest(), response, { csp: "1" });
    expect(wrapped.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
  });

  it("passes a protocol upgrade through untouched", () => {
    // 101 headers are immutable per the Fetch spec, so rebuilding throws.
    const upgrade = { status: 101 } as unknown as Response;
    expect(withSecurityHeaders(httpsRequest(), upgrade)).toBe(upgrade);
  });

  it("returns the same object when nothing needed adding", () => {
    const response = new Response("hi", {
      headers: {
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "geolocation=()",
      },
    });
    expect(withSecurityHeaders(httpRequest(), response)).toBe(response);
  });

  it("keeps a bodyless 204 response bodyless", async () => {
    const wrapped = withSecurityHeaders(httpRequest(), new Response(null, { status: 204 }));
    expect(wrapped.status).toBe(204);
    expect(await wrapped.text()).toBe("");
  });
});
