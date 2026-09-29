import { DocsPage, docMetadata } from "../components/docs-page";
import { DOCS } from "../lib/docs";

export function generateMetadata() {
  return docMetadata(DOCS[0]);
}

export default function DocsIndexRoute() {
  return <DocsPage doc={DOCS[0]} />;
}
