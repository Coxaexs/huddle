import type { Metadata } from "next";
import { SecondScreenApp } from "../components/second-screen/second-screen-app";

export const metadata: Metadata = {
  title: "2nd Screen — Hoffle",
  description:
    "Synchronized second screen for Hoffle screenshares, live chat, battlemaps, and D&D Companion.",
  robots: { index: false, follow: false },
};

export default function SecondScreenPage() {
  return <SecondScreenApp />;
}
