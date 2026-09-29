import { headers } from "next/headers";
import { ChatShell } from "./chat-shell";
import { LandingPage } from "./components/landing-page";
import { isLandingHost } from "./lib/landing-host";

export default async function Home() {
  const reqHeaders = await headers();
  if (isLandingHost(reqHeaders.get("host"))) {
    return <LandingPage />;
  }

  return <ChatShell />;
}
