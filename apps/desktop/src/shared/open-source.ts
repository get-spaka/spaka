// What Upstart is made with, shown on its About page (Q339): the main
// components and their licences, each read from its package by
// open-source.test.ts, and the collections the gallery's layouts come from,
// whose licences are kept beside the gallery.
export type Component = {
  name: string;
  licence: string;
  /** The package whose licence this is; none for the gallery's collections. */
  package?: string;
};

export const COMPONENTS: readonly Component[] = [
  { name: "Electron", licence: "MIT", package: "electron" },
  { name: "React", licence: "MIT", package: "react" },
  { name: "Radix UI", licence: "MIT", package: "radix-ui" },
  { name: "Lucide", licence: "ISC", package: "lucide-react" },
  { name: "Tailwind CSS", licence: "MIT", package: "tailwindcss" },
  { name: "daisyUI", licence: "MIT", package: "daisyui" },
  { name: "LiquidJS", licence: "MIT", package: "liquidjs" },
  { name: "htmx", licence: "0BSD", package: "htmx.org" },
  { name: "idiomorph", licence: "0BSD", package: "idiomorph" },
  { name: "Pi", licence: "MIT", package: "@earendil-works/pi-agent-core" },
  { name: "sharp", licence: "Apache-2.0", package: "sharp" },
  { name: "Zod", licence: "MIT", package: "zod" },
  { name: "HyperUI", licence: "MIT" },
  { name: "Meraki UI", licence: "MIT" },
  { name: "Mamba UI", licence: "MIT" },
  { name: "Wicked Blocks", licence: "MIT" },
];

/** Upstart's website. */
export const UPSTART_SITE = "https://upstart.gg";
