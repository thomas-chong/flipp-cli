import { Command } from "commander";
import { listFlyers } from "../client.js";
import { resolveConfig } from "../config.js";
import { emit, emitInfo, type OutputOptions } from "../output.js";
import type { FlippFlyer } from "../types.js";

interface FlyersOpts extends OutputOptions {
  postal?: string;
  locale?: "en-ca" | "en-us" | "fr-ca";
  merchant?: string;
  category?: string;
}

function summarizeFlyer(f: FlippFlyer) {
  return {
    id: f.id,
    merchant: f.merchant,
    merchant_id: f.merchant_id,
    name: f.name,
    valid_from: f.valid_from,
    valid_to: f.valid_to,
    categories: f.categories?.join(", ") ?? "",
    premium: f.premium,
    thumbnail: f.thumbnail_url ?? null,
  };
}

export function registerFlyers(program: Command): void {
  program
    .command("flyers")
    .description("List active flyers for a postal/ZIP code.")
    .option("--postal <code>", "Postal/ZIP code.")
    .option("--locale <locale>", "Locale: en-ca, en-us, fr-ca.", "en-ca")
    .option("--merchant <name>", "Filter by merchant name (substring, case-insensitive).")
    .option("--category <name>", "Filter by category (substring, case-insensitive).")
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
  $ flipp flyers --postal M5V3B9 --merchant walmart
  $ flipp flyers --category groceries --limit 10 --json
`,
    )
    .action(async (opts: FlyersOpts) => {
      const cfg = await resolveConfig({ postal: opts.postal, locale: opts.locale });
      emitInfo(`Listing flyers near ${cfg.postal_code} (${cfg.source}, ${cfg.locale})`);

      const res = await listFlyers({ postal_code: cfg.postal_code, locale: cfg.locale });
      if (opts.raw) {
        process.stdout.write(JSON.stringify(res) + "\n");
        return;
      }

      let flyers = res.flyers ?? [];
      if (opts.merchant) {
        const needle = opts.merchant.toLowerCase();
        flyers = flyers.filter((f) => f.merchant?.toLowerCase().includes(needle));
      }
      if (opts.category) {
        const needle = opts.category.toLowerCase();
        flyers = flyers.filter((f) =>
          f.categories?.some((c) => c.toLowerCase().includes(needle)),
        );
      }

      emit(flyers.map(summarizeFlyer), { ...opts, tableShape: (r) => r });
    });
}
