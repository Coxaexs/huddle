import { notFound } from "next/navigation";
import { DocsPage, docMetadata } from "../../components/docs-page";
import { findDoc } from "../../lib/docs";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const doc = findDoc((await params).slug);
  return doc ? docMetadata(doc) : {};
}

export default async function DocRoute({ params }: Params) {
  const doc = findDoc((await params).slug);
  // "" is /docs itself, which has its own route.
  if (!doc || !doc.slug) notFound();
  return <DocsPage doc={doc} />;
}
