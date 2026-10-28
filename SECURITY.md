# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in **Hoffle** (authentication, session handling, permissions, WebRTC signaling, file uploads, or self-hosting defaults), please report it privately rather than opening a public GitHub issue.

- **Email**: [coxaexs@gmail.com](mailto:coxaexs@gmail.com)
- **GitHub**: Use [GitHub Private Vulnerability Reporting](https://github.com/Coxaexs/huddle/security/advisories/new) if enabled on the repository.

Please include:
1. A clear description of the issue and its potential impact.
2. Step-by-step instructions or a minimal proof-of-concept to reproduce it.
3. Any suggested mitigation or fix, if you have one.

We aim to acknowledge reports within **48 hours** and ship a fix as quickly as possible.

---

## Security Architecture Highlights

- **Password Hashing**: Passwords are hashed using WebCrypto `PBKDF2-SHA256` (150,000 iterations) with per-user random salts (`lib/auth.ts`).
- **Session Tokens**: Session cookies (`hoffle_session`) are `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. Only the `SHA-256` hash of a session token is stored in the `sessions` database table (`lib/auth.ts`).
- **Passkeys / WebAuthn**: Hardware and platform passkeys are supported via `@simplewebauthn/server` (`lib/passkey-auth.ts`, `lib/account-security.ts`).
- **Upload Sniffing & Isolation**: User uploads are magic-byte sniffed (`lib/upload-sniff.ts`) and served with restrictive `Content-Security-Policy: sandbox` and `Content-Disposition` headers so uploaded files cannot execute scripts in the application origin.
- **Security Headers**: Every response passes through `withSecurityHeaders` in `worker/index.ts` (`lib/security-headers.ts`), enforcing `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `X-Frame-Options`.
