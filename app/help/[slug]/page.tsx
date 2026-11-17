import { notFound } from "next/navigation";
import { HelpChapterPage, helpMetadata } from "../../components/help-page";
import { findHelpChapter } from "../../lib/help";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const chapter = findHelpChapter((await params).slug);
  return chapter ? helpMetadata(chapter) : {};
}

export default async function HelpChapterRoute({ params }: Params) {
  const chapter = findHelpChapter((await params).slug);
  if (!chapter) notFound();
  return <HelpChapterPage chapter={chapter} />;
}
