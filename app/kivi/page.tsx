import type { Metadata } from "next";
import { AdminPanel } from "../admin/admin-panel";

export const metadata: Metadata = {
  title: "Admin",
  description: "Oversee the whole Hoffle instance.",
  robots: { index: false, follow: false },
};

export default function KiviPage() {
  return <AdminPanel />;
}
