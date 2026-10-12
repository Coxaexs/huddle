"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "./pdf-viewer.css";
import {
  CSS_UNITS,
  PDF_ASSET_URLS,
  loadPdfJs,
} from "./runtime";
import {
  collectFields,
  filledName,
  isFilled,
  makeFilledPdf,
  type PdfField,
  type PdfValue,
} from "./forms";
import {
  PdfPageView,
  PdfThumb,
  type PageFieldRef,
  type PageHighlight,
  type PdfLinkTarget,
} from "./page";
import { findMatches, normalizeNeedle, type TextRun } from "./search";

interface PdfViewerProps {
  url: string;
  name: string;
  onClose: () => void;
  /** Posts the filled-in PDF to the current chat. Without it, Save downloads. */
  onSendCopy?: (file: File) => Promise<void>;
}

type ZoomMode = "width" | "page" | number;
type Sidebar = "pages" | "form" | null;

interface Size {
  w: number;
  h: number;
}

interface SearchMatch {
  page: number;
  ordinal: number;
}

const GAP = 12;
const MIN_SCALE = 0.25 * CSS_UNITS;
const MAX_SCALE = 5 * CSS_UNITS;
const MAX_FIT_WIDTH_SCALE = 1.9;
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300];
const THUMB_WIDTH = 104;
const MAX_MATCHES = 3000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Last index whose offset is <= position (0 when before the first). */
function findIndex(tops: number[], position: number) {
  let low = 0;
  let high = tops.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (tops[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low;
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  pages: "M5 4h14v16H5zM9 4v16",
  form: "M5 5h14M5 12h14M5 19h9",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  close: "M6 6l12 12M18 6L6 18",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
};

export function PdfViewer({ url, name, onClose, onSendCopy }: PdfViewerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [password, setPassword] = useState<{
    submit: (value: string) => void;
    wrong: boolean;
  } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");

  const [fields, setFields] = useState<PdfField[]>([]);
  const [values, setValues] = useState<Record<string, PdfValue>>({});
  const [savedValues, setSavedValues] = useState<Record<string, PdfValue>>({});
  const initialRef = useRef<Record<string, PdfValue>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [formQuery, setFormQuery] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const cursorRef = useRef(-1);

  const [zoomMode, setZoomMode] = useState<ZoomMode>("width");
  const [box, setBox] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState({ first: 0, last: -1, current: 1 });
  const [sidebar, setSidebar] = useState<Sidebar>(null);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const [pageDraft, setPageDraft] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const textCache = useRef(new Map<number, TextRun[]>());

  // ---------- loading ----------
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    let task: { destroy: () => Promise<void> } | null = null;
    let usedPassword = false;

    setError("");
    setProgress(0);
    setDoc(null);
    setSizes([]);
    setFields([]);
    textCache.current.clear();

    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const loading = pdfjs.getDocument({
          url,
          withCredentials: true,
          isEvalSupported: false,
          cMapPacked: true,
          ...PDF_ASSET_URLS,
        });
        task = loading;
        loading.onProgress = ({ loaded: bytes, total }: { loaded: number; total: number }) => {
          if (total && !cancelled) setProgress(Math.min(1, bytes / total));
        };
        loading.onPassword = (
          submit: (value: string) => void,
          reason: number,
        ) => {
          usedPassword = true;
          if (cancelled) return;
          setPassword({
            submit,
            wrong: reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD,
          });
        };
        loaded = await loading.promise;
        if (cancelled) return;
        setPassword(null);

        const measured: Size[] = await Promise.all(
          Array.from({ length: loaded.numPages }, async (_, index) => {
            const page = await loaded!.getPage(index + 1);
            const viewport = page.getViewport({ scale: 1 });
            return { w: viewport.width, h: viewport.height };
          }),
        );
        if (cancelled) return;
        setDoc(loaded);
        setSizes(measured);
        const wide = window.innerWidth > 900;

        // Form detection runs after the first pages are already on screen.
        // Editing an encrypted file would need decrypting it first, so skip it.
        if (!usedPassword) {
          const detected = await collectFields(loaded);
          if (cancelled) return;
          const initial = Object.fromEntries(
            detected.map((field) => [field.name, field.value]),
          );
          initialRef.current = initial;
          setFields(detected);
          setValues(initial);
          setSavedValues(initial);
          if (detected.some((field) => !field.readOnly) && wide) {
            setSidebar((current) => current ?? "form");
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        const kind = (loadError as { name?: string })?.name;
        setError(
          kind === "InvalidPDFException"
            ? "This file doesn't look like a valid PDF."
            : kind === "MissingPDFException"
              ? "This PDF is no longer available."
              : "The PDF could not be loaded.",
        );
      }
    })();

    return () => {
      cancelled = true;
      void (loaded ? loaded.destroy() : task?.destroy());
    };
  }, [url]);

  // ---------- layout ----------
  const pad = box.w < 640 ? 8 : 18;
  const layout = useMemo(() => {
    if (!sizes.length || !box.w) {
      return { scale: 1, tops: [] as number[], lefts: [] as number[], total: 0, width: box.w, pad };
    }
    const maxW = Math.max(...sizes.map((size) => size.w));
    const maxH = Math.max(...sizes.map((size) => size.h));
    const fitWidth = (box.w - pad * 2) / maxW;
    let scale: number;
    if (zoomMode === "width") scale = Math.min(fitWidth, MAX_FIT_WIDTH_SCALE);
    else if (zoomMode === "page") {
      scale = Math.min(fitWidth, (box.h - pad * 2) / maxH);
    } else scale = zoomMode;
    scale = clamp(scale, MIN_SCALE, MAX_SCALE);

    const width = Math.max(box.w, maxW * scale + pad * 2);
    const tops: number[] = [];
    const lefts: number[] = [];
    let y = pad;
    for (const size of sizes) {
      tops.push(y);
      lefts.push((width - size.w * scale) / 2);
      y += size.h * scale + GAP;
    }
    return { scale, tops, lefts, total: y - GAP + pad, width, pad };
  }, [sizes, box, zoomMode, pad]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const anchorRef = useRef<{ page: number; frac: number } | null>(null);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const pendingScaleRef = useRef<number | null>(null);

  const updateView = useCallback(() => {
    const scroller = scrollerRef.current;
    const { tops, scale } = layoutRef.current;
    const heights = sizesRef.current;
    if (!scroller || !tops.length) return;
    const buffer = scroller.clientHeight * 0.8;
    const top = scroller.scrollTop;
    const first = findIndex(tops, top - buffer);
    const last = findIndex(tops, top + scroller.clientHeight + buffer);
    const current = findIndex(tops, top + scroller.clientHeight * 0.35);
    const span = heights[current].h * scale || 1;
    anchorRef.current = {
      page: current,
      frac: clamp((top - tops[current]) / span, -1, 1.2),
    };
    setView((previous) =>
      previous.first === first &&
      previous.last === last &&
      previous.current === current + 1
        ? previous
        : { first, last, current: current + 1 },
    );
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () =>
      setBox((previous) =>
        previous.w === scroller.clientWidth && previous.h === scroller.clientHeight
          ? previous
          : { w: scroller.clientWidth, h: scroller.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateView();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [updateView, doc]);

  // Keep the reader's place when the scale or container changes.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !layout.tops.length) return;
    const pending = pendingScrollRef.current;
    pendingScrollRef.current = null;
    pendingScaleRef.current = null;
    if (pending) {
      scroller.scrollLeft = pending.left;
      scroller.scrollTop = pending.top;
    } else if (anchorRef.current) {
      const { page, frac } = anchorRef.current;
      const index = Math.min(page, layout.tops.length - 1);
      scroller.scrollTop =
        layout.tops[index] + frac * sizes[index].h * layout.scale;
    }
    updateView();
  }, [layout.scale, layout.total, layout.tops, sizes, updateView]);

  const goToPage = useCallback((pageNumber: number, offset = 0) => {
    const scroller = scrollerRef.current;
    const { tops } = layoutRef.current;
    if (!scroller || !tops.length) return;
    const index = clamp(Math.round(pageNumber) - 1, 0, tops.length - 1);
    scroller.scrollTo({ top: Math.max(0, tops[index] - 8 + offset) });
  }, []);

  const goToDest = useCallback(
    async (target: PdfLinkTarget) => {
      if (!doc) return;
      try {
        let explicit: unknown = target.dest;
        if (typeof explicit === "string") explicit = await doc.getDestination(explicit);
        if (!Array.isArray(explicit)) return;
        const ref = explicit[0];
        const index =
          typeof ref === "number" ? ref : await doc.getPageIndex(ref as never);
        let offset = 0;
        const mode = explicit[1] as { name?: string } | undefined;
        if (mode?.name === "XYZ" && typeof explicit[3] === "number") {
          const size = sizesRef.current[index];
          if (size) offset = (size.h - explicit[3]) * layoutRef.current.scale;
        }
        goToPage(index + 1, offset);
      } catch {
        /* dangling destination */
      }
    },
    [doc, goToPage],
  );

  // ---------- zoom ----------
  const setScaleAt = useCallback(
    (nextScale: number, focal?: { x: number; y: number }) => {
      const scroller = scrollerRef.current;
      const baseScale = pendingScaleRef.current ?? layoutRef.current.scale;
      const target = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (!scroller || Math.abs(target - baseScale) < 0.0005) return;
      const ratio = target / baseScale;
      const point = focal ?? { x: scroller.clientWidth / 2, y: scroller.clientHeight / 2 };
      const base = pendingScrollRef.current ?? {
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
      };
      pendingScrollRef.current = {
        left: Math.max(0, (base.left + point.x) * ratio - point.x),
        top: Math.max(0, (base.top + point.y) * ratio - point.y),
      };
      pendingScaleRef.current = target;
      setZoomMode(target);
    },
    [],
  );

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const percent = (pendingScaleRef.current ?? layoutRef.current.scale) / CSS_UNITS * 100;
      const steps = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
      const next =
        direction > 0
          ? steps.find((step) => step > percent + 1) ?? 500
          : [...steps].reverse().find((step) => step < percent - 1) ?? 25;
      setScaleAt((next / 100) * CSS_UNITS);
    },
    [setScaleAt],
  );

  // Trackpad / ctrl+wheel and two-finger pinch zoom.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !doc) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = scroller.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.01));
      const base = pendingScaleRef.current ?? layoutRef.current.scale;
      setScaleAt(base * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    let pinch: {
      distance: number;
      scale: number;
      ratio: number;
      cx: number;
      cy: number;
      left: number;
      top: number;
    } | null = null;
    const touchGeometry = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      const rect = scroller.getBoundingClientRect();
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        cx: (a.clientX + b.clientX) / 2 - rect.left,
        cy: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const geometry = touchGeometry(event);
      pinch = {
        ...geometry,
        scale: layoutRef.current.scale,
        ratio: 1,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
      };
      const spacer = spacerRef.current;
      if (spacer) {
        spacer.style.transformOrigin = `${pinch.left + pinch.cx}px ${pinch.top + pinch.cy}px`;
        spacer.style.willChange = "transform";
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const { distance } = touchGeometry(event);
      pinch.ratio = clamp(
        distance / pinch.distance,
        MIN_SCALE / pinch.scale,
        MAX_SCALE / pinch.scale,
      );
      if (spacerRef.current) spacerRef.current.style.transform = `scale(${pinch.ratio})`;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!pinch || event.touches.length >= 2) return;
      const done = pinch;
      pinch = null;
      const spacer = spacerRef.current;
      if (spacer) {
        spacer.style.transform = "";
        spacer.style.willChange = "";
      }
      if (Math.abs(done.ratio - 1) < 0.02) return;
      pendingScrollRef.current = {
        left: Math.max(0, (done.left + done.cx) * done.ratio - done.cx),
        top: Math.max(0, (done.top + done.cy) * done.ratio - done.cy),
      };
      const target = done.scale * done.ratio;
      pendingScaleRef.current = target;
      setZoomMode(target);
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [doc, setScaleAt]);

  // ---------- form ----------
  const editable = useMemo(
    () => fields.filter((field) => !field.readOnly),
    [fields],
  );
  const filledCount = editable.filter((field) => isFilled(values[field.name])).length;
  const dirty = fields.some((field) => values[field.name] !== savedValues[field.name]);
  const changedCount = fields.filter(
    (field) => values[field.name] !== initialRef.current[field.name],
  ).length;

  const pageFields = useMemo(() => {
    const map = new Map<number, PageFieldRef[]>();
    for (const field of fields) {
      for (const widget of field.widgets) {
        const list = map.get(widget.page) ?? [];
        list.push({ field, widget });
        map.set(widget.page, list);
      }
    }
    return map;
  }, [fields]);

  const setValue = useCallback((field: PdfField, value: PdfValue) => {
    setValues((current) => ({ ...current, [field.name]: value }));
    setStatus("");
  }, []);

  const locateField = useCallback(
    (field: PdfField) => {
      const widget = field.widgets[0];
      const size = sizesRef.current[widget.page - 1];
      const scroller = scrollerRef.current;
      if (!widget || !size || !scroller) return;
      cursorRef.current = fields.indexOf(field);
      const top = (size.h - Math.max(widget.rect[1], widget.rect[3])) * layoutRef.current.scale;
      goToPage(widget.page, top - scroller.clientHeight * 0.3);
      let tries = 0;
      const focus = () => {
        const element = scroller.querySelector<HTMLElement>(
          `[data-pdf-field="${CSS.escape(field.name)}"]`,
        );
        if (element) element.focus({ preventScroll: true });
        else if (tries++ < 12) window.setTimeout(focus, 60);
      };
      window.setTimeout(focus, 80);
    },
    [fields, goToPage],
  );

  const nextEmpty = useCallback(() => {
    if (!fields.length) return;
    for (let step = 1; step <= fields.length; step += 1) {
      const field = fields[(cursorRef.current + step + fields.length) % fields.length];
      if (!field.readOnly && !isFilled(values[field.name])) {
        locateField(field);
        return;
      }
    }
    setStatus("Every fillable field has a value.");
  }, [fields, values, locateField]);

  const visibleFields = useMemo(() => {
    const needle = formQuery.trim().toLocaleLowerCase();
    return fields.filter((field) => {
      if (onlyEmpty && isFilled(values[field.name])) return false;
      return (
        !needle ||
        field.label.toLocaleLowerCase().includes(needle) ||
        field.name.toLocaleLowerCase().includes(needle) ||
        String(values[field.name] ?? "").toLocaleLowerCase().includes(needle)
      );
    });
  }, [fields, formQuery, onlyEmpty, values]);

  async function exportCopy(mode: "send" | "download") {
    if (!doc) return;
    try {
      setSaving(true);
      setStatus("");
      const bytes = await makeFilledPdf(await doc.getData(), values, initialRef.current);
      const copy = filledName(name);
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      if (mode === "send" && onSendCopy) {
        await onSendCopy(new File([blob], copy, { type: "application/pdf" }));
        setStatus(`Sent ${copy} to the chat`);
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = copy;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
        setStatus(`Saved ${copy}`);
      }
      setSavedValues(values);
    } catch (saveError) {
      setStatus(
        saveError instanceof Error ? saveError.message : "The filled copy could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Close without saving your edits to this PDF?")) {
      return;
    }
    onClose();
  }, [dirty, onClose]);

  // ---------- search ----------
  useEffect(() => {
    const needle = normalizeNeedle(query);
    if (!doc || !needle) {
      setMatches([]);
      setMatchIndex(0);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        const found: SearchMatch[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          let runs = textCache.current.get(pageNumber);
          if (!runs) {
            const page = await doc.getPage(pageNumber);
            const content = await page.getTextContent({ includeMarkedContent: true });
            runs = content.items.flatMap((item) =>
              "str" in item ? [{ str: item.str, eol: item.hasEOL }] : [],
            );
            textCache.current.set(pageNumber, runs);
          }
          if (cancelled) return;
          findMatches(runs, needle).forEach((_, ordinal) =>
            found.push({ page: pageNumber, ordinal }),
          );
          if (found.length >= MAX_MATCHES) break;
          if (pageNumber % 12 === 0) {
            setMatches([...found]);
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (cancelled) return;
          }
        }
        if (cancelled) return;
        const current = findIndex(layoutRef.current.tops, scrollerRef.current?.scrollTop ?? 0) + 1;
        const nearest = found.findIndex((match) => match.page >= current);
        setMatches(found);
        setMatchIndex(Math.max(0, nearest));
        setSearching(false);
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, doc]);

  const currentMatch = searchOpen ? matches[matchIndex] : undefined;
  useEffect(() => {
    if (!currentMatch) return;
    // The page itself centers the hit once it has laid out its text; this only
    // has to bring far-away pages into the mounted window.
    const index = currentMatch.page - 1;
    if (index < view.first || index > view.last) goToPage(currentMatch.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch, goToPage]);

  const highlights = useMemo(() => {
    const needle = normalizeNeedle(query);
    const map = new Map<number, PageHighlight>();
    if (!searchOpen || !needle) return { base: null, map };
    const base: PageHighlight = { query: needle, current: null };
    if (currentMatch) {
      map.set(currentMatch.page, { query: needle, current: currentMatch.ordinal });
    }
    return { base, map };
  }, [searchOpen, query, currentMatch]);

  const stepMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    setMatchIndex((index) => (index + direction + matches.length) % matches.length);
  };

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") {
        event.preventDefault();
        if (searchOpen) {
          setSearchOpen(false);
          scrollerRef.current?.focus({ preventScroll: true });
        } else requestClose();
      } else if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
      } else if (mod && (event.key === "=" || event.key === "+")) {
        event.preventDefault();
        stepZoom(1);
      } else if (mod && event.key === "-") {
        event.preventDefault();
        stepZoom(-1);
      } else if (mod && event.key === "0") {
        event.preventDefault();
        setZoomMode("width");
      } else if (
        (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
        event.altKey
      ) {
        event.preventDefault();
        goToPage(view.current + (event.key === "ArrowRight" ? 1 : -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, requestClose, openSearch, stepZoom, goToPage, view]);

  useEffect(() => {
    if (doc) scrollerRef.current?.focus({ preventScroll: true });
  }, [doc]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (sidebar !== "pages" || !listEl) return;
    listEl
      .querySelector(`[data-thumb="${view.current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sidebar, listEl, view.current]);

  // ---------- render ----------
  const scale = layout.scale;
  const percent = Math.round((scale / CSS_UNITS) * 100);
  const zoomValue =
    zoomMode === "width" || zoomMode === "page" ? zoomMode : String(percent);
  const presets = ZOOM_PRESETS.includes(percent) || typeof zoomMode !== "number"
    ? ZOOM_PRESETS
    : [...ZOOM_PRESETS, percent].sort((a, b) => a - b);
  const pageCount = sizes.length;
  const pagesToRender: number[] = [];
  for (let index = Math.max(0, view.first); index <= view.last && index < pageCount; index += 1) {
    pagesToRender.push(index);
  }
  const loading = !doc && !error && !password;
  const hasForm = fields.length > 0;

  const onBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };
  const onPageKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      goToPage(Number(pageDraft));
      setPageDraft(null);
      event.currentTarget.blur();
      scrollerRef.current?.focus({ preventScroll: true });
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setPageDraft(null);
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className="pdfv-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF: ${name}`}
      onMouseDown={onBackdrop}
    >
      <section className="pdfv">
        <header className="pdfv-bar">
          <div className="pdfv-title">
            <span className="message-file-icon file-badge-pdf">PDF</span>
            <span>
              <strong title={name}>{name}</strong>
              <small>
                {loading
                  ? `Opening… ${progress ? Math.round(progress * 100) + "%" : ""}`
                  : pageCount
                    ? `${pageCount} page${pageCount === 1 ? "" : "s"}${
                        hasForm ? ` · ${filledCount}/${editable.length} fields filled` : ""
                      }`
                    : ""}
              </small>
            </span>
          </div>

          <div className="pdfv-tools">
            <div className="pdfv-group" aria-label="Page navigation">
              <button
                type="button"
                title="Previous page (Alt+←)"
                aria-label="Previous page"
                disabled={!pageCount || view.current <= 1}
                onClick={() => goToPage(view.current - 1)}
              >
                <Icon d={ICONS.up} />
              </button>
              <label className="pdfv-page-box">
                <input
                  inputMode="numeric"
                  aria-label="Page number"
                  value={pageDraft ?? String(view.current)}
                  disabled={!pageCount}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    setPageDraft(event.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                  onBlur={() => setPageDraft(null)}
                  onKeyDown={onPageKey}
                />
                <span>/ {pageCount || "–"}</span>
              </label>
              <button
                type="button"
                title="Next page (Alt+→)"
                aria-label="Next page"
                disabled={!pageCount || view.current >= pageCount}
                onClick={() => goToPage(view.current + 1)}
              >
                <Icon d={ICONS.down} />
              </button>
            </div>

            <div className="pdfv-group" aria-label="Zoom">
              <button
                type="button"
                title="Zoom out (Ctrl −)"
                aria-label="Zoom out"
                disabled={!pageCount}
                onClick={() => stepZoom(-1)}
              >
                <Icon d={ICONS.minus} />
              </button>
              <select
                aria-label="Zoom level"
                value={zoomValue}
                disabled={!pageCount}
                onChange={(event) => {
                  const next = event.target.value;
                  pendingScaleRef.current = null;
                  pendingScrollRef.current = null;
                  if (next === "width" || next === "page") setZoomMode(next);
                  else setZoomMode((Number(next) / 100) * CSS_UNITS);
                }}
              >
                <option value="width">Fit width</option>
                <option value="page">Fit page</option>
                {presets.map((preset) => (
                  <option key={preset} value={String(preset)}>
                    {preset}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Zoom in (Ctrl +)"
                aria-label="Zoom in"
                disabled={!pageCount}
                onClick={() => stepZoom(1)}
              >
                <Icon d={ICONS.plus} />
              </button>
            </div>

            <div className="pdfv-group">
              <button
                type="button"
                className={searchOpen ? "on" : ""}
                title="Find in document (Ctrl F)"
                aria-label="Find in document"
                aria-pressed={searchOpen}
                disabled={!pageCount}
                onClick={() => (searchOpen ? setSearchOpen(false) : openSearch())}
              >
                <Icon d={ICONS.search} />
              </button>
              <button
                type="button"
                className={sidebar === "pages" ? "on" : ""}
                title="Page thumbnails"
                aria-label="Page thumbnails"
                aria-pressed={sidebar === "pages"}
                disabled={!pageCount}
                onClick={() => setSidebar((current) => (current === "pages" ? null : "pages"))}
              >
                <Icon d={ICONS.pages} />
              </button>
              {hasForm && (
                <button
                  type="button"
                  className={`pdfv-form-toggle${sidebar === "form" ? " on" : ""}`}
                  title="Form fields"
                  aria-label="Form fields"
                  aria-pressed={sidebar === "form"}
                  onClick={() => setSidebar((current) => (current === "form" ? null : "form"))}
                >
                  <Icon d={ICONS.form} />
                  <span>Form</span>
                </button>
              )}
            </div>
          </div>

          <div className="pdfv-end">
            <a
              className="pdfv-icon-btn"
              href={url}
              download={name}
              title="Download original"
              aria-label="Download original"
            >
              <Icon d={ICONS.download} />
            </a>
            {hasForm && (
              <button
                type="button"
                className="pdfv-save"
                disabled={saving || !doc}
                onClick={() => void exportCopy(onSendCopy ? "send" : "download")}
                title={
                  onSendCopy
                    ? "Post a copy with your entries filled in to this chat"
                    : "Download a copy with your entries filled in"
                }
              >
                <Icon d={onSendCopy ? ICONS.send : ICONS.save} size={16} />
                <span>
                  {saving
                    ? onSendCopy ? "Sending…" : "Saving…"
                    : onSendCopy ? "Send copy" : "Save copy"}
                </span>
              </button>
            )}
            <button
              type="button"
              className="pdfv-icon-btn"
              aria-label="Close PDF"
              title="Close (Esc)"
              onClick={requestClose}
            >
              <Icon d={ICONS.close} />
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="pdfv-search" role="search">
            <Icon d={ICONS.search} size={16} />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              placeholder="Find in document"
              aria-label="Find in document"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  stepMatch(event.shiftKey ? -1 : 1);
                }
              }}
            />
            <span className="pdfv-search-count">
              {!query.trim()
                ? ""
                : searching && !matches.length
                  ? "Searching…"
                  : matches.length
                    ? `${matchIndex + 1} of ${matches.length}${matches.length >= MAX_MATCHES ? "+" : ""}${searching ? "…" : ""}`
                    : "No matches"}
            </span>
            <button type="button" aria-label="Previous match" disabled={!matches.length} onClick={() => stepMatch(-1)}>
              <Icon d={ICONS.up} size={16} />
            </button>
            <button type="button" aria-label="Next match" disabled={!matches.length} onClick={() => stepMatch(1)}>
              <Icon d={ICONS.down} size={16} />
            </button>
            <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>
              <Icon d={ICONS.close} size={16} />
            </button>
          </div>
        )}

        <div className={`pdfv-body${sidebar ? " with-side" : ""}`}>
          {sidebar && doc && (
            <aside className={`pdfv-side ${sidebar}`}>
              <div className="pdfv-side-head">
                {hasForm && (
                  <div className="pdfv-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sidebar === "pages"}
                      className={sidebar === "pages" ? "on" : ""}
                      onClick={() => setSidebar("pages")}
                    >
                      Pages
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sidebar === "form"}
                      className={sidebar === "form" ? "on" : ""}
                      onClick={() => setSidebar("form")}
                    >
                      Form
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="pdfv-side-close"
                  aria-label="Close panel"
                  onClick={() => setSidebar(null)}
                >
                  <Icon d={ICONS.close} size={16} />
                </button>
              </div>

              {sidebar === "pages" && (
                <div className="pdfv-thumbs" ref={setListEl}>
                  {sizes.map((size, index) => (
                    <PdfThumb
                      key={index}
                      doc={doc}
                      pageNumber={index + 1}
                      width={THUMB_WIDTH}
                      height={Math.round((THUMB_WIDTH * size.h) / size.w)}
                      active={view.current === index + 1}
                      root={listEl}
                      onSelect={goToPage}
                    />
                  ))}
                </div>
              )}

              {sidebar === "form" && (
                <div className="pdfv-formpanel">
                  <div className="pdfv-form-top">
                    <div
                      className="pdfv-meter"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={editable.length}
                      aria-valuenow={filledCount}
                    >
                      <i style={{ width: `${editable.length ? (filledCount / editable.length) * 100 : 0}%` }} />
                    </div>
                    <p>
                      {filledCount} of {editable.length} fields filled
                      {changedCount ? ` · ${changedCount} edited` : ""}
                    </p>
                    <div className="pdfv-form-actions">
                      <button type="button" className="pdfv-chip" onClick={nextEmpty}>
                        Next empty field
                      </button>
                      <button
                        type="button"
                        className="pdfv-chip subtle"
                        disabled={saving}
                        onClick={() => void exportCopy("download")}
                        title="Download a copy with your entries filled in"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="pdfv-chip subtle"
                        disabled={!changedCount}
                        onClick={() => {
                          setValues(initialRef.current);
                          setStatus("Your entries were reset.");
                        }}
                      >
                        Reset
                      </button>
                    </div>
                    <input
                      type="search"
                      value={formQuery}
                      onChange={(event) => setFormQuery(event.target.value)}
                      placeholder="Search fields…"
                      aria-label="Search form fields"
                    />
                    <label className="pdfv-check-row">
                      <input
                        type="checkbox"
                        checked={onlyEmpty}
                        onChange={(event) => setOnlyEmpty(event.target.checked)}
                      />
                      Only show empty fields
                    </label>
                  </div>
                  <div className="pdfv-fieldlist">
                    {visibleFields.map((field) => (
                      <div className="pdfv-field" key={field.name}>
                        <div className="pdfv-field-head">
                          <span title={field.name}>{field.label}</span>
                          <button
                            type="button"
                            title="Show on page"
                            aria-label={`Show ${field.label} on page`}
                            onClick={() => locateField(field)}
                          >
                            p.{field.widgets[0].page}
                            <Icon d={ICONS.locate} size={13} />
                          </button>
                        </div>
                        <FieldEditor field={field} value={values[field.name]} onValue={setValue} />
                        {field.readOnly && <small>Read only</small>}
                      </div>
                    ))}
                    {!visibleFields.length && (
                      <p className="pdfv-empty">No matching fields.</p>
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}

          <div className="pdfv-stage">
            <div
              className="pdfv-scroller"
              ref={scrollerRef}
              tabIndex={0}
              aria-label="Document pages"
            >
              {doc && (
                <div
                  className="pdfv-spacer"
                  ref={spacerRef}
                  style={{ width: layout.width, height: layout.total }}
                >
                  {pagesToRender.map((index) => (
                    <PdfPageView
                      key={index}
                      doc={doc}
                      pageNumber={index + 1}
                      scale={scale}
                      width={sizes[index].w * scale}
                      height={sizes[index].h * scale}
                      left={layout.lefts[index]}
                      top={layout.tops[index]}
                      fields={pageFields.get(index + 1) ?? NO_FIELDS}
                      values={values}
                      onValue={setValue}
                      onLink={goToDest}
                      highlight={highlights.map.get(index + 1) ?? highlights.base}
                    />
                  ))}
                </div>
              )}
            </div>

            {loading && (
              <div className="pdfv-state">
                <div className="pdfv-spinner" />
                <p>Opening PDF{progress ? ` · ${Math.round(progress * 100)}%` : "…"}</p>
              </div>
            )}
            {error && (
              <div className="pdfv-state error">
                <p>{error}</p>
                <a href={url} download={name} className="pdfv-chip">
                  Download the file instead
                </a>
              </div>
            )}
            {password && (
              <form
                className="pdfv-state pdfv-password"
                onSubmit={(event) => {
                  event.preventDefault();
                  password.submit(passwordDraft);
                  setPasswordDraft("");
                }}
              >
                <p>
                  {password.wrong
                    ? "That password didn't work. Try again."
                    : "This PDF is password protected."}
                </p>
                <input
                  type="password"
                  autoFocus
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  placeholder="Password"
                  aria-label="PDF password"
                />
                <button type="submit" className="pdfv-chip primary">
                  Open
                </button>
              </form>
            )}
            {status && (
              <button type="button" className="pdfv-toast" onClick={() => setStatus("")}>
                {status}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const NO_FIELDS: PageFieldRef[] = [];

function FieldEditor({
  field,
  value,
  onValue,
}: {
  field: PdfField;
  value: PdfValue | undefined;
  onValue: (field: PdfField, value: PdfValue) => void;
}) {
  if (field.kind === "checkbox") {
    return (
      <label className="pdfv-check-row box">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={field.readOnly}
          onChange={(event) => onValue(field, event.target.checked)}
        />
        {value ? "Checked" : "Not checked"}
      </label>
    );
  }
  if (field.kind === "radio") {
    return (
      <div className="pdfv-radios">
        {field.options?.map((option) => (
          <label className="pdfv-check-row" key={option}>
            <input
              type="radio"
              name={`pdfv-side-${field.name}`}
              checked={value === option}
              disabled={field.readOnly}
              onChange={() => onValue(field, option)}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <select
        value={String(value || "")}
        disabled={field.readOnly}
        onChange={(event) => onValue(field, event.target.value)}
      >
        <option value="">Choose…</option>
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
        rows={3}
        value={String(value || "")}
        readOnly={field.readOnly}
        onChange={(event) => onValue(field, event.target.value)}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value || "")}
      readOnly={field.readOnly}
      maxLength={field.widgets[0]?.maxLength}
      onChange={(event) => onValue(field, event.target.value)}
    />
  );
}
