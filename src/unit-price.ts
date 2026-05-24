export type CompoundWarning = "compound_item" | "ambiguous_sizes";

export interface UnitPrice {
  value: number;
  unit: "kg" | "L" | "unit";
  parsed_size: number;
  parsed_size_unit: string;
  basis: "name-regex";
  warning?: CompoundWarning;
}

interface SizePattern {
  re: RegExp;
  to: "kg" | "L" | "unit";
  factor: number;
  unit_label: string;
}

const PATTERNS: SizePattern[] = [
  { re: /(\d+(?:\.\d+)?)\s*kg\b/i, to: "kg", factor: 1, unit_label: "kg" },
  { re: /(\d+(?:\.\d+)?)\s*g\b/i, to: "kg", factor: 1 / 1000, unit_label: "g" },
  { re: /(\d+(?:\.\d+)?)\s*lb\b/i, to: "kg", factor: 0.453592, unit_label: "lb" },
  { re: /(\d+(?:\.\d+)?)\s*oz\b/i, to: "kg", factor: 0.0283495, unit_label: "oz" },
  { re: /(\d+(?:\.\d+)?)\s*l\b/i, to: "L", factor: 1, unit_label: "L" },
  { re: /(\d+(?:\.\d+)?)\s*ml\b/i, to: "L", factor: 1 / 1000, unit_label: "mL" },
  { re: /(\d+)\s*(?:pack|pk|count|ct)\b/i, to: "unit", factor: 1, unit_label: "pack" },
];

const MULTIPACK_RE = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|l|ml)\b/i;

/**
 * Catches every size mention in a name regardless of unit, so we can tell
 * compound listings ("Milk 4L OR Cheese 22's") apart from single items that
 * happen to repeat a size ("Beef Burgers 4 oz., 4.54 kg, 40's").
 */
const ALL_SIZES_RE = /(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|l|ml)\b/gi;

const SEPARATOR_RE = /\b(or|OR|and|AND)\b|\s[\&\+]\s|\bBUNDLE\b/;

/**
 * Detect compound listings — flyer entries that bundle two or more distinct
 * products at one price ("Milk 4L OR Cheese Slices 22's $6.19"). The first
 * size match would normalize against the wrong product, so flag the row.
 *
 * Heuristic: 2+ size tokens AND a separator word between products. Falls
 * back to no-warning for the "Beef Burgers 4 oz., 4.54 kg, 40's" style of
 * single-item listing that just enumerates its dimensions.
 */
function detectCompound(name: string): CompoundWarning | undefined {
  if (/\bBUNDLE\b/i.test(name)) return "compound_item";
  const sizeMatches = name.match(ALL_SIZES_RE) ?? [];
  if (sizeMatches.length < 2) return undefined;
  if (!SEPARATOR_RE.test(name)) return undefined;

  // Single-item listings sometimes say "Skim, 1% or 2%" with one size at the
  // end. Require the separator to sit between two of the size tokens, not
  // before all of them, to avoid false positives on flavor lists.
  const firstSizeIdx = name.search(ALL_SIZES_RE);
  const lastSizeIdx = name.search(/(\d+(?:\.\d+)?)\s*(?:kg|g|lb|oz|l|ml)\b(?![\s\S]*\d+\s*(?:kg|g|lb|oz|l|ml)\b)/i);
  const separatorIdx = name.search(SEPARATOR_RE);
  if (separatorIdx > firstSizeIdx && separatorIdx < lastSizeIdx) {
    return "compound_item";
  }
  return "ambiguous_sizes";
}

/**
 * Heuristic unit-price parser. Reads a flyer item name and tries to extract
 * a normalized $/kg or $/L based on size tokens like "4L", "675g", "5 lb",
 * "12 x 355mL". Returns null when no size pattern matches — at that point
 * the agent should fall back to a vision pass on the item's image URL.
 *
 * When the name appears to bundle multiple products at one price (OR / & /
 * BUNDLE / etc.), the result carries a `warning: "compound_item"` flag so
 * the agent knows the unit price is suspect and should be re-derived from
 * the flyer image.
 */
export function parseUnitPrice(name: string, price: number | null): UnitPrice | null {
  if (price === null || price <= 0 || !name) return null;

  const warning = detectCompound(name);

  const multi = name.match(MULTIPACK_RE);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    const u = multi[3]!.toLowerCase();
    const pat = PATTERNS.find((p) => p.unit_label.toLowerCase() === u);
    if (pat && count > 0 && each > 0) {
      const totalNormalized = count * each * pat.factor;
      if (totalNormalized > 0) {
        return withWarning(
          {
            value: round2(price / totalNormalized),
            unit: pat.to,
            parsed_size: count * each,
            parsed_size_unit: pat.unit_label,
            basis: "name-regex",
          },
          warning,
        );
      }
    }
  }

  for (const p of PATTERNS) {
    const m = name.match(p.re);
    if (!m) continue;
    const qty = Number(m[1]);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const normalized = qty * p.factor;
    if (normalized <= 0) continue;
    return withWarning(
      {
        value: round2(price / normalized),
        unit: p.to,
        parsed_size: qty,
        parsed_size_unit: p.unit_label,
        basis: "name-regex",
      },
      warning,
    );
  }

  return null;
}

function withWarning(up: UnitPrice, warning: CompoundWarning | undefined): UnitPrice {
  return warning ? { ...up, warning } : up;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
