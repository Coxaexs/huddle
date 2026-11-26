import type { Metadata } from "next";
import { CommunityBotDashboard } from "../../components/community-bot/dashboard";

export const metadata: Metadata = {
  title: "Community Bot Dashboard",
  description: "MEE6-style community bot controls for your Hoffle server.",
  robots: { index: false, follow: false },
};

export default async function ServerDashboardPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <CommunityBotDashboard serverId={serverId} />;
}
