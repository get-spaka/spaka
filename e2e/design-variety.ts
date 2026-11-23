// How much the websites of the design bench differ (Q439): for each, the
// block its home page opens with, its fonts and its colors, then how many
// different ones the briefs got. Read by agent-design.e2e.ts and by
// agent-design-sheet.ts.

/** One website of the bench, as the variety table counts it. */
export type DesignSite = {
  brief: string;
  /** The first block of the home page after its header: a gallery block's id, or "(written)". */
  hero: string;
  /** What the agent asked the gallery for its hero. */
  heroQueries: string[];
  seconds: number;
  headingFont: string;
  bodyFont: string;
  surface: string;
  primary: string;
  dark: boolean;
};

/** A theme.css's fonts and main colors. */
export function themeTraits(
  css: string,
): Pick<DesignSite, "headingFont" | "bodyFont" | "surface" | "primary" | "dark"> {
  const value = (name: string) => new RegExp(`--theme-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? "";
  const family = (stack: string) => stack.split(",")[0]?.replace(/['"]/g, "").trim() ?? "";
  const surface = value("color-surface") || value("color-base-100");
  return {
    headingFont: family(value("font-heading")),
    bodyFont: family(value("font-body")),
    surface,
    primary: value("color-primary"),
    dark: luminance(surface) < 0.35,
  };
}

/** A hex color's relative luminance, from 0 (black) to 1 (white); 1 when it is not a hex color. */
/**
 * Whether a surface is the warm off-white models reach for whatever the
 * business (#FAF7F2 and its neighbours), rather than a surface chosen with the
 * direction: light, barely tinted, toward yellow or orange (Q445).
 */
export function warmOffWhite(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex || luminance(color) < 0.8) return false;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 4 || spread > 24 || r < g || r < b) return false;
  const hue = (60 * (g - b)) / spread;
  return hue >= 15 && hue <= 65;
}

export function luminance(color: string): number {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return 1;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The variety table in Markdown: one row a website, then how many different heroes, fonts and surfaces. */
/** Whether two businesses of one trade, of different characters, open on different heroes (Q444). */
function sameTrade(sites: DesignSite[], pairs: [string, string][]): string[] {
  const hero = (brief: string) => sites.find((s) => s.brief === brief)?.hero;
  const said = pairs
    .filter(([a, b]) => hero(a) && hero(b))
    .map(([a, b]) =>
      hero(a) === hero(b) ? `${a} / ${b} alike (${hero(a)})` : `${a} / ${b} differ (${hero(a)}, ${hero(b)})`,
    );
  return said.length ? [`One trade, two characters: ${said.join("; ")}.`, ""] : [];
}

export function varietyTable(title: string, sites: DesignSite[], pairs: [string, string][] = []): string {
  const distinct = (pick: (s: DesignSite) => string) => new Set(sites.map(pick)).size;
  const rows = sites.map(
    (s) =>
      `| ${s.brief} | ${s.hero} | ${s.headingFont} / ${s.bodyFont} | ${s.surface}${s.dark ? " (dark)" : ""} | ${s.primary} | ${s.seconds} s |`,
  );
  return [
    `### ${title}`,
    "",
    "| Brief | Opening block | Heading / body font | Surface | Primary | Time |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    `${sites.length} websites: ${distinct((s) => s.hero)} different opening blocks, ${distinct((s) => s.headingFont)} heading fonts, ${sites.filter((s) => s.dark).length} dark, ${sites.filter((s) => warmOffWhite(s.surface)).length} on a warm off-white.`,
    "",
    ...sameTrade(sites, pairs),
  ].join("\n");
}
