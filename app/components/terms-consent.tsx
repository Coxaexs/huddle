"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "../lib/native-app";
import { SITE } from "./site-chrome";

/** Bump when the terms change in a way people should agree to again. */
export const TERMS_VERSION = "2026-10-18";
export const TERMS_ACCEPTED_KEY = "hoffle-terms-accepted";

export function rememberTermsAccepted() {
  try {
    window.localStorage.setItem(TERMS_ACCEPTED_KEY, TERMS_VERSION);
  } catch {
    // Storage blocked: they are asked again next time.
  }
}

/**
 * The app stores want everyone in the iOS/Android app to have agreed to the
 * terms. New accounts tick the box on sign-up; accounts made before that
 * agree here once.
 */
export function TermsConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      setShow(window.localStorage.getItem(TERMS_ACCEPTED_KEY) !== TERMS_VERSION);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  return (
    <div className="username-gate" role="dialog" aria-modal="true" aria-labelledby="terms-consent-title">
      <div className="username-card">
        <span className="username-mark">h</span>
        <p className="eyebrow">BEFORE YOU CONTINUE</p>
        <h2 id="terms-consent-title">Our community rules</h2>
        <p>
          Hoffle has zero tolerance for harassment, hate, sexual content involving minors, threats, spam and other
          objectionable content. Long-press any message to report it, and block people from their profile. We review
          reports within 24 hours.
        </p>
        <p className="auth-legal" style={{ textAlign: "left", marginBottom: 18 }}>
          <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">Terms of Use</a>
          <span aria-hidden> · </span>
          <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </p>
        <button
          type="button"
          onClick={() => {
            rememberTermsAccepted();
            setShow(false);
          }}
        >
          I agree
        </button>
      </div>
    </div>
  );
}
