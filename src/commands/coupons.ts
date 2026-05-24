import { Command } from "commander";
import { getCouponData } from "../client.js";
import { resolveConfig } from "../config.js";
import { emit, emitInfo, type OutputOptions } from "../output.js";
import type { FlippCoupon } from "../types.js";

interface CouponsOpts extends OutputOptions {
  postal?: string;
  locale?: "en-ca" | "en-us" | "fr-ca";
  merchant?: string;
  category?: string;
  loyalty?: boolean;
  type?: "regular" | "loyalty" | "flyer-item" | "all";
}

function summarizeCoupon(c: FlippCoupon) {
  return {
    id: c.coupon_id,
    merchant: c.merchant_name,
    brand: c.brand ?? null,
    sale_story: c.sale_story,
    dollars_off: c.dollars_off,
    percent_off: c.percent_off,
    qualifying_qty: c.qualifying_quantity ?? null,
    valid_from: c.valid_from,
    valid_to: c.valid_to,
    redemption: c.redemption_method ?? null,
    categories: c.categories?.join(", ") ?? "",
  };
}

export function registerCoupons(program: Command): void {
  program
    .command("coupons")
    .description("List active coupons (regular, loyalty, and flyer-item) in a postal area.")
    .option("--postal <code>", "Postal/ZIP code.")
    .option("--locale <locale>", "Locale: en-ca, en-us, fr-ca.", "en-ca")
    .option("--merchant <name>", "Filter by merchant name (substring, case-insensitive).")
    .option("--category <name>", "Filter by category (substring, case-insensitive).")
    .option(
      "--type <kind>",
      "Coupon bucket: regular, loyalty, flyer-item, all (default: all).",
      "all",
    )
    .option("--limit <n>", "Max rows.", (v) => parseInt(v, 10))
    .option("--fields <list>", "Comma-separated field projection.")
    .option("--json", "Force JSON output.")
    .option("--ndjson", "Stream NDJSON.")
    .option("--pretty", "Force pretty table.")
    .option("--raw", "Return upstream response verbatim.")
    .addHelpText(
      "after",
      `
Examples:
  $ flipp coupons --merchant loblaws --json
  $ flipp coupons --type loyalty --postal M5V3B9
  $ flipp coupons --category "Personal Care" --limit 20 --json

Coupon-stacking pattern:
  $ flipp coupons --merchant loblaws --json > coupons.json
  $ flipp search "your shopping list items" --merchant loblaws --json > deals.json
  # Then have the agent cross-reference brand/category to find stackable combos.
`,
    )
    .action(async (opts: CouponsOpts) => {
      const cfg = await resolveConfig({ postal: opts.postal, locale: opts.locale });
      emitInfo(`Listing coupons near ${cfg.postal_code} (${cfg.source}, ${cfg.locale})`);

      const res = await getCouponData({ postal_code: cfg.postal_code, locale: cfg.locale });
      if (opts.raw) {
        process.stdout.write(JSON.stringify(res) + "\n");
        return;
      }

      const type = opts.type ?? "all";
      let coupons: FlippCoupon[] = [];
      if (type === "regular" || type === "all") coupons = coupons.concat(res.coupons ?? []);
      if (type === "loyalty" || type === "all")
        coupons = coupons.concat(res.loyalty_program_coupons ?? []);
      if (type === "flyer-item" || type === "all")
        coupons = coupons.concat(res.flyer_item_coupons ?? []);

      if (opts.merchant) {
        const needle = opts.merchant.toLowerCase();
        coupons = coupons.filter((c) => c.merchant_name?.toLowerCase().includes(needle));
      }
      if (opts.category) {
        const needle = opts.category.toLowerCase();
        coupons = coupons.filter((c) =>
          c.categories?.some((cat) => cat.toLowerCase().includes(needle)),
        );
      }

      emit(coupons.map(summarizeCoupon), { ...opts, tableShape: (r) => r });
    });
}
