import type { Metadata } from "next";
import { BotAuthorize } from "../../components/bot-authorize";

export const metadata: Metadata = {
  title: "Add a bot",
  description: "Add a bot to your Hoffle server.",
  robots: { index: false, follow: false },
};

export default function AuthorizePage() {
  return <BotAuthorize />;
}
