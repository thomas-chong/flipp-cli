import { Command } from "commander";
import { searchItems } from "../client.js";
import { resolveConfig } from "../config.js";
import { emit, emitInfo, type OutputOptions } from "../output.js";
import { FlippError, ExitCode } from "../errors.js";
import type { FlippItem } from "../types.js";

interface DealsOpts extends OutputOptions {
  postal?: string;
  locale?: "en-ca" | "en-us" | "fr-ca";
  minDiscount?: number;
  queries?: string;
  category?: string;
  merchant?: string;
  endingSoon?: number;
  sort?: "discount-desc" | "price-asc" | "ending-soon";
  includeStories?: boolean;
}

const CATEGORY_PACKS: Record<string, string[]> = {
  groceries: [
    "milk", "eggs", "bread", "butter", "cheese", "yogurt",
    "chicken", "beef", "pork", "fish",
    "rice", "pasta", "cereal", "coffee", "tea",
    "apples", "bananas", "berries", "potatoes", "onion",
  ],
  household: [
    "laundry detergent", "paper towel", "toilet paper", "dish soap",
    "garbage bag", "cleaner", "batteries", "light bulb",
  ],
  beauty: [
    "shampoo", "conditioner", "body wash", "toothpaste",
    "deodorant", "lotion", "sunscreen", "razor",
  ],
  baby: ["diapers", "formula", "baby wipes", "baby food"],
  pet: ["dog food", "cat food", "cat litter", "dog treats"],
  electronics: ["laptop", "tv", "headphones", "tablet", "smart speaker"],
  frozen: ["frozen pizza", "ice cream", "frozen vegetables", "frozen meals"],
  snacks: ["chips", "chocolate", "cookies", "granola bar", "crackers"],
  beverages: ["juice", "soda", "water", "sparkling water", "beer", "wine"],
  pharmacy: ["vitamins", "pain relief", "cold medicine", "allergy"],
};

function discountPct(item: FlippItem): number | null {
  if (item.original_price && item.current_price && item.original_price > 0) {
    return Math.round(((item.original_price - item.current_price) / item.original_price) * 100);
  }
  return null;
}

function daysUntil(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

interface DealRow {
  name: string;
  price: number | null;
  was: number | null;
  discount_pct: number | null;
  sale_story: string | null;
  merchant: string | null;
  category: string;
  query: string;
  valid_to: string | null;
  days_left: number | null;
  item_id: number;
  flyer_id: number | null;
}

export function registerDeals(program: Command): void {
  program
    .command("deals")
    .description(
      "Find top discounted items by scanning curated category packs in parallel. " +
        "Client-side ranked. Use --category to broaden beyond groceries.",
    )
    .option("--postal <code>", "Postal/ZIP code.")
    .option("--locale <locale>", "Locale.", "en-ca")
    .option(
      "--category <names>",
      `Comma-separated category packs to scan. Default: groceries. ` +
        `Available: ${Object.keys(CATEGORY_PACKS).join(", ")}, all.`,
      "groceries",
    )
    .option(
      "--queries <list>",
      "Custom comma-separated keyword set (overrides --category).",
    )
    .option("--merchant <name>", "Filter to one retailer (substring match).")
    .option("--min-discount <pct>", "Minimum computed discount % to include.", (v) => parseInt(v, 10))
    .option("--ending-soon <days>", "Only items whose valid_to is within N days.", (v) => parseInt(v, 10))
    .option(
      "--include-stories",
      "Also include items with no computed discount but a non-empty sale_story (BOGO, $X OFF, etc.).",
    )
    .option(
      "--sort <mode>",
      "Sort: discount-desc (default), price-asc, ending-soon.",
      "discount-desc",
    )
    .option("--limit <n>", "Max rows.", (v) => parseInt(v, 10), 20)
    .option("--fields <list>", "Comma-separated field projection.")
    .option("--json", "Force JSON output.")
    .option("--ndjson", "Stream NDJSON.")
    .option("--pretty", "Force pretty table.")
    .addHelpText(
      "after",
      `
Category packs (run with --category <name>):
  groceries (default) | household | beauty | baby | pet
  electronics | frozen | snacks | beverages | pharmacy | all

Examples:
  $ flipp deals --postal M5V3B9 --min-discount 30 --limit 10
  $ flipp deals --category household --min-discount 25 --json
  $ flipp deals --category "groceries,baby" --merchant walmart --json
  $ flipp deals --merchant costco --sort price-asc --limit 15 --json
  $ flipp deals --ending-soon 3 --include-stories --json  # urgency-prioritized
  $ flipp deals --queries "tiramisu,gelato,prosciutto" --json  # custom hunt

Notes:
  The Flipp API has no "top deals" endpoint, so this command fans out N parallel
  /items/search calls and ranks results client-side. Each category pack runs
  ~5-20 searches in parallel — wall time is one round-trip regardless of N.
`,
    )
    .action(async (opts: DealsOpts) => {
      const cfg = await resolveConfig({ postal: opts.postal, locale: opts.locale });

      const querySet: Array<{ q: string; category: string }> = [];
      if (opts.queries) {
        for (const q of opts.queries.split(",").map((s) => s.trim()).filter(Boolean)) {
          querySet.push({ q, category: "custom" });
        }
      } else {
        const names = (opts.category ?? "groceries")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const expanded = names.includes("all") ? Object.keys(CATEGORY_PACKS) : names;
        for (const name of expanded) {
          const pack = CATEGORY_PACKS[name];
          if (!pack) {
            throw new FlippError({
              code: "unknown_category",
              message: `Unknown category: ${name}`,
              exitCode: ExitCode.Usage,
              hint: `Valid: ${Object.keys(CATEGORY_PACKS).join(", ")}, all.`,
            });
          }
          for (const q of pack) querySet.push({ q, category: name });
        }
      }

      const sortMode = opts.sort ?? "discount-desc";
      if (!["discount-desc", "price-asc", "ending-soon"].includes(sortMode)) {
        throw new FlippError({
          code: "invalid_sort",
          message: `Unknown --sort value: ${sortMode}`,
          exitCode: ExitCode.Usage,
          hint: "Valid: discount-desc, price-asc, ending-soon.",
        });
      }

      emitInfo(
        `Scanning ${querySet.length} queries near ${cfg.postal_code} (${cfg.source}, ${cfg.locale})…`,
      );

      const responses = await Promise.all(
        querySet.map(({ q }) =>
          searchItems({ postal_code: cfg.postal_code, locale: cfg.locale, q })
            .then((res) => ({ ok: true as const, res }))
            .catch((err) => ({ ok: false as const, err })),
        ),
      );

      const failures = responses.filter((r) => !r.ok).length;
      if (failures > 0) {
        emitInfo(`Warning: ${failures} of ${querySet.length} queries failed (continuing with partial results).`);
      }

      const seen = new Set<string>();
      const merchantNeedle = opts.merchant?.toLowerCase();
      const deals: DealRow[] = [];

      responses.forEach((r, idx) => {
        if (!r.ok) return;
        const { q, category } = querySet[idx]!;
        const items = [...(r.res.items ?? []), ...(r.res.ecom_items ?? [])];
        for (const item of items) {
          const merchant = item.merchant_name ?? item.merchant ?? null;
          if (merchantNeedle && !merchant?.toLowerCase().includes(merchantNeedle)) continue;

          const dp = discountPct(item);
          const hasStory = !!item.sale_story && item.sale_story.trim().length > 0;

          if (opts.minDiscount !== undefined) {
            const passDiscount = (dp ?? -1) >= opts.minDiscount;
            const passStory = opts.includeStories && hasStory;
            if (!passDiscount && !passStory) continue;
          } else if (opts.includeStories && !hasStory && dp === null) {
            // include-stories alone (no min-discount): drop only items with neither
            continue;
          }

          const days = daysUntil(item.valid_to);
          if (opts.endingSoon !== undefined && (days === null || days > opts.endingSoon)) continue;

          const dedupKey = `${item.id}|${merchant ?? ""}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          deals.push({
            name: item.name,
            price: item.current_price,
            was: item.original_price,
            discount_pct: dp,
            sale_story: item.sale_story ?? null,
            merchant,
            category,
            query: q,
            valid_to: item.valid_to ?? null,
            days_left: days,
            item_id: item.id,
            flyer_id: item.flyer_id ?? null,
          });
        }
      });

      if (sortMode === "discount-desc") {
        deals.sort((a, b) => (b.discount_pct ?? -1) - (a.discount_pct ?? -1));
      } else if (sortMode === "price-asc") {
        deals.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      } else {
        deals.sort((a, b) => (a.days_left ?? Infinity) - (b.days_left ?? Infinity));
      }

      emit(deals, { ...opts, tableShape: (r) => r });
    });
}
