import { notFound } from "next/navigation";
import { HelpChapterPage, helpMetadata } from "../../../components/help-page";
import { findHelpChapter } from "../../../lib/help";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const chapter = findHelpChapter((await params).slug, "en");
  return chapter ? helpMetadata(chapter, "en") : {};
}

export default async function EnglishHelpChapterRoute({ params }: Params) {
  const chapter = findHelpChapter((await params).slug, "en");
  if (!chapter) notFound();
  return <HelpChapterPage chapter={chapter} lang="en" />;
}
