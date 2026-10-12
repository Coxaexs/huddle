import type { PDFDocumentProxy } from "pdfjs-dist";
import { basePath } from "../../lib/client";

export type PdfValue = string | boolean;

export interface PdfWidget {
  id: string;
  page: number;
  /** Rectangle in PDF user space. */
  rect: number[];
  /** Radio buttons: the export value this widget selects. */
  buttonValue?: string;
  maxLength?: number;
  comb?: boolean;
  align?: number;
  fontSize?: number;
}

export interface PdfField {
  name: string;
  label: string;
  kind: "text" | "checkbox" | "radio" | "select";
  value: PdfValue;
  options?: string[];
  multiline?: boolean;
  readOnly?: boolean;
  widgets: PdfWidget[];
}

interface RawAnnotation {
  id: string;
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: unknown;
  alternativeText?: string;
  rect?: number[];
  readOnly?: boolean;
  hidden?: boolean;
  annotationFlags?: number;
  multiLine?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  combo?: boolean;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  maxLen?: number;
  comb?: boolean;
  textAlignment?: number;
  defaultAppearanceData?: { fontSize?: number };
}

const HIDDEN_FLAGS = 0x2 | 0x20; // Hidden | NoView

/** "topmostSubform[0].Page1[0].First_Name[0]" -> "First Name". */
export function humanizeFieldName(name: string) {
  const last = name.split(".").pop() || name;
  return (
    last
      .replace(/\[\d+\]/g, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-\s]+/g, " ")
      .trim() || name
  );
}

function firstString(value: unknown) {
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return value == null ? "" : String(value);
}

/** Reads every fillable widget in the document, grouped by field name. */
export async function collectFields(doc: PDFDocumentProxy): Promise<PdfField[]> {
  const byName = new Map<string, PdfField>();
  const order: string[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const annotations = (await page.getAnnotations({
      intent: "display",
    })) as unknown as RawAnnotation[];

    for (const annotation of annotations) {
      if (annotation.subtype !== "Widget" || !annotation.fieldName) continue;
      if (annotation.pushButton || annotation.fieldType === "Sig") continue;
      if (!annotation.rect) continue;
      if (annotation.hidden || ((annotation.annotationFlags || 0) & HIDDEN_FLAGS)) {
        continue;
      }

      const widget: PdfWidget = {
        id: annotation.id,
        page: pageNumber,
        rect: annotation.rect,
        buttonValue: annotation.buttonValue,
        maxLength: annotation.maxLen || undefined,
        comb: annotation.comb,
        align: annotation.textAlignment,
        fontSize: annotation.defaultAppearanceData?.fontSize || undefined,
      };

      const existing = byName.get(annotation.fieldName);
      if (existing) {
        existing.widgets.push(widget);
        continue;
      }

      let kind: PdfField["kind"];
      let value: PdfValue;
      let options: string[] | undefined;
      if (annotation.fieldType === "Btn" && annotation.radioButton) {
        kind = "radio";
        const current = firstString(annotation.fieldValue);
        value = current === "Off" ? "" : current;
      } else if (annotation.fieldType === "Btn") {
        kind = "checkbox";
        const current = firstString(annotation.fieldValue);
        value = Boolean(current) && current !== "Off";
      } else if (annotation.fieldType === "Ch") {
        kind = "select";
        options = (annotation.options || []).map(
          (option) => option.displayValue || option.exportValue,
        );
        const current = firstString(annotation.fieldValue);
        const match = (annotation.options || []).find(
          (option) => option.exportValue === current,
        );
        value = match ? match.displayValue || match.exportValue : current;
      } else if (annotation.fieldType === "Tx") {
        kind = "text";
        value = firstString(annotation.fieldValue);
      } else {
        continue;
      }

      byName.set(annotation.fieldName, {
        name: annotation.fieldName,
        label: annotation.alternativeText?.trim() || humanizeFieldName(annotation.fieldName),
        kind,
        value,
        options,
        multiline: Boolean(annotation.multiLine),
        readOnly: Boolean(annotation.readOnly),
        widgets: [widget],
      });
      order.push(annotation.fieldName);
    }
  }

  const fields = order.map((name) => byName.get(name)!);
  for (const field of fields) {
    if (field.kind === "radio") {
      field.options = field.widgets
        .map((widget) => widget.buttonValue || "")
        .filter(Boolean);
    }
  }
  return fields;
}

export function isFilled(value: PdfValue | undefined) {
  return value !== undefined && value !== "" && value !== false;
}

export function filledName(name: string) {
  const stem = name.replace(/\.pdf$/i, "") || "document";
  return `${stem}-filled.pdf`;
}

/** Writes edited values into a copy of the original bytes with pdf-lib. */
export async function makeFilledPdf(
  source: Uint8Array,
  values: Record<string, PdfValue>,
  initial: Record<string, PdfValue>,
) {
  const [pdf, fontkitModule, fontResponse] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    fetch(`${basePath}/pdf-form-font.ttf`, { credentials: "same-origin" }),
  ]);
  if (!fontResponse.ok) {
    throw new Error("The Unicode PDF font could not be loaded.");
  }
  const document = await pdf.PDFDocument.load(source.slice());
  document.registerFontkit(fontkitModule.default);
  const unicodeFont = await document.embedFont(
    await fontResponse.arrayBuffer(),
    // pdf-lib's subset font appearances are not painted by every PDF viewer
    // (notably Poppler). Embed the complete font so saved text stays portable.
    { subset: false },
  );
  const form = document.getForm();
  const byName = new Map(form.getFields().map((field) => [field.getName(), field]));

  for (const [name, value] of Object.entries(values)) {
    if (value === initial[name]) continue;
    const field = byName.get(name);
    if (!field || field.isReadOnly()) continue;

    if (field instanceof pdf.PDFTextField && typeof value === "string") {
      if (value) field.setText(value);
      else field.setText(undefined);
    } else if (field instanceof pdf.PDFCheckBox && typeof value === "boolean") {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof pdf.PDFRadioGroup && typeof value === "string") {
      if (value) field.select(value);
      else field.clear();
    } else if (
      (field instanceof pdf.PDFDropdown || field instanceof pdf.PDFOptionList) &&
      typeof value === "string"
    ) {
      if (value) field.select(value);
      else field.clear();
    }
  }

  // Keep the AcroForm interactive and regenerate dirty appearances with a
  // Unicode font so Turkish and other non-WinAnsi text remain visible.
  form.updateFieldAppearances(unicodeFont);
  return document.save({ useObjectStreams: false, updateFieldAppearances: false });
}
