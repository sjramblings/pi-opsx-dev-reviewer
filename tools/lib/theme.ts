// Shared theme inliner. Both HTML templates carry a single `__THEME__` placeholder inside
// their <style> block; each tool replaces it with the tokens from theme.css at build time,
// so the two outputs share one palette and read as one system. Fail loud if the placeholder
// is missing, matching the __MODEL__ injection contract.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_MARK = "__THEME__";

/** The shared theme tokens as a CSS string (the :root and light/dark palettes). */
export function themeCss(): string {
  return readFileSync(join(HERE, "theme.css"), "utf8").trimEnd();
}

/** Replace the single `__THEME__` placeholder in a template with the shared tokens. */
export function inlineTheme(template: string): string {
  if (!template.includes(THEME_MARK)) {
    throw new Error("template is missing the __THEME__ injection point");
  }
  const css = themeCss();
  return template.replace(THEME_MARK, () => css);
}
