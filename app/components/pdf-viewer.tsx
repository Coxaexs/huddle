"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { basePath } from "../lib/client";

type PdfLib = typeof import("pdf-lib");
type PdfJs = typeof import("pdfjs-dist");
type PdfValue = string | boolean;

interface PdfField {
  name: string;
  kind: "text" | "checkbox" | "select";
  value: PdfValue;
  options?: string[];
  multiline?: boolean;
  readOnly?: boolean;
}

interface PdfAnnotation {
  id: string;
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  rect?: number[];
  readOnly?: boolean;
  multiLine?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  buttonValue?: string;
}

interface PdfViewport {
  width: number;
  height: number;
  convertToViewportRectangle: (rect: number[]) => number[];
}

interface PdfPageProxy {
  pageNumber: number;
  getViewport: (options: { scale: number }) => PdfViewport;
  getAnnotations: (options: { intent: string }) => Promise<PdfAnnotation[]>;
  render: (options: Record<string, unknown>) => {
    promise: Promise<void>;
    cancel: () => void;
  };
}

interface PdfDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
}

interface PdfViewerProps {
  url: string;
  name: string;
  onClose: () => void;
}

function downloadName(name: string) {
  const stem = name.replace(/\.pdf$/i, "") || "document";
  return `${stem}-filled.pdf`;
}

function friendlyName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readFields(
  document: Awaited<ReturnType<PdfLib["PDFDocument"]["load"]>>,
  pdf: PdfLib,
): PdfField[] {
  const fields: PdfField[] = [];

  for (const field of document.getForm().getFields()) {
    const name = field.getName();
    const readOnly = field.isReadOnly();

    if (field instanceof pdf.PDFTextField) {
      fields.push({
        name,
        kind: "text",
        value: field.getText() || "",
        multiline: field.isMultiline(),
        readOnly,
      });
    } else if (field instanceof pdf.PDFCheckBox) {
      fields.push({
        name,
        kind: "checkbox",
        value: field.isChecked(),
        readOnly,
      });
    } else if (field instanceof pdf.PDFDropdown) {
      fields.push({
        name,
        kind: "select",
        value: field.getSelected()[0] || "",
        options: field.getOptions(),
        readOnly,
      });
    } else if (field instanceof pdf.PDFOptionList) {
      fields.push({
        name,
        kind: "select",
        value: field.getSelected()[0] || "",
        options: field.getOptions(),
        readOnly,
      });
    } else if (field instanceof pdf.PDFRadioGroup) {
      fields.push({
        name,
        kind: "select",
        value: field.getSelected() || "",
        options: field.getOptions(),
        readOnly,
      });
    }
  }

  return fields;
}

async function makeFilledPdf(
  source: ArrayBuffer,
  values: Record<string, PdfValue>,
) {
  const pdf = await import("pdf-lib");
  const document = await pdf.PDFDocument.load(source.slice(0));
  const byName = new Map(
    document.getForm().getFields().map((field) => [field.getName(), field]),
  );

  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name);
    if (!field || field.isReadOnly()) continue;

    if (field instanceof pdf.PDFTextField && typeof value === "string") {
      field.setText(value);
    } else if (field instanceof pdf.PDFCheckBox && typeof value === "boolean") {
      if (value) field.check();
      else field.uncheck();
    } else if (
      (field instanceof pdf.PDFDropdown ||
        field instanceof pdf.PDFOptionList ||
        field instanceof pdf.PDFRadioGroup) &&
      typeof value === "string"
    ) {
      if (value) field.select(value);
      else if ("clear" in field && typeof field.clear === "function") field.clear();
    }
  }

  // Keep the AcroForm interactive. pdf-lib regenerates appearances during
  // save, so the value tree and what other viewers paint stay in agreement.
  return document.save({ useObjectStreams: false });
}

function PdfPage({
  page,
  pdfjs,
  scale,
  fieldsByName,
  values,
  onValue,
}: {
  page: PdfPageProxy;
  pdfjs: PdfJs;
  scale: number;
  fieldsByName: Map<string, PdfField>;
  values: Record<string, PdfValue>;
  onValue: (field: PdfField, value: PdfValue) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const viewport = useMemo(() => page.getViewport({ scale }), [page, scale]);

  useEffect(() => {
    let disposed = false;
    void page
      .getAnnotations({ intent: "display" })
      .then((result) => !disposed && setAnnotations(result))
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    });
    void task.promise.catch((renderError) => {
      if ((renderError as { name?: string })?.name !== "RenderingCancelledException") {
        console.error("PDF page render failed", renderError);
      }
    });
    return () => task.cancel();
  }, [page, pdfjs, viewport]);

  return (
    <section
      className="pdf-page"
      style={{ width: viewport.width, height: viewport.height }}
      aria-label={`Page ${page.pageNumber}`}
    >
      <canvas ref={canvasRef} />
      <div className="pdf-form-layer">
        {annotations.map((annotation) => {
          if (
            annotation.subtype !== "Widget" ||
            !annotation.fieldName ||
            !annotation.rect
          ) {
            return null;
          }
          const field = fieldsByName.get(annotation.fieldName);
          if (!field) return null;
          const converted = viewport.convertToViewportRectangle(annotation.rect);
          const left = Math.min(converted[0], converted[2]);
          const top = Math.min(converted[1], converted[3]);
          const width = Math.abs(converted[2] - converted[0]);
          const height = Math.abs(converted[3] - converted[1]);
          if (width < 2 || height < 2) return null;
          const style = {
            left,
            top,
            width,
            height,
            "--pdf-field-size": `${Math.max(8, Math.min(22, height * 0.62))}px`,
          } as CSSProperties;
          const readOnly = field.readOnly || annotation.readOnly;

          if (annotation.radioButton) {
            const option = annotation.buttonValue || "";
            return (
              <label
                className="pdf-page-radio"
                style={style}
                key={annotation.id}
                title={friendlyName(field.name)}
              >
                <input
                  type="radio"
                  name={`pdf-${field.name}`}
                  checked={String(values[field.name] || "") === option}
                  disabled={readOnly}
                  onChange={() => onValue(field, option)}
                />
              </label>
            );
          }
          if (field.kind === "checkbox" || annotation.checkBox) {
            return (
              <label
                className="pdf-page-checkbox"
                style={style}
                key={annotation.id}
                title={friendlyName(field.name)}
              >
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  disabled={readOnly}
                  onChange={(event) => onValue(field, event.target.checked)}
                />
              </label>
            );
          }
          if (field.kind === "select") {
            return (
              <select
                className="pdf-page-select"
                style={style}
                key={annotation.id}
                aria-label={friendlyName(field.name)}
                value={String(values[field.name] || "")}
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
          if (field.multiline || annotation.multiLine) {
            return (
              <textarea
                className="pdf-page-input multiline"
                style={style}
                key={annotation.id}
                aria-label={friendlyName(field.name)}
                value={String(values[field.name] || "")}
                readOnly={readOnly}
                onChange={(event) => onValue(field, event.target.value)}
              />
            );
          }
          return (
            <input
              className="pdf-page-input"
              style={style}
              key={annotation.id}
              type="text"
              aria-label={friendlyName(field.name)}
              value={String(values[field.name] || "")}
              readOnly={readOnly}
              onChange={(event) => onValue(field, event.target.value)}
            />
          );
        })}
      </div>
      <span className="pdf-page-number">{page.pageNumber}</span>
    </section>
  );
}

export function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const sourceRef = useRef<ArrayBuffer | null>(null);
  const documentRef = useRef<PdfDocumentProxy | null>(null);
  const initialValuesRef = useRef<Record<string, PdfValue>>({});
  const previewRef = useRef<HTMLDivElement>(null);
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [pages, setPages] = useState<PdfPageProxy[]>([]);
  const [fields, setFields] = useState<PdfField[]>([]);
  const [values, setValues] = useState<Record<string, PdfValue>>({});
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("The PDF could not be loaded.");
        const source = await response.arrayBuffer();
        const [formPdf, renderer] = await Promise.all([
          import("pdf-lib"),
          import("pdfjs-dist"),
        ]);
        renderer.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
        const formDocument = await formPdf.PDFDocument.load(source.slice(0));
        const detected = readFields(formDocument, formPdf);
        const renderDocument = (await renderer
          .getDocument({ data: new Uint8Array(source.slice(0)) })
          .promise) as unknown as PdfDocumentProxy;
        const loadedPages = await Promise.all(
          Array.from({ length: renderDocument.numPages }, (_, index) =>
            renderDocument.getPage(index + 1),
          ),
        );
        if (cancelled) {
          await renderDocument.destroy();
          return;
        }
        const initial = Object.fromEntries(
          detected.map((field) => [field.name, field.value]),
        );
        sourceRef.current = source;
        documentRef.current = renderDocument;
        initialValuesRef.current = initial;
        setPdfjs(renderer);
        setPages(loadedPages);
        setFields(detected);
        setValues(initial);
        setFieldsOpen(window.innerWidth > 900);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The PDF could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.destroy();
    };
  }, [url]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const container = previewRef.current;
    const first = pages[0];
    if (!container || !first) return;
    const resize = () => {
      const natural = first.getViewport({ scale: 1 }).width;
      const available = Math.max(240, container.clientWidth - 28);
      setFitScale(Math.max(0.35, Math.min(1.65, available / natural)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [pages]);

  const fieldsByName = useMemo(
    () => new Map(fields.map((field) => [field.name, field])),
    [fields],
  );
  const visibleFields = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return fields.filter((field) => {
      const value = values[field.name];
      if (
        !showEmpty &&
        (value === "" || value === false || value === null || value === undefined)
      ) {
        return false;
      }
      return (
        !needle ||
        field.name.toLocaleLowerCase().includes(needle) ||
        friendlyName(field.name).toLocaleLowerCase().includes(needle) ||
        String(value).toLocaleLowerCase().includes(needle)
      );
    });
  }, [fields, query, showEmpty, values]);
  const changedCount = useMemo(
    () =>
      fields.reduce(
        (count, field) =>
          values[field.name] !== initialValuesRef.current[field.name]
            ? count + 1
            : count,
        0,
      ),
    [fields, values],
  );

  function setValue(field: PdfField, value: PdfValue) {
    setValues((current) => ({ ...current, [field.name]: value }));
    setStatus("");
  }

  async function saveCopy() {
    try {
      setWorking(true);
      setError("");
      if (!sourceRef.current) throw new Error("The PDF is still loading.");
      const bytes = await makeFilledPdf(sourceRef.current, values);
      const blobUrl = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = downloadName(name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
      setStatus(`Saved ${downloadName(name)} with ${changedCount} changed fields.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The filled copy could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  function stopBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  const pageScale = fitScale * zoom;

  return (
    <div
      className="pdf-workspace-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF editor: ${name}`}
      onMouseDown={stopBackdrop}
    >
      <section className="pdf-workspace">
        <header className="pdf-workspace-head">
          <div className="pdf-workspace-title">
            <span className="message-file-icon">PDF</span>
            <span>
              <strong>{name}</strong>
              <small>
                {loading
                  ? "Preparing editable pages…"
                  : `${pages.length} pages · ${fields.length} fillable fields · ${changedCount} changed`}
              </small>
            </span>
          </div>
          <div className="pdf-workspace-actions">
            <div className="pdf-zoom" aria-label="PDF zoom controls">
              <button
                type="button"
                onClick={() => setZoom((current) => Math.max(0.6, current - 0.15))}
                aria-label="Zoom out"
              >
                −
              </button>
              <button type="button" onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((current) => Math.min(2, current + 0.15))}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <button
              type="button"
              className={`pdf-fields-toggle ${fieldsOpen ? "active" : ""}`}
              onClick={() => setFieldsOpen((open) => !open)}
            >
              Fields <span>{fields.length}</span>
            </button>
            <button
              type="button"
              className="secondary pdf-reset"
              disabled={working || !changedCount}
              onClick={() => {
                setValues(initialValuesRef.current);
                setStatus("All unsaved edits were reset.");
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="primary"
              disabled={working || loading || !sourceRef.current}
              onClick={() => void saveCopy()}
            >
              {working ? "Saving…" : "Save copy"}
            </button>
            <button
              type="button"
              className="pdf-workspace-close"
              aria-label="Close PDF"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className={`pdf-workspace-body ${fieldsOpen ? "fields-open" : ""}`}>
          <div className="pdf-preview" ref={previewRef}>
            {loading && <div className="pdf-loading">Rendering editable pages…</div>}
            {!loading && error && !pages.length && (
              <div className="pdf-loading error">{error}</div>
            )}
            {pdfjs && pages.length > 0 && (
              <div className="pdf-pages">
                {pages.map((page) => (
                  <PdfPage
                    key={page.pageNumber}
                    page={page}
                    pdfjs={pdfjs}
                    scale={pageScale}
                    fieldsByName={fieldsByName}
                    values={values}
                    onValue={setValue}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className={`pdf-fields ${fieldsOpen ? "open" : ""}`}>
            <div className="pdf-fields-mobile-grip" aria-hidden="true" />
            <div className="pdf-fields-head">
              <div>
                <strong>All form fields</strong>
                <small>
                  These stay synchronized with the fields directly on each page.
                </small>
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search fields…"
                aria-label="Search PDF fields"
              />
              <label className="pdf-empty-toggle">
                <input
                  type="checkbox"
                  checked={showEmpty}
                  onChange={(event) => setShowEmpty(event.target.checked)}
                />
                Show empty fields
              </label>
            </div>

            <div className="pdf-field-list">
              {!loading &&
                visibleFields.map((field) => (
                  <label className="pdf-field" key={field.name}>
                    <span title={field.name}>{friendlyName(field.name)}</span>
                    {field.kind === "checkbox" ? (
                      <span className="pdf-checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(values[field.name])}
                          disabled={field.readOnly}
                          onChange={(event) => setValue(field, event.target.checked)}
                        />
                        {Boolean(values[field.name]) ? "Checked" : "Not checked"}
                      </span>
                    ) : field.kind === "select" ? (
                      <select
                        value={String(values[field.name] || "")}
                        disabled={field.readOnly}
                        onChange={(event) => setValue(field, event.target.value)}
                      >
                        <option value="">Choose…</option>
                        {field.options?.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.multiline ? (
                      <textarea
                        rows={3}
                        value={String(values[field.name] || "")}
                        readOnly={field.readOnly}
                        onChange={(event) => setValue(field, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(values[field.name] || "")}
                        readOnly={field.readOnly}
                        onChange={(event) => setValue(field, event.target.value)}
                      />
                    )}
                    {field.readOnly && <small>Read only</small>}
                  </label>
                ))}
              {!loading && fields.length > 0 && visibleFields.length === 0 && (
                <div className="pdf-field-state">No matching fields.</div>
              )}
            </div>
          </aside>
        </div>

        {(status || (error && pages.length > 0)) && (
          <button
            type="button"
            className={`pdf-workspace-status ${error ? "error" : ""}`}
            onClick={() => {
              setStatus("");
              setError("");
            }}
          >
            {error || status} ×
          </button>
        )}
      </section>
    </div>
  );
}
