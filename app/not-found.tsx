"use client";
import { Hoffy } from "./components/hoffy";
import { useI18n } from "./lib/i18n-context";

/** Any page that doesn't exist, on the app and on hoffle.online. */
export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="hoffy-404">
      <Hoffy face="sad" pose="shrug" size={200} id="hoffy-404" />
      <p className="hoffy-404-code">404</p>
      <h1>{t("mascot.notFound.title")}</h1>
      <p>{t("mascot.notFound.body")}</p>
      <a className="hoffy-404-home" href="/">{t("mascot.notFound.home")}</a>
    </main>
  );
}
