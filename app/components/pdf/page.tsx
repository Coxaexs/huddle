"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPdfJs } from "./runtime";
import type { PdfField, PdfValue, PdfWidget } from "./forms";
import { findMatches, type TextRun } from "./search";

/** Keeps a canvas under ~16M device pixels so iOS Safari doesn't refuse it. */
const MAX_CANVAS_PIXELS = 16_000_000;

export interface PdfLinkTarget {
  url?: string;
  dest?: unknown;
}

interface LinkAnnotation {
  id: string;
  subtype?: string;
  rect?: number[];
  url?: string;
  unsafeUrl?: string;
  dest?: unknown;
}

export interface PageHighlight {
  query: string;
  /** Which match on this page is the active one, if any. */
  current: number | null;
}

export interface PageFieldRef {
  field: PdfField;
  widget: PdfWidget;
}

const supportsHighlights =
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight !== "undefined";

const hitRanges = new Map<number, Range[]>();
const currentRanges = new Map<number, Range[]>();

function setPageRanges(page: number, ranges: Range[], current: Range[]) {
  if (!supportsHighlights) return;
  if (ranges.length) hitRanges.set(page, ranges);
  else hitRanges.delete(page);
  if (current.length) currentRanges.set(page, current);
  else currentRanges.delete(page);
  const registry = (CSS as unknown as { highlights: Map<string, Highlight> }).highlights;
  registry.set("pdfv-hit", new Highlight(...[...hitRanges.values()].flat()));
  registry.set("pdfv-hit-current", new Highlight(...[...currentRanges.values()].flat()));
}

function safeExternalUrl(raw?: string) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return /^(https?|mailto):$/.test(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function renderCanvas(
  page: PDFPageProxy,
  scale: number,
  annotationMode: number,
) {
  const viewport = page.getViewport({ scale });
  const wanted = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const ratio = Math.min(
    wanted,
    Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
  canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable");
  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    annotationMode,
    background: "#ffffff",
  } as Parameters<PDFPageProxy["render"]>[0]);
  return { canvas, task };
}

interface PdfPageViewProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
  fields: PageFieldRef[];
  values: Record<string, PdfValue>;
  onValue: (field: PdfField, value: PdfValue) => void;
  onLink: (target: PdfLinkTarget) => void;
  highlight: PageHighlight | null;
}

export const PdfPageView = memo(function PdfPageView({
  doc,
  pageNumber,
  scale,
  width,
  height,
  left,
  top,
  fields,
  values,
  onValue,
  onLink,
  highlight,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [links, setLinks] = useState<LinkAnnotation[]>([]);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [textVersion, setTextVersion] = useState(0);
  const textLayerRef = useRef<{ divs: HTMLElement[]; strings: string[] } | null>(
    null,
  );

  useEffect(() => {
    let disposed = false;
    void doc.getPage(pageNumber).then(async (loaded) => {
      if (disposed) return;
      setPage(loaded);
      try {
        const annotations = (await loaded.getAnnotations({
          intent: "display",
        })) as unknown as LinkAnnotation[];
        if (!disposed) {
          setLinks(
            annotations.filter(
              (annotation) =>
                annotation.subtype === "Link" &&
                annotation.rect &&
                (annotation.url || annotation.dest),
            ),
          );
        }
      } catch {
        /* links are optional */
      }
    });
    return () => {
      disposed = true;
    };
  }, [doc, pageNumber]);

  // Bitmap: rendered off-screen and blitted in one go so zooming never flashes
  // blank; until the new bitmap lands the old one is simply stretched.
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    let cancel: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const pdfjs = await loadPdfJs();
          if (cancelled) return;
          const { canvas, task } = renderCanvas(
            page,
            scale,
            // Everything but form widgets: those are our editable overlay.
            pdfjs.AnnotationMode.ENABLE_FORMS,
          );
          cancel = () => task.cancel();
          await task.promise;
          const visible = canvasRef.current;
          if (cancelled || !visible) return;
          visible.width = canvas.width;
          visible.height = canvas.height;
          visible.getContext("2d", { alpha: false })?.drawImage(canvas, 0, 0);
          canvas.width = canvas.height = 0;
          setPainted(true);
          setFailed(false);
        } catch (error) {
          if ((error as { name?: string })?.name === "RenderingCancelledException") {
            return;
          }
          console.error("PDF page render failed", error);
          if (!cancelled) setFailed(true);
        }
      })();
    }, 70);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancel?.();
    };
  }, [page, scale, attempt]);

  // Selectable, searchable text on top of the bitmap.
  useEffect(() => {
    const container = textRef.current;
    if (!page || !container) return;
    let cancelled = false;
    let layer: { cancel: () => void } | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const pdfjs = await loadPdfJs();
          if (cancelled) return;
          container.replaceChildren();
          const viewport = page.getViewport({ scale });
          const textLayer = new pdfjs.TextLayer({
            textContentSource: page.streamTextContent({
              includeMarkedContent: true,
            }),
            container,
            viewport,
          });
          layer = textLayer;
          await textLayer.render();
          if (cancelled) return;
          textLayerRef.current = {
            divs: textLayer.textDivs,
            strings: textLayer.textContentItemsStr,
          };
          setTextVersion((version) => version + 1);
        } catch (error) {
          if ((error as { name?: string })?.name !== "AbortException") {
            console.warn("PDF text layer failed", error);
          }
        }
      })();
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      layer?.cancel();
    };
  }, [page, scale]);

  // Free decoded images/fonts when the page scrolls far away.
  useEffect(() => {
    return () => {
      page?.cleanup();
    };
  }, [page]);

  // Search highlights: paint exactly the matched words using the CSS Custom
  // Highlight API, or fall back to tinting the whole text run.
  const needle = highlight?.query ?? "";
  const currentMatch = highlight?.current ?? null;
  useEffect(() => {
    const text = textLayerRef.current;
    if (!text) return;
    const runs: TextRun[] = text.strings.map((str, index) => ({
      str,
      eol: text.divs[index]?.nextElementSibling?.tagName === "BR",
    }));
    const found = findMatches(runs, needle);
    const ranges: Range[] = [];
    const current: Range[] = [];
    const tinted = new Set<HTMLElement>();
    let focus: HTMLElement | null = null;

    found.forEach((segments, ordinal) => {
      for (const { item, start, end } of segments) {
        const div = text.divs[item];
        if (!div) continue;
        const node = div.firstChild;
        if (supportsHighlights && node?.nodeType === Node.TEXT_NODE) {
          const length = (node.textContent || "").length;
          const range = document.createRange();
          range.setStart(node, Math.min(start, length));
          range.setEnd(node, Math.min(end, length));
          ranges.push(range);
          if (ordinal === currentMatch) current.push(range);
        } else if (!supportsHighlights) {
          div.classList.add("pdfv-hit");
          tinted.add(div);
          div.classList.toggle("pdfv-hit-current", ordinal === currentMatch);
        }
        if (ordinal === currentMatch && !focus) focus = div;
      }
    });

    if (supportsHighlights) setPageRanges(pageNumber, ranges, current);
    (focus as HTMLElement | null)?.scrollIntoView({
      block: "center",
      inline: "center",
    });
    return () => {
      tinted.forEach((div) =>
        div.classList.remove("pdfv-hit", "pdfv-hit-current"),
      );
    };
  }, [needle, currentMatch, textVersion, pageNumber]);

  useEffect(() => () => setPageRanges(pageNumber, [], []), [pageNumber]);

  const viewport = useMemo(
    () => (page ? page.getViewport({ scale }) : null),
    [page, scale],
  );

  function rectStyle(rect: number[]) {
    if (!viewport) return null;
    const converted = viewport.convertToViewportRectangle(rect);
    return {
      left: Math.min(converted[0], converted[2]),
      top: Math.min(converted[1], converted[3]),
      width: Math.abs(converted[2] - converted[0]),
      height: Math.abs(converted[3] - converted[1]),
    };
  }

  return (
    <section
      className="pdfv-page"
      data-page={pageNumber}
      style={
        {
          left,
          top,
          width,
          height,
          "--scale-factor": scale,
          "--total-scale-factor": scale,
        } as CSSProperties
      }
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className={painted ? "painted" : ""} />
      {!painted && !failed && <div className="pdfv-page-loading" aria-hidden="true" />}
      {failed && (
        <button
          type="button"
          className="pdfv-page-failed"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          This page could not be drawn · Retry
        </button>
      )}
      <div className="pdfv-text textLayer" ref={textRef} />
      <div className="pdfv-links">
        {links.map((link) => {
          const style = link.rect ? rectStyle(link.rect) : null;
          if (!style) return null;
          const external = safeExternalUrl(link.url || link.unsafeUrl);
          if (link.url && !external) return null;
          return external ? (
            <a
              key={link.id}
              style={style}
              href={external}
              target="_blank"
              rel="noopener noreferrer"
              title={external}
            />
          ) : (
            <a
              key={link.id}
              style={style}
              href="#"
              title="Go to destination"
              onClick={(event) => {
                event.preventDefault();
                onLink({ dest: link.dest });
              }}
            />
          );
        })}
      </div>
      {viewport && fields.length > 0 && (
        <div className="pdfv-form">
          {fields.map(({ field, widget }) => (
            <FieldWidget
              key={widget.id}
              field={field}
              widget={widget}
              value={values[field.name]}
              style={rectStyle(widget.rect)}
              scale={scale}
              onValue={onValue}
            />
          ))}
        </div>
      )}
    </section>
  );
});

function FieldWidget({
  field,
  widget,
  value,
  style,
  scale,
  onValue,
}: {
  field: PdfField;
  widget: PdfWidget;
  value: PdfValue | undefined;
  style: { left: number; top: number; width: number; height: number } | null;
  scale: number;
  onValue: (field: PdfField, value: PdfValue) => void;
}) {
  if (!style || style.width < 3 || style.height < 3) return null;
  const readOnly = Boolean(field.readOnly);
  const fontPx = Math.max(
    8,
    Math.min(
      26,
      widget.fontSize
        ? widget.fontSize * scale
        : field.multiline
          ? 12 * scale
          : style.height * 0.62,
    ),
  );
  const box = {
    ...style,
    "--pdfv-font": `${fontPx}px`,
    textAlign: widget.align === 1 ? "center" : widget.align === 2 ? "right" : "left",
  } as CSSProperties;
  const common = { "data-pdf-field": field.name, "aria-label": field.label };

  if (field.kind === "radio") {
    return (
      <label className="pdfv-check" style={box} title={field.label}>
        <input
          {...common}
          type="radio"
          name={`pdfv-${field.name}`}
          checked={String(value || "") === (widget.buttonValue || "")}
          disabled={readOnly}
          onChange={() => onValue(field, widget.buttonValue || "")}
        />
      </label>
    );
  }
  if (field.kind === "checkbox") {
    return (
      <label className="pdfv-check" style={box} title={field.label}>
        <input
          {...common}
          type="checkbox"
          checked={Boolean(value)}
          disabled={readOnly}
          onChange={(event) => onValue(field, event.target.checked)}
        />
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <select
        {...common}
        className="pdfv-input"
        style={box}
        value={String(value || "")}
        disabled={readOnly}
        onChange={(event) => onValue(field, event.target.value)}
      >
        <option value="" />
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.multiline) {
    return (
      <textarea
        {...common}
        className="pdfv-input multiline"
        style={box}
        value={String(value || "")}
        readOnly={readOnly}
        maxLength={widget.maxLength}
        onChange={(event) => onValue(field, event.target.value)}
      />
    );
  }
  return (
    <input
      {...common}
      className={`pdfv-input${readOnly ? " readonly" : ""}`}
      style={box}
      type="text"
      value={String(value || "")}
      readOnly={readOnly}
      maxLength={widget.maxLength}
      onChange={(event) => onValue(field, event.target.value)}
    />
  );
}

/** Small lazily-rendered page preview for the sidebar. */
export const PdfThumb = memo(function PdfThumb({
  doc,
  pageNumber,
  width,
  height,
  active,
  root,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  active: boolean;
  root: HTMLElement | null;
  onSelect: (pageNumber: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element || done) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root, rootMargin: "300px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, done]);

  useEffect(() => {
    if (!near || done) return;
    let cancelled = false;
    let cancel: (() => void) | undefined;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const natural = page.getViewport({ scale: 1 }).width;
        const { canvas, task } = renderCanvas(
          page,
          width / natural,
          pdfjs.AnnotationMode.ENABLE_FORMS,
        );
        cancel = () => task.cancel();
        await task.promise;
        const visible = canvasRef.current;
        if (cancelled || !visible) return;
        visible.width = canvas.width;
        visible.height = canvas.height;
        visible.getContext("2d")?.drawImage(canvas, 0, 0);
        setDone(true);
      } catch {
        /* cancelled or unreadable: leave the placeholder */
      }
    })();
    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [near, done, doc, pageNumber, width]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`pdfv-thumb${active ? " active" : ""}`}
      data-thumb={pageNumber}
      onClick={() => onSelect(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="pdfv-thumb-sheet" style={{ width, height }}>
        <canvas ref={canvasRef} />
      </span>
      <small>{pageNumber}</small>
    </button>
  );
});
