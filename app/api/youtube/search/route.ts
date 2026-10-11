import { currentUser, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
}

interface InvidiousVideo {
  videoId: string;
  title: string;
  videoThumbnails: Array<{ quality: string; url: string; width: number; height: number }>;
  author: string;
  authorId: string;
  lengthSeconds: number;
  viewCount: number;
}

function parseDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// Invidious instances (public, no API key needed)
const INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://invidious.snopyta.org",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
];

async function fetchFromInvidious(query: string): Promise<YouTubeVideo[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data: InvidiousVideo[] = await res.json();
      const videos: YouTubeVideo[] = (data || []).slice(0, 15).map((item: InvidiousVideo) => {
        const thumb = item.videoThumbnails?.find(t => t.quality === "high")?.url
          || item.videoThumbnails?.[0]?.url
          || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;
        return {
          id: item.videoId,
          title: item.title,
          thumbnail: thumb,
          channelTitle: item.author,
          duration: parseDuration(item.lengthSeconds),
        };
      });
      return videos;
    } catch (e) {
      console.warn(`Invidious instance ${instance} failed:`, e);
      continue;
    }
  }
  return [];
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) return Response.json({ videos: [] });

  try {
    const videos = await fetchFromInvidious(query);
    return Response.json({ videos });
  } catch (error) {
    console.error("YouTube search error:", error);
    return Response.json({ videos: [], error: "Search failed" }, { status: 500 });
  }
}