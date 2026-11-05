import type { Metadata } from "next";
import { DeveloperPortal } from "../components/developer-portal";

export const metadata: Metadata = {
  title: "Developer Portal",
  description: "Make bots for Hoffle and get their invite links.",
  robots: { index: false, follow: false },
};

export default function DevelopersPage() {
  return <DeveloperPortal />;
}
