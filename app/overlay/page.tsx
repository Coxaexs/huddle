import type { Metadata } from "next";
import { OverlayApp } from "../components/overlay/overlay-app";

export const metadata: Metadata = {
  title: "Overlay",
  description: "Hoffle over your game: who is talking, new messages and a small Hoffle on a shortcut.",
  robots: { index: false, follow: false },
};

export default function OverlayPage() {
  return <OverlayApp />;
}
