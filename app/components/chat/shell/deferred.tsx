"use client";

import { lazy, Suspense, type ComponentType } from "react";

/**
 * A component whose code is fetched the first time it renders, so the heavy
 * corners of the app (the voice stage, the 3D living room, settings, the PDF
 * viewer) stay out of the bundle everyone downloads on page load. Renders
 * nothing while its chunk loads. `preload` starts the fetch early.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deferred<C extends ComponentType<any>>(load: () => Promise<C>) {
  let pending: Promise<{ default: C }> | null = null;
  const preload = () => (pending ??= load().then((component) => ({ default: component })));
  const Lazy = lazy(preload);
  function Deferred(props: React.ComponentProps<C>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Object.assign(Deferred, { preload });
}
