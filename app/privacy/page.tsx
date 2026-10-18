import { DocsPage, docMetadata } from "../components/docs-page";
import { findDoc } from "../lib/docs";

const doc = findDoc("privacy")!;

export function generateMetadata() {
  return docMetadata(doc);
}

export default function PrivacyRoute() {
  return <DocsPage doc={doc} />;
}
