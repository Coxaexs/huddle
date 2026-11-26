import type { Metadata } from "next";
import { ServerLeaderboardPage } from "../../components/community-bot/leaderboard";

export const metadata: Metadata = {
  title: "Server Leaderboard",
  description: "XP & Level leaderboard for this Hoffle server.",
};

export default async function LeaderboardRoute({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <ServerLeaderboardPage serverId={serverId} />;
}
