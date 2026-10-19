"use client";



export interface Invite {
  code: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
  spent: boolean;
  note: string;
  defaultTheme?: string | null;
  defaultServerId?: string | null;
}
export type Tab =
  | "profile"
  | "activities"
  | "voice"
  | "tts"
  | "password"
  | "invites"
  | "appearance"
  | "notifications"
  | "dice"
  | "custom_ui_css"
  | "accessibility"
  | "roles"
  | "requests"
  | "tutorial"
  | "language"
  | "licenses";
export type PrideTheme = "off" | "trans" | "pride" | "nonbinary";
export type Density = "compact" | "cozy" | "roomy";
export type Backdrop = "plain" | "aurora" | "dots";
/** The Appearance page's sections. "installed" and "community" are both theme lists. */
export type AppearanceSubtab = "installed" | "community" | "look" | "extras";
