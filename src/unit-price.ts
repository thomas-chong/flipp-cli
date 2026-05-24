export interface UnitPrice {
  value: number;
  unit: "kg" | "L" | "unit";
  parsed_size: number;
  parsed_size_unit: string;
  basis: "name-regex";
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
 * Heuristic unit-price parser. Reads a flyer item name and tries to extract
 * a normalized $/kg or $/L based on size tokens like "4L", "675g", "5 lb",
 * "12 x 355mL". Returns null when no size pattern matches — at that point
 * the agent should fall back to a vision pass on the item's image URL.
 *
 * Conservatively prefers the LARGEST matched size to avoid undercounting
 * multi-pack items (e.g. "12 cans 355mL" -> 12 × 355mL = 4.26L).
 */
export function parseUnitPrice(name: string, price: number | null): UnitPrice | null {
  if (price === null || price <= 0 || !name) return null;

  const multi = name.match(MULTIPACK_RE);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    const u = multi[3]!.toLowerCase();
    const pat = PATTERNS.find((p) => p.unit_label.toLowerCase() === u);
    if (pat && count > 0 && each > 0) {
      const totalNormalized = count * each * pat.factor;
      if (totalNormalized > 0) {
        return {
          value: round2(price / totalNormalized),
          unit: pat.to,
          parsed_size: count * each,
          parsed_size_unit: pat.unit_label,
          basis: "name-regex",
        };
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
    return {
      value: round2(price / normalized),
      unit: p.to,
      parsed_size: qty,
      parsed_size_unit: p.unit_label,
      basis: "name-regex",
    };
  }

  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
