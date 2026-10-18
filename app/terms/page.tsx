import { DocsPage, docMetadata } from "../components/docs-page";
import { findDoc } from "../lib/docs";

const doc = findDoc("terms")!;

export function generateMetadata() {
  return docMetadata(doc);
}

export default function TermsRoute() {
  return <DocsPage doc={doc} />;
}
