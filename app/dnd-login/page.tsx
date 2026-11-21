import type { Metadata } from "next";
import { SignedIn } from "../components/signed-in";
import { DndSsoHandoff } from "../components/dnd-sso-handoff";

export const metadata: Metadata = {
  title: "Sign in to D&D Companion",
  description: "Single sign-on from Hoffle to the D&D Companion.",
  robots: { index: false, follow: false },
};

export default function DndLoginPage() {
  return (
    <SignedIn>
      <DndSsoHandoff />
    </SignedIn>
  );
}
