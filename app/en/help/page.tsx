import { HelpIndexPage, helpMetadata } from "../../components/help-page";

export function generateMetadata() {
  return helpMetadata(undefined, "en");
}

export default function EnglishHelpIndexRoute() {
  return <HelpIndexPage lang="en" />;
}
