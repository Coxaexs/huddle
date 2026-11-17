import { HelpIndexPage, helpMetadata } from "../components/help-page";

export function generateMetadata() {
  return helpMetadata();
}

export default function HelpIndexRoute() {
  return <HelpIndexPage />;
}
