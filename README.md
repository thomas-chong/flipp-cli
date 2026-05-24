# flipp-cli

[![skills.sh](https://skills.sh/b/thomas-chong/flipp-cli)](https://skills.sh/thomas-chong/flipp-cli)

AI-agent-friendly CLI for the [Flipp](https://flipp.com) flyer & deals API.

Search weekly grocery and retail deals across North America from any shell or
agent runtime. JSON-first on pipes, pretty tables on TTY.

> Built by reverse-engineering Flipp's public web API. No login, no key,
> just a postal/ZIP code.

## Install

```bash
npm install -g flipp-cli
# or, for ephemeral use:
npx flipp-cli search milk
```

### Install the AI-agent skill

If you use Claude Code, Cursor, Windsurf, or any agent that supports
[skills.sh](https://www.skills.sh), pull the `flipp-cli` skill straight from
this repo:

```bash
npx skills add thomas-chong/flipp-cli
```

This drops `skills/flipp-cli/SKILL.md` into your agent's skill directory so the
agent automatically knows when to reach for `flipp` and how to use it
(recipe planning, bulk searches, coupon stacking, etc.).

## Quick start

```bash
# 1. detect & remember your postal code (writes ~/.config/flipp-cli/config.json)
flipp locate --save

# 2. find cheapest milk near you
flipp search milk --sort price-asc --limit 5

# 3. browse all flyers from Walmart this week
flipp flyers --merchant walmart --json

# 4. rank top-discounted grocery deals nearby
flipp deals --min-discount 40 --limit 10

# 5. machine-readable command manifest for AI agents
flipp describe
```

## Commands

| Command | Purpose |
| --- | --- |
| `flipp search <query>` | Search items and ecom listings by keyword. |
| `flipp flyers` | List active flyers in your area. |
| `flipp merchants` | List all retailers tracked by Flipp. |
| `flipp deals` | Aggregate top discounted items across common queries. |
| `flipp locate` | Detect postal/ZIP from IP. |
| `flipp describe` | Emit a JSON manifest of all commands (for agents). |

Run `flipp <command> --help` for full flags and examples.

## Output convention (agent-friendly)

| Stream | What goes there |
| --- | --- |
| `stdout` | **Data only.** Auto-switches to JSON when piped (`process.stdout.isTTY === false`). Pretty table on a real terminal. |
| `stderr` | Human chatter (resolved postal code, scan progress). Never parse for data. |
| Errors | JSON on stderr: `{"error":{"code":"...","message":"...","hint":"..."}}`. |

### Flags every command supports

- `--json` — force JSON, even on a TTY
- `--ndjson` — stream NDJSON (one record per line); ideal for `jq` pipelines
- `--pretty` — force pretty table even when piped
- `--raw` — return the upstream Flipp payload verbatim (no projection)
- `--fields a,b,c` — project a subset of fields (gh-style)
- `--limit N` — cap rows
- `--postal <code>` — override resolved postal code
- `--locale en-ca|en-us|fr-ca` — override locale

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General error |
| 2 | Usage / invalid argument |
| 3 | Not found |
| 4 | Authorization / permission |
| 5 | Conflict |
| 6 | Network, rate-limit, or upstream failure |

## Postal-code resolution order

1. `--postal <code>` flag
2. `FLIPP_POSTAL_CODE` env var
3. `~/.config/flipp-cli/config.json` (written by `flipp locate --save`)
4. Auto-detect from IP via Flipp's `location_info/by_ip`

## Use from an AI agent

Most agent runtimes can shell out. Feed your model a system prompt like:

```
You may call `flipp` from the shell. Useful invocations:
- flipp search "<query>" --json --fields name,price,merchant,valid_to --limit 10
- flipp flyers --json --fields merchant,valid_to --limit 50
- flipp deals --min-discount 30 --json
Always pass --json and check $? for non-zero. Errors come back as JSON on stderr.
Use `flipp describe` for the full command manifest.
```

For MCP-style integration, `flipp describe` returns a stable JSON manifest of
commands, flags, env vars, and exit codes.

## API surface

The CLI talks to `https://backflipp.wishabi.com/flipp/` (no auth). All
endpoints accept `locale` and `postal_code` query params.

| Endpoint | Wrapped by |
| --- | --- |
| `GET /items/search?q=...&sort_type=...` | `flipp search` |
| `GET /flyers` | `flipp flyers` |
| `GET /merchants` | `flipp merchants` |
| `https://flyers-ng.flippback.com/api/flipp/location_info/by_ip` | `flipp locate` |

## FAQ

### Can it actually do apples-to-apples price comparison?

Mostly, yes — but with a documented two-pass workflow. Raw `price` lies
("$5.99 for 4 L of milk" beats "$2.49 for 1 L"). Pass `--unit-price` and
each row gets a normalized `$/kg` or `$/L`:

```bash
flipp search milk --unit-price --sort unit-price-asc --json
```

The parser reads the size from the item *name* (`4L`, `675g`, `12 x 355mL`)
and converts to kg or L. Coverage varies by category:

| Category | Approx. coverage |
| --- | --- |
| Packaged dry goods (rice, pasta, cereal) | 70–85% |
| Beverages, juice, sparkling water | 60–80% |
| Dairy in cartons (the size is often only printed on the carton, not the listing) | 20–40% |
| Fresh produce sold per-lb at the till | ~0% (sized at checkout) |

For items where `unit_price` is `null`, pass `--with-images` and the agent
can fetch `image_url` (the actual flyer clipping) and run a multimodal
vision pass to extract the size. The CLI deliberately does **not** call any
vision model itself — that's the agent's job, keeps `flipp-cli`
dependency-free.

### What about bundle / "buy this or that" listings?

Flyer entries like *"MILK 4L OR CHEESE SLICES 22's $6.19"* are real and
common. The CLI flags them in the `unit_price.warning` field:

```json
{ "value": 1.55, "unit": "L", "warning": "compound_item" }
```

Agents should treat any row with `warning: "compound_item"` as suspect —
the $1.55/L number is computed against the 4 L token but you may actually
be paying $6.19 for cheese instead. Vision-fall-back on the image is the
right move here.

### Why does `flipp deals` take longer than `flipp search`?

`deals` parallel-fans-out 4–20 keyword searches (one per item in the
category pack) and aggregates client-side. Wall-clock is one round-trip but
upstream load is N requests. If you already have a specific list of items
to look for, prefer `flipp search a b c d --merchant X` — same parallelism,
narrower set.

### What if a query returns weird matches ("milk" → "milk thistle tea")?

The upstream relevancy ranker leans on keyword recall, not semantic match.
Two mitigations:

1. Use phrase queries: `flipp search "whole milk"` rather than `flipp search milk`
2. Filter client-side after fetch: `--merchant`, `--max-price`,
   `--min-discount`, or `jq` the JSON

The CLI surfaces upstream results verbatim so the agent can apply its own
judgment.

### Why doesn't it track historical prices?

Out of scope for a stateless CLI. Each invocation is a fresh upstream call.
`item_id` is stable while a flyer is active, so an agent that runs the CLI
on a schedule can diff `item_id + current_price` across runs to build its
own price history.

### Is `flipp-cli` affiliated with Flipp Operations Inc.?

**No.** This is an independent third-party wrapper around the same
unauthenticated HTTP endpoints that flipp.com's own web client uses. It
was built by reverse-engineering observable network traffic; there is no
private API key, no partnership, and no endorsement.

### Will it break if Flipp changes their API?

Almost certainly yes, eventually. We consume endpoints that are public but
**not officially documented or supported**. If Flipp restructures their
backend, renames fields, adds auth, or throttles aggressively, parts of
this CLI may stop working without warning. Issues are welcome — fixes will
ship as fast as possible.

### Is it rate-limited?

The CLI itself does not throttle. Flipp's backend may; you'll see HTTP 429
surface as `{"error":{"code":"upstream_error", "exitCode": 6, ...}}`. Be a
good citizen:

- Don't loop the CLI in a tight `while true` shell
- For monitoring use cases, run no more often than every few minutes
- If you're building anything commercial-scale, reach out to Flipp's
  business team for a sanctioned data feed

### Can I use this commercially?

The code is MIT-licensed. **Use of Flipp's API**, on the other hand, is
governed by [Flipp's Terms of Use](https://corp.flipp.com/legal/terms_of_use/),
which you should read carefully before any commercial deployment. The
endpoints are public web resources, but that does not grant a redistribution
or resale license to the underlying data.

## Limitations (current)

- **No write operations.** Cannot create lists, favorites, carts, or
  submit coupons. Read-only by design.
- **No unit price for items without size in the name.** ~15–60% of items
  per category, depending. Workaround: `--with-images` + vision fallback.
- **No structured size extraction for produce sold per-lb at register.**
  The flyer entry just says "Strawberries $2.99" with no weight. Real
  per-lb price requires reading the small print on the image.
- **Coupons endpoint returns a thin slice.** Only `regular`, `loyalty`,
  and `flyer-item` coupons that Flipp surfaces publicly; merchant-private
  coupons (e.g. logged-in PC Optimum offers) are not included.
- **Locale support is en-CA, en-US, fr-CA.** Other locales will likely
  return empty data; the upstream isn't built for them.
- **No image normalization.** `clipping_image_url` is a CloudFront-signed
  URL with a TTL; agents should fetch promptly and not bookmark.

## Caveats — read before you ship

> **This is a third-party wrapper on public web endpoints, not a sanctioned
> Flipp API client.**

- Endpoints can change without notice. Pin a CLI version and watch for
  upstream drift.
- Flipp may rate-limit, geofence, or block IP ranges that abuse the
  endpoints. Don't be the reason that happens — debounce, cache, batch.
- Respect [Flipp's Terms of Use](https://corp.flipp.com/legal/terms_of_use/)
  and any regional consumer-protection rules around price advertising.
- This project ships **no warranties** about price accuracy, freshness, or
  data correctness. Always sanity-check important numbers against the live
  flyer before relying on them.
- The maintainers are not affiliated with, sponsored by, or endorsed by
  Flipp Operations Inc., Wishabi, or any retailer represented in the API
  responses.

## Development

```bash
npm install
npm run dev -- search milk        # run TS directly
npm run build && node bin/flipp.js search milk
```

## Design references

- [Algolia: We rewrote the Algolia CLI for AI agents](https://www.algolia.com/blog/engineering/we-rewrote-the-algolia-cli-for-ai-agents)
- [Heroku — 12 Factor CLI Apps](https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46)
- [Writing CLI Tools That AI Agents Actually Want to Use](https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no)
- [GitHub CLI `--json` field-selection](https://cli.github.com/manual/)

## License

MIT. This project is not affiliated with Flipp Operations Inc.; it consumes
publicly accessible endpoints used by flipp.com's own web client. Respect
their terms of service.
