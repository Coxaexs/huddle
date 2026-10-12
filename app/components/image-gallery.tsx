"use client";

import { useMemo, useState } from "react";
import { EyeOff } from "lucide-react";

interface ImageGalleryProps {
  images: string[];
  onOpenLightbox: (images: string[], startIndex: number) => void;
  altPrefix?: string;
}

export function isSpoilerUrl(src: string): boolean {
  return (
    /spoiler[_-]/i.test(src) ||
    /[?&]spoiler(=1|=true)?/i.test(src) ||
    /#spoiler/i.test(src)
  );
}

/**
 * Renders 1 to 4+ images in a responsive Discord/Twitter-style mosaic grid:
 * - 1 image: Standard hero attachment
 * - 2 images: 2-column equal split
 * - 3 images: 1 large on the left, 2 stacked on the right
 * - 4 images: 2x2 grid
 * - 5+ images: 2x2 grid with the 4th tile having a darkened +N overlay
 *
 * Includes built-in spoiler shielding: images containing `SPOILER_` or `?spoiler=1`
 * are blurred with a centered "SPOILER" badge until clicked to reveal.
 */
export function ImageGallery({
  images,
  onOpenLightbox,
  altPrefix = "Shared image",
}: ImageGalleryProps) {
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});

  const validImages = useMemo(
    () => images.filter((img) => typeof img === "string" && img.trim().length > 0),
    [images],
  );

  if (validImages.length === 0) return null;

  const renderTileContent = (src: string, index: number, isSingle = false) => {
    const isSpoiler = isSpoilerUrl(src);
    const isRevealed = Boolean(revealedSpoilers[src]);
    const isShielded = isSpoiler && !isRevealed;

    return (
      <div
        className={`relative w-full h-full group ${isSingle ? "single-image-wrap" : ""}`}
        onClick={() => {
          if (isShielded) {
            setRevealedSpoilers((prev) => ({ ...prev, [src]: true }));
          } else {
            onOpenLightbox(validImages, index);
          }
        }}
      >
        <img
          className={`message-image ${isSingle ? "single-attachment" : ""} transition-all duration-300 ${
            isShielded ? "filter blur-xl saturate-50 scale-105 pointer-events-none select-none" : ""
          }`}
          src={src}
          alt={`${altPrefix} ${index + 1}`}
          loading="lazy"
        />

        {isShielded && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/45 backdrop-blur-xs transition-colors hover:bg-black/55 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Click to reveal spoiler image"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setRevealedSpoilers((prev) => ({ ...prev, [src]: true }));
              }
            }}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 border border-white/25 text-white font-semibold text-xs tracking-wider shadow-xl transition-transform hover:scale-105 active:scale-95">
              <EyeOff size={13} className="text-white/80" />
              <span>SPOILER</span>
            </div>
          </div>
        )}

        {isSpoiler && isRevealed && (
          <button
            type="button"
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/70 hover:bg-black/90 text-white/80 hover:text-white transition-opacity opacity-0 group-hover:opacity-100 shadow-md cursor-pointer"
            title="Hide spoiler"
            aria-label="Hide spoiler"
            onClick={(e) => {
              e.stopPropagation();
              setRevealedSpoilers((prev) => ({ ...prev, [src]: false }));
            }}
          >
            <EyeOff size={13} />
          </button>
        )}
      </div>
    );
  };

  if (validImages.length === 1) {
    return renderTileContent(validImages[0], 0, true);
  }

  if (validImages.length === 2) {
    return (
      <div className="attachment-grid-mosaic count-2">
        {validImages.map((src, i) => (
          <div key={`${src}-${i}`} className="gallery-tile">
            {renderTileContent(src, i)}
          </div>
        ))}
      </div>
    );
  }

  if (validImages.length === 3) {
    return (
      <div className="attachment-grid-mosaic count-3">
        <div className="gallery-tile tile-large">
          {renderTileContent(validImages[0], 0)}
        </div>
        <div className="gallery-column-stacked">
          <div className="gallery-tile tile-half">
            {renderTileContent(validImages[1], 1)}
          </div>
          <div className="gallery-tile tile-half">
            {renderTileContent(validImages[2], 2)}
          </div>
        </div>
      </div>
    );
  }

  // 4 or more images
  const displayImages = validImages.slice(0, 4);
  const remainingCount = validImages.length - 4;

  return (
    <div className="attachment-grid-mosaic count-4">
      {displayImages.map((src, i) => {
        const isLastAndOverflow = i === 3 && remainingCount > 0;
        return (
          <div key={`${src}-${i}`} className="gallery-tile relative">
            {renderTileContent(src, i)}
            {isLastAndOverflow && (
              <div
                className="gallery-overflow-overlay cursor-pointer"
                onClick={() => onOpenLightbox(validImages, i)}
              >
                <span>+{remainingCount + 1}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
