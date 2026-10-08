import type { Metadata } from "next";
import { SayHiEmbed } from "./say-hi-embed";

/** The live #say-hi channel, framed into hoffle.online's landing page. */
export const metadata: Metadata = {
  title: "#say-hi",
  robots: { index: false, follow: false },
};

export default async function SayHiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const theme = typeof params.theme === "string" ? params.theme.slice(0, 40) : "cozy";
  return <SayHiEmbed initialTheme={theme} />;
}
