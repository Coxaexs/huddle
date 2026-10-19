import type { Metadata } from "next";
import { PasskeyHandoffPage } from "./passkey-handoff";

/** Opened by a desktop app in the system browser, to sign the app in with a passkey (?h=) or add one (?setup=). */
export const metadata: Metadata = {
  title: "Sign in to the app",
  robots: { index: false, follow: false },
};

export default async function PasskeySignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const setup = typeof params.setup === "string" ? params.setup.slice(0, 64) : "";
  const signIn = typeof params.h === "string" ? params.h.slice(0, 64) : "";
  return <PasskeyHandoffPage handoffId={setup || signIn} setup={Boolean(setup)} />;
}
