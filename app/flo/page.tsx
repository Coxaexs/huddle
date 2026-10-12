import type { Metadata } from "next";
import { MediaAdmin } from "../admin/media/media-admin";

export const metadata: Metadata = {
  title: "Media admin",
  description: "Browse, search and delete uploaded files.",
  robots: { index: false, follow: false },
};

export default function FloPage() {
  return <MediaAdmin />;
}
