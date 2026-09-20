import { headers } from "next/headers";
import { ChatShell } from "./chat-shell";
import { LandingPage } from "./components/landing-page";

export default async function Home() {
  const reqHeaders = await headers();
  const host = reqHeaders.get("host") || "";
  const isApexHoffle =
    host === "hoffle.online" ||
    host === "www.hoffle.online" ||
    host === "hoffle.com" ||
    host === "www.hoffle.com";

  if (isApexHoffle) {
    return <LandingPage />;
  }

  return <ChatShell />;
}
