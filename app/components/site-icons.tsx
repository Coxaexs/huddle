import type { SVGProps } from "react";

/** Minimal 1.5px-stroke icons for the landing page; same props as the lucide ones they replace. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const Coffee = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Zm12 1h2a2 2 0 0 1 0 5h-2M8 3v3m4-3v3" /></Icon>
);
export const Heart = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 20 4.5 12.5a4.5 4.5 0 0 1 7.5-4.7 4.5 4.5 0 0 1 7.5 4.7L12 20Z" /></Icon>
);
export const Mail = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M3 6h18v12H3V6Zm0 0 9 7 9-7" /></Icon>
);
export const Server = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 4h16v7H4V4Zm0 9h16v7H4v-7Zm3-6.5h.01M7 16.5h.01" /></Icon>
);
export const X = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m6 6 12 12M18 6 6 18" /></Icon>
);
export const ChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m15 5-7 7 7 7" /></Icon>
);
export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>
);
