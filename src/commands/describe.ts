import { Command } from "commander";

interface DescribeOpts {
  format?: "json";
}

interface CommandManifest {
  name: string;
  summary: string;
  flags: Array<{ name: string; type: string; description: string; default?: unknown }>;
  examples: string[];
}

const MANIFEST: CommandManifest[] = [
  {
    name: "search",
    summary:
      "Search Flipp items and ecom listings by one or more keywords (bulk parallel when N > 1).",
    flags: [
      { name: "[queries...]", type: "string-list", description: "One or more positional queries." },
      { name: "--postal", type: "string", description: "Postal/ZIP code." },
      { name: "--locale", type: "enum", description: "en-ca | en-us | fr-ca", default: "en-ca" },
      {
        name: "--sort",
        type: "enum",
        description: "relevancy | price-asc | price-desc | discount-desc (last is client-side)",
      },
      { name: "--type", type: "enum", description: "flyer | ecom | all", default: "all" },
      { name: "--merchant", type: "string", description: "Filter merchant name (substring)." },
      { name: "--max-price", type: "number", description: "Drop items priced above this." },
      { name: "--min-discount", type: "number", description: "Drop items below this discount %." },
      { name: "--limit", type: "number", description: "Per-query cap on rows." },
      { name: "--fields", type: "csv", description: "Project subset of fields." },
      { name: "--json", type: "boolean", description: "Force JSON to stdout." },
      { name: "--ndjson", type: "boolean", description: "Stream NDJSON (one row per line)." },
      { name: "--raw", type: "boolean", description: "Return upstream payload (single-query only)." },
    ],
    examples: [
      "flipp search milk --postal M5V3B9 --sort price-asc --limit 5",
      'flipp search "ground beef" --json --fields name,price,merchant',
      "flipp search chicken rice broccoli --merchant loblaws --max-price 8 --json",
      "flipp search milk eggs bread --sort discount-desc --ndjson",
    ],
  },
  {
    name: "flyers",
    summary: "List active flyers in a postal area.",
    flags: [
      { name: "--postal", type: "string", description: "Postal/ZIP code." },
      { name: "--locale", type: "enum", description: "en-ca | en-us | fr-ca" },
      { name: "--merchant", type: "string", description: "Filter merchant name (substring)." },
      { name: "--category", type: "string", description: "Filter category (substring)." },
      { name: "--limit", type: "number", description: "Max rows." },
      { name: "--json", type: "boolean", description: "Force JSON." },
    ],
    examples: ["flipp flyers --merchant walmart --json"],
  },
  {
    name: "merchants",
    summary: "List retailers tracked by Flipp.",
    flags: [
      { name: "--postal", type: "string", description: "Postal/ZIP code." },
      { name: "--filter", type: "string", description: "Substring filter on name." },
      { name: "--limit", type: "number", description: "Max rows." },
      { name: "--json", type: "boolean", description: "Force JSON." },
    ],
    examples: ["flipp merchants --filter loblaws --json"],
  },
  {
    name: "deals",
    summary:
      "Find top discounts by scanning curated category packs in parallel. Client-side ranked.",
    flags: [
      { name: "--postal", type: "string", description: "Postal/ZIP code." },
      {
        name: "--category",
        type: "csv",
        description:
          "groceries (default) | household | beauty | baby | pet | electronics | frozen | snacks | beverages | pharmacy | all",
      },
      { name: "--queries", type: "csv", description: "Custom keyword set (overrides --category)." },
      { name: "--merchant", type: "string", description: "Filter to one retailer (substring)." },
      { name: "--min-discount", type: "number", description: "Minimum discount % to include." },
      { name: "--ending-soon", type: "number", description: "Only items valid_to within N days." },
      {
        name: "--include-stories",
        type: "boolean",
        description: "Keep items with sale_story (BOGO, $X off) even if discount % is null.",
      },
      {
        name: "--sort",
        type: "enum",
        description: "discount-desc (default) | price-asc | ending-soon",
      },
      { name: "--limit", type: "number", description: "Max rows.", default: 20 },
      { name: "--json", type: "boolean", description: "Force JSON." },
    ],
    examples: [
      "flipp deals --min-discount 40 --json",
      "flipp deals --category household --merchant walmart --json",
      "flipp deals --ending-soon 3 --include-stories --json",
      "flipp deals --category all --sort price-asc --limit 30 --json",
    ],
  },
  {
    name: "coupons",
    summary: "List active coupons (regular, loyalty-program, flyer-item) in a postal area.",
    flags: [
      { name: "--postal", type: "string", description: "Postal/ZIP code." },
      { name: "--merchant", type: "string", description: "Filter by merchant name." },
      { name: "--category", type: "string", description: "Filter by category." },
      { name: "--type", type: "enum", description: "regular | loyalty | flyer-item | all", default: "all" },
      { name: "--limit", type: "number", description: "Max rows." },
      { name: "--json", type: "boolean", description: "Force JSON." },
    ],
    examples: [
      "flipp coupons --merchant loblaws --json",
      "flipp coupons --type loyalty --postal M5V3B9",
    ],
  },
  {
    name: "locate",
    summary: "Detect postal/ZIP from IP; optionally persist to config.",
    flags: [{ name: "--save", type: "boolean", description: "Persist detected code." }],
    examples: ["flipp locate --save"],
  },
];

const ENV_VARS = [
  {
    name: "FLIPP_POSTAL_CODE",
    description: "Default postal/ZIP code when --postal is omitted.",
  },
];

const EXIT_CODES = [
  { code: 0, meaning: "Success" },
  { code: 1, meaning: "General error" },
  { code: 2, meaning: "Usage / invalid argument" },
  { code: 3, meaning: "Not found" },
  { code: 4, meaning: "Authorization or permission" },
  { code: 5, meaning: "Conflict" },
  { code: 6, meaning: "Network, rate-limit, or upstream failure" },
];

export function registerDescribe(program: Command): void {
  program
    .command("describe")
    .description("Emit a JSON manifest of all commands, flags, and conventions (for AI agents).")
    .option("--format <fmt>", "Output format (json).", "json")
    .action((_opts: DescribeOpts) => {
      const manifest = {
        name: "flipp-cli",
        version: "0.1.0",
        description: "AI-agent-friendly CLI for the Flipp flyer & deals API.",
        output_convention: {
          stdout: "JSON when piped or --json; pretty table on TTY.",
          stderr: "Human chatter only; never parse for data.",
          ndjson_streams: "Use --ndjson for record-per-line streaming.",
          error_shape: { error: { code: "string", message: "string", hint: "string?" } },
        },
        commands: MANIFEST,
        env: ENV_VARS,
        exit_codes: EXIT_CODES,
        upstream_api: {
          base: "https://backflipp.wishabi.com/flipp",
          auth: "none (public; postal_code required)",
          endpoints: [
            "GET /items/search?locale&postal_code&q&sort_type",
            "GET /flyers?locale&postal_code",
            "GET /merchants?locale&postal_code",
            "GET /data?locale&postal_code  (coupons bundle)",
          ],
        },
        recommended_workflows: {
          recipe_planning:
            "flipp search <ingredient1> <ingredient2> ... --merchant <store> --max-price N --json",
          shopping_optimization:
            "flipp search <items...> --json | jq 'group_by(.merchant)' to pick the cheapest store.",
          coupon_stacking:
            "Pair `flipp coupons --merchant X --json` with `flipp search <items> --merchant X --json`.",
          price_watch:
            "flipp search '<item>' --sort price-asc --limit 1 --json; diff item_id+price across runs.",
        },
      };
      process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
    });
}
