import type { Metadata } from "next";
import { RecordingsPortal } from "./recordings-portal";

export const metadata: Metadata = {
  title: "Recordings",
  description: "Start, preview and manage Huddle session recordings.",
};

export default function RecordingsPage() {
  return <RecordingsPortal />;
}