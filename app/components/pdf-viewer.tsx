"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

type PdfLib = typeof import("pdf-lib");

type PdfValue = string | boolean;

interface PdfField {
  name: string;
  kind: "text" | "checkbox" | "select";
  value: PdfValue;
  options?: string[];
  multiline?: boolean;
  readOnly?: boolean;
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
      typeof value === "string" &&
      value
    ) {
      field.select(value);
    }
  }

  return document.save({ useObjectStreams: false });
}

export function PdfViewer({ url, name, onClose }: PdfViewerProps) {
  const sourceRef = useRef<ArrayBuffer | null>(null);
  const generatedUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(url);
  const [fields, setFields] = useState<PdfField[]>([]);
  const [values, setValues] = useState<Record<string, PdfValue>>({});
  const [query, setQuery] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("The PDF could not be loaded.");
        const source = await response.arrayBuffer();
        const pdf = await import("pdf-lib");
        const document = await pdf.PDFDocument.load(source.slice(0));
        const detected = readFields(document, pdf);
        if (cancelled) return;

        sourceRef.current = source;
        setFields(detected);
        setValues(
          Object.fromEntries(detected.map((field) => [field.name, field.value])),
        );
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
      if (generatedUrlRef.current) {
        URL.revokeObjectURL(generatedUrlRef.current);
      }
    };
  }, [url]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

  function setValue(field: PdfField, value: PdfValue) {
    setValues((current) => ({ ...current, [field.name]: value }));
    setStatus("");
  }

  async function build() {
    if (!sourceRef.current) throw new Error("The PDF is still loading.");
    return makeFilledPdf(sourceRef.current, values);
  }

  async function applyPreview() {
    try {
      setWorking(true);
      setError("");
      const bytes = await build();
      const blobUrl = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
      );
      if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = blobUrl;
      setPreviewUrl(blobUrl);
      setStatus("Preview updated with your field values.");
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "The preview could not be updated.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function saveCopy() {
    try {
      setWorking(true);
      setError("");
      const bytes = await build();
      const blobUrl = URL.createObjectURL(
        new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = downloadName(name);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
      setStatus(`Saved ${downloadName(name)}.`);
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

  return (
    <div
      className="pdf-workspace-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer: ${name}`}
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
                  ? "Reading form fields…"
                  : fields.length
                    ? `${fields.length} fillable fields detected`
                    : "PDF document"}
              </small>
            </span>
          </div>
          <div className="pdf-workspace-actions">
            <a href={url} target="_blank" rel="noreferrer">
              Open original ↗
            </a>
            <button
              type="button"
              className="secondary"
              disabled={working || loading || !sourceRef.current}
              onClick={() => void applyPreview()}
            >
              {working ? "Working…" : "Apply preview"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={working || loading || !sourceRef.current}
              onClick={() => void saveCopy()}
            >
              Save filled copy
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

        <div className="pdf-workspace-body">
          <div className="pdf-preview">
            <iframe title={name} src={previewUrl} />
          </div>

          <aside className="pdf-fields">
            <div className="pdf-fields-head">
              <div>
                <strong>Fillable fields</strong>
                <small>Your original attachment is never overwritten.</small>
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
              {loading && <div className="pdf-field-state">Reading this PDF…</div>}
              {!loading && error && !fields.length && (
                <div className="pdf-field-state error">{error}</div>
              )}
              {!loading && !error && !fields.length && (
                <div className="pdf-field-state">
                  This PDF has no supported fillable fields. You can still read
                  it here or open the original.
                </div>
              )}
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
                          onChange={(event) =>
                            setValue(field, event.target.checked)
                          }
                        />
                        {Boolean(values[field.name]) ? "Checked" : "Not checked"}
                      </span>
                    ) : field.kind === "select" ? (
                      <select
                        value={String(values[field.name] || "")}
                        disabled={field.readOnly}
                        onChange={(event) =>
                          setValue(field, event.target.value)
                        }
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
                        onChange={(event) =>
                          setValue(field, event.target.value)
                        }
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(values[field.name] || "")}
                        readOnly={field.readOnly}
                        onChange={(event) =>
                          setValue(field, event.target.value)
                        }
                      />
                    )}
                    {field.readOnly && <small>Read only</small>}
                  </label>
                ))}
              {!loading && fields.length > 0 && visibleFields.length === 0 && (
                <div className="pdf-field-state">No matching fields.</div>
              )}
            </div>

            {(status || (error && fields.length > 0)) && (
              <div className={`pdf-workspace-status ${error ? "error" : ""}`}>
                {error || status}
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
