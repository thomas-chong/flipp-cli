import { Command } from "commander";
import { listMerchants } from "../client.js";
import { resolveConfig } from "../config.js";
import { emit, emitInfo, type OutputOptions } from "../output.js";

interface MerchantsOpts extends OutputOptions {
  postal?: string;
  locale?: "en-ca" | "en-us" | "fr-ca";
  filter?: string;
}

export function registerMerchants(program: Command): void {
  program
    .command("merchants")
    .description("List retailers/merchants tracked by Flipp.")
    .option("--postal <code>", "Postal/ZIP code.")
    .option("--locale <locale>", "Locale.", "en-ca")
    .option("--filter <name>", "Substring filter on merchant name (case-insensitive).")
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
  $ flipp merchants --filter walmart
  $ flipp merchants --limit 20 --json
`,
    )
    .action(async (opts: MerchantsOpts) => {
      const cfg = await resolveConfig({ postal: opts.postal, locale: opts.locale });
      emitInfo(`Listing merchants near ${cfg.postal_code} (${cfg.source}, ${cfg.locale})`);

      const res = await listMerchants({ postal_code: cfg.postal_code, locale: cfg.locale });
      if (opts.raw) {
        process.stdout.write(JSON.stringify(res) + "\n");
        return;
      }

      let merchants = res.merchants ?? [];
      if (opts.filter) {
        const needle = opts.filter.toLowerCase();
        merchants = merchants.filter((m) => m.name.toLowerCase().includes(needle));
      }
      emit(merchants, { ...opts, tableShape: (r) => r });
    });
}
