/**
 * vinext implements the Next.js module surface at build time, but ships no
 * ambient types for it. These are the pieces Huddle actually imports.
 */

declare module "next" {
  export interface Metadata {
    metadataBase?: URL;
    title?: string | { default: string; template?: string };
    description?: string;
    keywords?: string[];
    authors?: Array<{ name: string; url?: string }>;
    creator?: string;
    publisher?: string;
    alternates?: Record<string, unknown>;
    icons?: { icon?: string; shortcut?: string; apple?: string };
    openGraph?: Record<string, unknown>;
    twitter?: Record<string, unknown>;
    robots?: Record<string, unknown>;
    verification?: Record<string, unknown>;
  }
}

declare module "next/headers" {
  export function headers(): Promise<Headers>;
  export function cookies(): Promise<{
    get(name: string): { name: string; value: string } | undefined;
  }>;
}
