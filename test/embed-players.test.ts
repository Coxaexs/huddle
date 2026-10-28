import { describe, expect, it } from "vitest";
import { playerFor } from "@/app/lib/embed-players";

describe("playerFor", () => {
  it("embeds Spotify tracks compact and playlists tall", () => {
    expect(playerFor("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x", "hoffle.online")).toMatchObject({
      site: "Spotify",
      src: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=hoffle&autoplay=1",
      shape: "audio",
      height: 152,
    });
    expect(playerFor("https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M", "hoffle.online")?.height).toBe(352);
  });

  it("embeds SoundCloud, Apple Music, Deezer, Vimeo, Streamable and TikTok", () => {
    expect(playerFor("https://soundcloud.com/artist/a-track", "x.com")?.src).toContain(encodeURIComponent("https://soundcloud.com/artist/a-track"));
    expect(playerFor("https://soundcloud.com/discover/sets", "x.com")).toBeNull();
    expect(playerFor("https://music.apple.com/us/album/blue/1440829211?i=1440829466", "x.com")).toMatchObject({ height: 175 });
    expect(playerFor("https://www.deezer.com/en/track/3135556", "x.com")?.src).toBe("https://widget.deezer.com/widget/auto/track/3135556?autoplay=true");
    expect(playerFor("https://vimeo.com/76979871", "x.com")?.src).toBe("https://player.vimeo.com/video/76979871?autoplay=1");
    expect(playerFor("https://streamable.com/abc12", "x.com")?.shape).toBe("video");
    expect(playerFor("https://www.tiktok.com/@someone/video/7300000000000000000", "x.com")?.shape).toBe("portrait");
  });

  it("embeds Twitch channels, videos and clips for this page's host", () => {
    expect(playerFor("https://www.twitch.tv/someone", "hoffle.online")?.src).toBe(
      "https://player.twitch.tv/?channel=someone&parent=hoffle.online&autoplay=true",
    );
    expect(playerFor("https://www.twitch.tv/videos/123456789", "hoffle.online")?.src).toContain("video=v123456789");
    expect(playerFor("https://www.twitch.tv/someone/clip/FunnyClipSlug-abc", "hoffle.online")?.src).toContain("clip=FunnyClipSlug-abc");
    expect(playerFor("https://www.twitch.tv/directory", "hoffle.online")).toBeNull();
    expect(playerFor("https://www.twitch.tv/someone", "")).toBeNull();
  });

  it("ignores everything else", () => {
    expect(playerFor("https://example.com/track/1", "x.com")).toBeNull();
    expect(playerFor("javascript:alert(1)", "x.com")).toBeNull();
  });
});
