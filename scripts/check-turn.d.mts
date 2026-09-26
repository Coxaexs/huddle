/**
 * Types for scripts/check-turn.mjs, so the test beside it (and anything else)
 * can import the pure helpers with real signatures.
 */

export type IceTransport = "udp" | "tcp" | "tls";

export interface IceTarget {
  scheme: string;
  host: string;
  port: number;
  kind: IceTransport;
  url: string;
  /** Set once checkOne has resolved `host`. */
  address?: string;
  username?: string;
  credential?: string;
}

export interface ProbeOptions {
  timeout?: number;
  insecure?: boolean;
  username?: string;
  credential?: string;
}

export interface ProbeResult {
  url: string;
  host: string;
  port: number;
  transport: IceTransport;
  /** The address the server saw us from, when it answered. */
  bind?: string | null;
  /** The relay address it handed out, `ip:port`. */
  relay?: string | null;
  lifetime?: number | null;
  software?: string | null;
  realm?: string;
  error?: string;
}

/** Why the address could never carry media, or null when it is fine. */
export function addressVerdict(address: string): string | null;

export function splitHostPort(value: string, fallbackPort: number): [string, number];

/** Whole STUN (and ChannelData) messages out of a TCP/TLS byte stream. */
export function splitFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer };

export function parseIceUrl(raw: string): IceTarget | null;

export function targetsFromIceServers(raw: string): IceTarget[];

export function probeRelay(target: IceTarget, options: ProbeOptions): Promise<ProbeResult>;
