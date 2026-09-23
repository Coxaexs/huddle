"use client";

import { useMemo } from "react";

interface ImageGalleryProps {
  images: string[];
  onOpenLightbox: (images: string[], startIndex: number) => void;
  altPrefix?: string;
}

/**
 * Renders 1 to 4+ images in a responsive Discord/Twitter-style mosaic grid:
 * - 1 image: Standard hero attachment
 * - 2 images: 2-column equal split
 * - 3 images: 1 large on the left, 2 stacked on the right
 * - 4 images: 2x2 grid
 * - 5+ images: 2x2 grid with the 4th tile having a darkened +N overlay
 */
export function ImageGallery({
  images,
  onOpenLightbox,
  altPrefix = "Shared image",
}: ImageGalleryProps) {
  const validImages = useMemo(
    () => images.filter((img) => typeof img === "string" && img.trim().length > 0),
    [images],
  );

  if (validImages.length === 0) return null;

  if (validImages.length === 1) {
    return (
      <div className="single-image-wrap">
        <img
          className="message-image single-attachment"
          src={validImages[0]}
          alt={`${altPrefix} 1`}
          loading="lazy"
          onClick={() => onOpenLightbox(validImages, 0)}
        />
      </div>
    );
  }

  if (validImages.length === 2) {
    return (
      <div className="attachment-grid-mosaic count-2">
        {validImages.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="gallery-tile"
            onClick={() => onOpenLightbox(validImages, i)}
          >
            <img
              className="message-image"
              src={src}
              alt={`${altPrefix} ${i + 1}`}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    );
  }

  if (validImages.length === 3) {
    return (
      <div className="attachment-grid-mosaic count-3">
        <div
          className="gallery-tile tile-large"
          onClick={() => onOpenLightbox(validImages, 0)}
        >
          <img
            className="message-image"
            src={validImages[0]}
            alt={`${altPrefix} 1`}
            loading="lazy"
          />
        </div>
        <div className="gallery-column-stacked">
          <div
            className="gallery-tile tile-half"
            onClick={() => onOpenLightbox(validImages, 1)}
          >
            <img
              className="message-image"
              src={validImages[1]}
              alt={`${altPrefix} 2`}
              loading="lazy"
            />
          </div>
          <div
            className="gallery-tile tile-half"
            onClick={() => onOpenLightbox(validImages, 2)}
          >
            <img
              className="message-image"
              src={validImages[2]}
              alt={`${altPrefix} 3`}
              loading="lazy"
            />
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
          <div
            key={`${src}-${i}`}
            className="gallery-tile"
            onClick={() => onOpenLightbox(validImages, i)}
          >
            <img
              className="message-image"
              src={src}
              alt={`${altPrefix} ${i + 1}`}
              loading="lazy"
            />
            {isLastAndOverflow && (
              <div className="gallery-overflow-overlay">
                <span>+{remainingCount + 1}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
