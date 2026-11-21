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
export const Check = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
);
export const Mic = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M9 4h6v8a3 3 0 0 1-6 0V4ZM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></Icon>
);
export const Music = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></Icon>
);
export const Dice = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 4h16v16H4V4Zm4.5 4.5h.01m6.99 0h.01M12 12h.01M8.5 15.5h.01m6.99 0h.01" /></Icon>
);
export const Chat = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 5h16v11h-8l-5 4v-4H4V5Zm4 4h8m-8 3.5h5" /></Icon>
);
export const Bot = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M5 9h14v10H5V9Zm7 0V5m0 0h.01M2.5 13v3m19-3v3M9 13.5h.01m5.99 0h.01M9.5 16.5h5" /></Icon>
);
export const Palette = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 3a9 9 0 1 0 0 18c1.7 0 2-1.3 1.3-2.3-.8-1.200 0-2.7 1.5-2.7H17a4 4 0 0 0 4-4c0-5-4-9-9-9ZM7.5 12h.01M9.5 8h.01m4.990-.5h.01" /></Icon>
);
