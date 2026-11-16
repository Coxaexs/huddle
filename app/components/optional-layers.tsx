"use client";

import { useEffect, useState } from "react";
import { useModuleOn } from "@/app/lib/modules";
import { AchievementCenter } from "./achievement-center";
import { deferred } from "./chat/shell/deferred";

const BlahajBuddy = deferred(() => import("./blahaj-buddy").then((m) => m.BlahajBuddy));

/** Unlock popups and the achievements board, unless the person switched them off. */
export function AchievementLayer({ userId }: { userId: string | null }) {
  const on = useModuleOn("achievements");
  return on ? <AchievementCenter userId={userId} /> : null;
}

function buddyWanted(): boolean {
  if (typeof document === "undefined") return false;
  const flag = document.documentElement.dataset.blahaj;
  if (flag) return flag === "on";
  try {
    return window.localStorage.getItem("huddle-blahaj") === "on";
  } catch {
    return false;
  }
}

/**
 * The buddy is off unless someone turned it on in Settings, so its code is
 * only fetched once it is wanted. After that it stays mounted: put to sleep,
 * it leaves a small dock to wake it from.
 */
export function BuddyLayer({ onRollCommand }: { onRollCommand: (command: string) => void }) {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (wanted) return;
    const check = () => {
      if (buddyWanted()) setWanted(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-blahaj"] });
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "on") setWanted(true);
    };
    window.addEventListener("huddle-blahaj-change", onChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("huddle-blahaj-change", onChange);
    };
  }, [wanted]);
  return wanted ? <BlahajBuddy onRollCommand={onRollCommand} /> : null;
}
