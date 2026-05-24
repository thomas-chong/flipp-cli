import { Command } from "commander";
import { searchItems } from "../client.js";
import { resolveConfig } from "../config.js";
import { emit, emitInfo, sanitizeQuery, type OutputOptions } from "../output.js";
import { FlippError, ExitCode } from "../errors.js";
import { parseUnitPrice, type UnitPrice } from "../unit-price.js";
import type { FlippItem } from "../types.js";

interface SearchOpts extends OutputOptions {
  postal?: string;
  locale?: "en-ca" | "en-us" | "fr-ca";
  sort?: "relevancy" | "price-asc" | "price-desc" | "discount-desc" | "unit-price-asc";
  type?: "flyer" | "ecom" | "all";
  merchant?: string;
  maxPrice?: number;
  minDiscount?: number;
  unitPrice?: boolean;
  withImages?: boolean;
}

const UPSTREAM_SORT: Record<string, string | undefined> = {
  relevancy: "relevancy",
  "price-asc": "price_low_to_high",
  "price-desc": "price_high_to_low",
  "discount-desc": undefined,
  "unit-price-asc": undefined,
};

interface ShapedItem {
  query?: string;
  name: string;
  price: number | null;
  was: number | null;
  discount_pct: number | null;
  merchant: string | null;
  type: string;
  sale_story: string | null;
  valid_to: string | null;
  category: string | null;
  flyer_id: number | null;
  item_id: number;
  unit_price?: UnitPrice | null;
  image_url?: string | null;
}

function discountPct(item: FlippItem): number | null {
  if (item.original_price && item.current_price && item.original_price > 0) {
    return Math.round(((item.original_price - item.current_price) / item.original_price) * 100);
  }
  return null;
}

function summarizeItem(
  item: FlippItem,
  query: string | undefined,
  opts: { unitPrice?: boolean; withImages?: boolean },
): ShapedItem {
  const out: ShapedItem = {
    ...(query ? { query } : {}),
    name: item.name,
    price: item.current_price,
    was: item.original_price,
    discount_pct: discountPct(item),
    merchant: item.merchant_name ?? item.merchant ?? null,
    type: item.item_type ?? "flyer",
    sale_story: item.sale_story ?? null,
    valid_to: item.valid_to ?? null,
    category: item._L2 ?? item._L1 ?? null,
    flyer_id: item.flyer_id ?? null,
    item_id: item.id,
  };
  if (opts.unitPrice) {
    out.unit_price = parseUnitPrice(item.name, item.current_price);
  }
  if (opts.withImages || opts.unitPrice) {
    // include image so the agent can do a vision pass when unit_price is null
    out.image_url =
      item.clipping_image_url ?? item.clean_image_url ?? item.image_url ?? null;
  }
  return out;
}

export function registerSearch(program: Command): void {
  program
    .command("search [queries...]")
    .description(
      "Search flyer items and ecom listings by keyword. Pass multiple queries for parallel bulk search.",
    )
    .option("--postal <code>", "Postal/ZIP code (e.g. M5V3B9 or 10001).")
    .option("--locale <locale>", "Locale: en-ca, en-us, fr-ca.", "en-ca")
    .option(
      "--sort <mode>",
      "Sort: relevancy, price-asc, price-desc, discount-desc, unit-price-asc.",
      "relevancy",
    )
    .option(
      "--unit-price",
      "Compute a heuristic $/kg or $/L from item name; null when unparseable (use --with-images and vision-fallback for those).",
    )
    .option(
      "--with-images",
      "Include image_url in output so the agent can vision-process items the unit-price parser missed.",
    )
    .option("--type <type>", "Filter: flyer, ecom, all (default: all).", "all")
    .option("--merchant <name>", "Filter by merchant name (substring, case-insensitive).")
    .option("--max-price <n>", "Drop items priced above this amount.", (v) => parseFloat(v))
    .option("--min-discount <pct>", "Drop items with discount below this percent.", (v) => parseInt(v, 10))
    .option("--limit <n>", "Max rows to return (applied per query in bulk mode).", (v) => parseInt(v, 10))
    .option("--fields <list>", "Comma-separated field projection.")
    .option("--json", "Force JSON output to stdout.")
    .option("--ndjson", "Stream NDJSON (one record per line).")
    .option("--pretty", "Force pretty table output.")
    .option("--raw", "Return the upstream Flipp API response verbatim (single-query only).")
    .addHelpText(
      "after",
      `
Single-query examples:
  $ flipp search milk --postal M5V3B9 --sort price-asc --limit 5
  $ flipp search "ground beef" --json --fields name,price,merchant,valid_to
  $ flipp search bread --ndjson | jq 'select(.discount_pct >= 30)'

Bulk-query examples (the recipe-planning pattern):
  $ flipp search chicken rice broccoli garlic --merchant loblaws --max-price 8 --json
  $ flipp search milk eggs bread --sort discount-desc --limit 3 --ndjson
  $ flipp search "chicken thighs" "ground beef" pork --min-discount 20 --json

Filters apply client-side after fetch:
  --merchant substring match on merchant name
  --max-price drops items above the cap
  --min-discount drops items below the discount floor
  --sort discount-desc re-ranks by computed discount percent
`,
    )
    .action(async (rawQueries: string[], opts: SearchOpts) => {
      if (!rawQueries || rawQueries.length === 0) {
        throw new FlippError({
          code: "missing_query",
          message: "At least one search query is required.",
          exitCode: ExitCode.Usage,
          hint: "Example: flipp search milk eggs bread",
        });
      }
      const queries = rawQueries.map(sanitizeQuery).filter((q) => q.length > 0);
      const cfg = await resolveConfig({ postal: opts.postal, locale: opts.locale });

      const sortMode = opts.sort ?? "relevancy";
      if (!(sortMode in UPSTREAM_SORT)) {
        throw new FlippError({
          code: "invalid_sort",
          message: `Unknown --sort value: ${sortMode}`,
          exitCode: ExitCode.Usage,
          hint: "Valid: relevancy, price-asc, price-desc, discount-desc.",
        });
      }
      const upstreamSort = UPSTREAM_SORT[sortMode];

      emitInfo(
        `Searching ${queries.length === 1 ? `"${queries[0]}"` : `${queries.length} queries`} ` +
          `near ${cfg.postal_code} (${cfg.source}, ${cfg.locale})`,
      );

      const responses = await Promise.all(
        queries.map((q) =>
          searchItems({
            postal_code: cfg.postal_code,
            locale: cfg.locale,
            q,
            sort_type: upstreamSort,
          }).then((res) => ({ q, res })),
        ),
      );

      if (opts.raw) {
        if (queries.length > 1) {
          throw new FlippError({
            code: "invalid_combo",
            message: "--raw is only supported with a single query.",
            exitCode: ExitCode.Usage,
            hint: "Omit --raw or pass exactly one query.",
          });
        }
        process.stdout.write(JSON.stringify(responses[0]!.res) + "\n");
        return;
      }

      const type = opts.type ?? "all";
      const merchantNeedle = opts.merchant?.toLowerCase();

      const tagged: ShapedItem[] = [];
      for (const { q, res } of responses) {
        let items: FlippItem[] = [];
        if (type === "flyer" || type === "all") items = items.concat(res.items ?? []);
        if (type === "ecom" || type === "all") items = items.concat(res.ecom_items ?? []);

        if (merchantNeedle) {
          items = items.filter((i) =>
            (i.merchant_name ?? i.merchant ?? "").toLowerCase().includes(merchantNeedle),
          );
        }
        if (opts.maxPrice !== undefined) {
          items = items.filter((i) => i.current_price !== null && i.current_price <= opts.maxPrice!);
        }
        if (opts.minDiscount !== undefined) {
          items = items.filter((i) => (discountPct(i) ?? -1) >= opts.minDiscount!);
        }
        if (opts.limit !== undefined && opts.limit > 0) {
          items = items.slice(0, opts.limit);
        }
        const wantUnitPrice = opts.unitPrice || sortMode === "unit-price-asc";
        for (const i of items)
          tagged.push(
            summarizeItem(i, queries.length > 1 ? q : undefined, {
              unitPrice: wantUnitPrice,
              withImages: opts.withImages,
            }),
          );
      }

      if (sortMode === "discount-desc") {
        tagged.sort((a, b) => (b.discount_pct ?? -1) - (a.discount_pct ?? -1));
      } else if (sortMode === "unit-price-asc") {
        tagged.sort(
          (a, b) => (a.unit_price?.value ?? Infinity) - (b.unit_price?.value ?? Infinity),
        );
      }

      emit(tagged, { ...opts, limit: undefined, tableShape: (r) => r });
    });
}
