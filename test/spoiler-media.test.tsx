// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ImageGallery, isSpoilerUrl } from "@/app/components/image-gallery";
import { MessageAttachmentFiles } from "@/app/components/message-file-card";

afterEach(() => {
  cleanup();
});

describe("Spoiler & Media Enhancements", () => {
  describe("isSpoilerUrl helper", () => {
    it("detects spoiler filenames and query params", () => {
      expect(isSpoilerUrl("/uploads/SPOILER_cat.png")).toBe(true);
      expect(isSpoilerUrl("/uploads/spoiler-dragon.jpg")).toBe(true);
      expect(isSpoilerUrl("https://example.com/art.png?spoiler=1")).toBe(true);
      expect(isSpoilerUrl("https://example.com/art.png#spoiler")).toBe(true);
      expect(isSpoilerUrl("/uploads/regular_image.png")).toBe(false);
    });
  });

  describe("ImageGallery Spoiler Shielding", () => {
    it("renders regular images unblurred and opens lightbox", () => {
      const onOpenLightbox = vi.fn();
      render(
        <ImageGallery
          images={["https://example.com/normal.png"]}
          onOpenLightbox={onOpenLightbox}
        />,
      );

      expect(screen.queryByText("SPOILER")).toBeNull();
      const img = screen.getByAltText("Shared image 1");
      expect(img.className).not.toContain("blur");

      fireEvent.click(img);
      expect(onOpenLightbox).toHaveBeenCalledWith(["https://example.com/normal.png"], 0);
    });

    it("renders spoiler images with badge and blur, revealing on click", () => {
      const onOpenLightbox = vi.fn();
      render(
        <ImageGallery
          images={["/uploads/SPOILER_ending.png"]}
          onOpenLightbox={onOpenLightbox}
        />,
      );

      // Initially shielded
      const badge = screen.getByText("SPOILER");
      expect(badge).toBeTruthy();

      const img = screen.getByAltText("Shared image 1");
      expect(img.className).toContain("blur");

      // First click: reveals the spoiler, does NOT open lightbox yet
      fireEvent.click(badge);
      expect(screen.queryByText("SPOILER")).toBeNull();
      expect(img.className).not.toContain("blur");
      expect(onOpenLightbox).not.toHaveBeenCalled();

      // Second click on revealed image: opens lightbox
      fireEvent.click(img);
      expect(onOpenLightbox).toHaveBeenCalledWith(["/uploads/SPOILER_ending.png"], 0);
    });
  });

  describe("MessageAttachmentFiles Audio & Spoilers", () => {
    it("renders inline audio player for audio attachments", () => {
      render(
        <MessageAttachmentFiles
          files={[{ url: "/uploads/song.mp3", name: "theme_song.mp3", type: "audio/mpeg" }]}
        />,
      );

      // Inline audio card renders audio element, track name, and play button
      expect(screen.getByText("theme_song.mp3")).toBeTruthy();
      expect(screen.getByLabelText("Play")).toBeTruthy();
      expect(screen.getByLabelText("Download theme_song.mp3")).toBeTruthy();
    });

    it("renders spoiler shroud for spoiler files until clicked", () => {
      render(
        <MessageAttachmentFiles
          files={[{ url: "/uploads/SPOILER_notes.pdf", name: "SPOILER_notes.pdf", type: "pdf" }]}
        />,
      );

      // Initially hidden with spoiler banner
      expect(screen.getByText("Spoiler Attachment")).toBeTruthy();
      expect(screen.queryByText("PDF document · view and fill in Huddle")).toBeNull();

      // Click to reveal
      fireEvent.click(screen.getByText("Reveal"));
      expect(screen.getByText("PDF document · view and fill in Huddle")).toBeTruthy();
    });

    it("renders inline video player for video attachments like mp4 or webm", () => {
      render(
        <MessageAttachmentFiles
          files={[{ url: "/uploads/ekran.mp4", name: "ekran.mp4", type: "video/mp4" }]}
        />,
      );

      // Renders video element, title, and download link
      expect(screen.getByText("ekran.mp4")).toBeTruthy();
      const video = screen.getByLabelText("Video player: ekran.mp4");
      expect(video).toBeTruthy();
      expect(video.getAttribute("src")).toBe("/uploads/ekran.mp4");
      expect(screen.getByLabelText("Download ekran.mp4")).toBeTruthy();
    });

    it("renders spoiler shroud for video files until revealed and allows re-hiding", () => {
      render(
        <MessageAttachmentFiles
          files={[{ url: "/uploads/SPOILER_highlight.mp4", name: "SPOILER_highlight.mp4", type: "mp4" }]}
        />,
      );

      // Initially hidden with Spoiler Video shroud
      expect(screen.getByText("Spoiler Video")).toBeTruthy();
      expect(screen.queryByLabelText("Video player: highlight.mp4")).toBeNull();

      // Click Reveal
      fireEvent.click(screen.getByText("Reveal"));
      expect(screen.getByLabelText("Video player: highlight.mp4")).toBeTruthy();

      // Click Hide spoiler to re-shroud
      fireEvent.click(screen.getByLabelText("Hide spoiler"));
      expect(screen.getByText("Spoiler Video")).toBeTruthy();
      expect(screen.queryByLabelText("Video player: highlight.mp4")).toBeNull();
    });
  });
});
