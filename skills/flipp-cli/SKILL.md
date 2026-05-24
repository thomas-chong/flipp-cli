---
name: flipp-cli
description: "Find current grocery and retail deals, weekly flyers, store coupons, and merchant lists for any postal/ZIP code in Canada or the US, using the `flipp` CLI. Use this skill whenever the user asks about saving money on groceries, planning meals around what's on sale, building a shopping list across multiple stores, hunting weekly flyer deals, stacking coupons, comparing prices across retailers like Loblaws, Walmart, Costco, No Frills, Sobeys, Shoppers, Metro, Safeway, Kroger, or Target, finding loss-leaders, doing pantry restocking from deals, planning a Costco run, or generating a weekly savings digest — even if they don't say the word \"Flipp.\" Especially useful for AI agents doing recipe planning that needs to be cost-aware. The CLI supports bulk operations — pass many ingredients at once with a single `flipp search` call."
---

# flipp-cli

Wrapper around Flipp's public flyer & deals API. No authentication. Works
across Canada and the US. JSON-first output for AI agent consumption.

## TL;DR — most useful one-liners

```bash
# Recipe-planning: cheapest of many ingredients at one store, in one call
flipp search chicken rice broccoli garlic --merchant loblaws --max-price 8 --json

# Loss-leader hunt: deepest discounts across all nearby stores
flipp deals --min-discount 40 --json --limit 20

# Coupon-stacking prep
flipp coupons --merchant loblaws --json
```

Default postal code is auto-detected from IP and remembered after the first
run. Pass `--postal M5V3B9` (CA) or `--postal 10001` (US) to override.

## Setup check

Before invoking, verify the CLI is available:

```bash
flipp --version || node /Users/thomaschong/Repo/flipp-cli/bin/flipp.js --version
```

If neither works, point the user at `https://github.com/.../flipp-cli` or run
`npm install -g flipp-cli` from the project root.

For agent introspection, `flipp describe` returns a full JSON manifest of
commands, flags, exit codes, and workflow templates — call it first when
you're unsure which command to reach for.

## Output convention (read once)

| Stream | What's there |
| --- | --- |
| `stdout` | **Data only.** Auto-JSON when piped or `--json` is passed. Pretty table on a real TTY. |
| `stderr` | Human-readable chatter ("Searching … near M5V3B9"). Never parse for data. |
| Errors | Single JSON line on stderr: `{"error":{"code":"...","message":"...","hint":"..."}}`. |
| Exit codes | 0 ok · 1 general · 2 usage · 3 not-found · 4 auth · 5 conflict · 6 network/upstream |

**Always pass `--json` or `--ndjson`** from agent code so you get stable
machine-readable output even on a TTY. Check `$?` after every call; treat
any non-zero exit as a hard failure and surface the JSON error to the user.

## Commands at a glance

| Command | What it does |
| --- | --- |
| `flipp search <q1> [q2 ...]` | Search items by one or many keywords (parallel). |
| `flipp flyers` | List active weekly flyers in your postal area. |
| `flipp merchants` | List retailers tracked by Flipp. |
| `flipp coupons` | List regular, loyalty, and flyer-item coupons. |
| `flipp deals` | Aggregate top discounts across common grocery queries. |
| `flipp locate [--save]` | Detect postal/ZIP from IP; optionally persist. |
| `flipp describe` | JSON manifest of every command (for agents). |

## Universal flags

These work on every data-returning command:

| Flag | Purpose |
| --- | --- |
| `--postal <code>` | Override resolved postal/ZIP. |
| `--locale en-ca\|en-us\|fr-ca` | Language and region. |
| `--json` | Force compact JSON. |
| `--ndjson` | Stream one JSON record per line (best for `jq` pipelines). |
| `--pretty` | Force a colored table even when piped. |
| `--raw` | Return the upstream Flipp payload verbatim, no projection. |
| `--fields a,b,c` | Project a subset of fields (saves agent context). |
| `--limit N` | Cap rows. In bulk `search`, applied per query. |

## Command reference (examples first)

### `flipp search` — items & ecom listings

```bash
# Single query
flipp search milk --json --limit 5

# Bulk parallel — recipe planning's superpower
flipp search milk eggs bread butter cheese --json --limit 3

# Scope to one store + price cap
flipp search chicken rice broccoli --merchant loblaws --max-price 8 --json

# Rank by computed discount across all queries
flipp search milk eggs bread --sort discount-desc --ndjson

# Only deals on sale (drops items with no original_price)
flipp search "ground beef" --min-discount 20 --json
```

**Output shape (per item):**
```json
{
  "query": "milk",            // only present in bulk mode
  "name": "Lactantia Milk 4L",
  "price": 5.99, "was": 7.49,
  "discount_pct": 20,
  "merchant": "Loblaws",
  "type": "flyer",            // "flyer" or "ecom"
  "sale_story": "20% OFF",
  "valid_to": "2026-05-28T03:59:59+00:00",
  "category": "Dairy",
  "flyer_id": 7937197,
  "item_id": 1014147505
}
```

**Sort options:** `relevancy` (default), `price-asc`, `price-desc`,
`discount-desc` (client-side). `discount-desc` only ranks items where the
flyer reports both `current_price` and `original_price`.

**Filters apply client-side after fetch.** A loose `--merchant` substring
match is fine — "loblaws" matches "Loblaws" and "Loblaws City Market".

### `flipp flyers` — weekly flyers in your area

```bash
flipp flyers --json                                   # all ~170 flyers
flipp flyers --merchant walmart --json                # one retailer
flipp flyers --category groceries --limit 20 --json   # one category
```

Use this when the user asks "what flyers are out this week" or before
diving into per-item search. Each flyer has `id`, `merchant`, `valid_from`,
`valid_to`, `categories`, `thumbnail`.

### `flipp merchants` — retailers tracked

```bash
flipp merchants --filter superstore --json    # find merchant IDs
```

Useful for resolving fuzzy user inputs ("the big yellow one" → "No Frills")
to canonical merchant names before passing into `--merchant` on other
commands.

### `flipp coupons` — current coupons

```bash
flipp coupons --json --limit 20
flipp coupons --merchant loblaws --json
flipp coupons --type loyalty --postal M5V3B9 --json
flipp coupons --category "Personal Care" --json
```

Bucket types: `regular`, `loyalty` (PC Optimum, Air Miles, etc.),
`flyer-item` (item-attached coupons), `all` (default).

### `flipp deals` — top discounts by curated category packs

```bash
flipp deals --min-discount 40 --json --limit 20                # groceries default
flipp deals --category household --merchant walmart --json     # one retailer
flipp deals --category "groceries,baby" --json                 # multi-pack
flipp deals --category all --sort price-asc --limit 30 --json  # cheapest absolute
flipp deals --ending-soon 3 --include-stories --json           # urgency mode
flipp deals --queries "tiramisu,gelato,prosciutto" --json      # custom hunt
```

Category packs: `groceries` (default) · `household` · `beauty` · `baby` ·
`pet` · `electronics` · `frozen` · `snacks` · `beverages` · `pharmacy` ·
`all`. Each pack expands to 4–20 parallel keyword searches; wall time is
one round-trip regardless of pack size.

Sort modes: `discount-desc` (default), `price-asc` (cheapest absolute),
`ending-soon` (most urgent).

**`--include-stories`** keeps items with a non-empty `sale_story` ("BOGO",
"$3 OFF", "50% OFF") even when `discount_pct` is null because the API
didn't return `original_price`. Without this flag those items are silently
dropped when `--min-discount` is set.

Output adds `category` (the pack), `query` (specific keyword), and
`days_left` for easy filtering. Prefer `flipp search <items>` when you
already have a specific list — it's faster and tighter.

### `flipp locate` — detect & remember postal code

```bash
flipp locate --save --json    # auto-detect from IP and persist
```

Postal resolution order: `--postal` flag → `FLIPP_POSTAL_CODE` env →
`~/.config/flipp-cli/config.json` (written by `locate --save`) → live
IP auto-detect (with implicit save).

### `flipp describe` — machine-readable manifest

```bash
flipp describe | jq '.commands[].name'
flipp describe | jq '.recommended_workflows'
```

Call this **first** when you're unsure which command, flag, or workflow
fits a user request. The manifest is the source of truth and is always
in sync with the installed version.

## Workflow recipes

### 1. Recipe planning from current deals (community use case)

**User:** "Plan three dinners this week using stuff that's on sale at Loblaws,
keep it under $60 total."

```bash
# 1. Find what protein + staples are cheap at Loblaws
flipp search chicken pork beef tofu rice pasta potatoes onion garlic \
  --merchant loblaws --max-price 10 --json > /tmp/deals.json

# 2. (Agent) Read /tmp/deals.json, pick 3 protein + 5 staples that fit
#    the budget, and compose recipes around them.
```

**Why bulk:** one HTTP fan-out of 9 queries vs. 9 sequential round-trips.
**Why `--merchant`:** keeps the agent context focused; saves on output
tokens. **Why `--max-price`:** prevents the model from having to filter
client-side.

### 2. Shopping list optimization across stores

**User:** "Here's my list of 12 items. Where should I shop to spend the least?"

```bash
flipp search "item1" "item2" "item3" ... --json --limit 3 | \
  jq 'group_by(.merchant) | map({merchant: .[0].merchant, total: (map(.price) | add)})'
```

Or two-stop optimization: have the agent pick the cheapest store per item
from the JSON, then aggregate by store and compare a single-stop vs. two-stop
total.

### 3. Coupon stacking

```bash
flipp coupons --merchant loblaws --json > coupons.json
flipp search "<user's list>" --merchant loblaws --json > deals.json
# Agent cross-references coupon.brand / coupon.categories
# against deal.name / deal.category to find stackable combos.
```

### 4. Unit-price comparison (apples-to-apples, with vision fallback)

Raw `price` is misleading: $5.99 for 4 L of milk beats $2.49 for 1 L. Use
`--unit-price` to get a normalized `$/kg` or `$/L`, then sort by it.

```bash
# Cheapest milk per litre — name-regex pass
flipp search milk --unit-price --sort unit-price-asc --json --limit 10
```

Each row gets a `unit_price` object like:
```json
{ "value": 1.50, "unit": "L", "parsed_size": 4, "parsed_size_unit": "L",
  "basis": "name-regex" }
```

**Coverage limitation:** the parser reads sizes from the item *name*
("4L", "675 g", "12 x 355 mL"). For items whose size only appears on the
flyer image (e.g. "Lactantia UltraPur Milk" with no L marker in the name),
`unit_price` will be `null`. Coverage is ~15-30% on dairy and 50-80% on
packaged goods.

**Vision fallback for the rest:** add `--with-images` so every row carries
`image_url` (the actual flyer clipping), then run a vision pass on the
nulls:

```bash
flipp search milk --unit-price --with-images --json > /tmp/milk.json
# Agent: for each item where unit_price is null, fetch image_url and
# ask a multimodal model to extract size; compute price / size manually.
```

This two-pass pattern (fast regex → slow vision only where needed) keeps
99% of items cheap to process while still giving the agent an
apples-to-apples comparison for the long tail.

### 5. Price-watch / drop alerts

```bash
flipp search "chicken thighs" --sort price-asc --limit 1 --json \
  --fields name,price,merchant,item_id,valid_to
```

Store the JSON; on next run diff on `item_id + price`. `item_id` is stable
across runs while the flyer is active.

### 6. Bulk comparison shopping

```bash
flipp search milk eggs bread --sort price-asc --json --limit 5 \
  --fields query,name,price,merchant
```

Returns the cheapest 5 of each across **all** nearby stores. Group by
`query` in the agent to present a head-to-head.

### 7. Loss-leader hunting

```bash
flipp deals --min-discount 50 --limit 10 --json
```

Or scope by category-keyword:

```bash
flipp search beef pork chicken --min-discount 40 --sort discount-desc --json
```

### 8. Dietary / allergen-filtered deals (gluten-free, halal, etc.)

The API doesn't have dietary tags, but brand names are reliable proxies:

```bash
# Gluten-free common brands
flipp search "Glutino" "Bob's Red Mill" "Schar" "Udi's" --json

# Halal-friendly proteins
flipp search "halal chicken" "halal beef" "Marvid" "Mina" --json
```

### 9. Pantry-aware restocking

**Agent has the user's pantry list with low-stock items.** Pipe them in:

```bash
flipp search "$(echo "$LOW_STOCK_ITEMS" | tr '\n' ' ')" --min-discount 15 --json
```

### 10. Trip planning to another city

```bash
# What's on sale in Vancouver next week?
flipp search "salmon" "fresh berries" --postal V6B1A1 --json
flipp flyers --postal V6B1A1 --merchant safeway --json
```

`--postal` is a one-shot override; it does not change the saved default.

### 11. Weekly digest generation

```bash
flipp flyers --json --fields merchant,name,valid_to --limit 50 > /tmp/flyers.json
flipp deals --min-discount 30 --limit 20 --json > /tmp/deals.json
flipp coupons --type loyalty --limit 10 --json > /tmp/coupons.json
# Agent composes a newsletter/Slack post from the three JSONs.
```

## Bulk patterns (critical for agent efficiency)

The CLI is designed so an agent can collapse what would be N round-trips
into a single shell call. **Prefer bulk whenever you have a known input
list** — pantry items, ingredient lists, shopping lists, brand allowlists.

| Anti-pattern | Better |
| --- | --- |
| `flipp search a` + `flipp search b` + `flipp search c` | `flipp search a b c` |
| `flipp search a --json` then filter merchant in agent | `flipp search a --merchant X --json` |
| `flipp search a --json` then filter `< $5` in agent | `flipp search a --max-price 5 --json` |
| `flipp deals` then re-filter to one store | `flipp search <items> --merchant X --min-discount 30 --json` |

Bulk `search` fires queries in parallel via `Promise.all`, so latency is
roughly one round-trip regardless of how many queries you pass. There's no
hard limit, but keep it under ~25 to avoid hammering the upstream.

## Common gotchas

- **Postal code is required.** If the user hasn't run `flipp locate --save`,
  the CLI will IP-detect once and persist; agents in fresh sandboxes should
  pass `--postal` explicitly.
- **`discount_pct` is often `null`.** Many flyer items list only
  `current_price`, not `original_price`, so the percent is uncomputable.
  Don't filter `--min-discount` and then complain about empty results — try
  again without the filter or use `--sort price-asc` instead.
- **`type: "ecom"` items are online listings**, not in-store flyer deals.
  They can have shipping/availability concerns. Use `--type flyer` to
  restrict to physical-flyer items when the user is shopping in person.
- **Times are ISO with timezones.** Convert to local before showing the
  user. `valid_to` like `"2026-05-28T03:59:59+00:00"` is end-of-day local
  time at the merchant's timezone.
- **`flipp deals` is slow** (10 parallel searches). Use `flipp search
  <items>` instead when you have a specific list.
- **Field projection saves a lot of tokens.** A raw search response can be
  >200 KB. Default `flipp search` projection trims most of it; add
  `--fields name,price,merchant` to trim more.

## Error handling

Every error is a single JSON line on stderr with a stable `code`:

| `code` | Exit | Recovery |
| --- | --- | --- |
| `invalid_postal_code` | 2 | Surface the hint; ask user for a valid postal/ZIP. |
| `missing_postal_code` | 2 | Tell user to run `flipp locate --save` or pass `--postal`. |
| `invalid_sort`, `invalid_combo` | 2 | Re-read this skill or `flipp describe`. |
| `not_found` | 3 | Upstream returned 404; double-check the resource exists. |
| `timeout`, `network_error`, `upstream_error` | 6 | Retry once; if persistent, surface to user — Flipp may be down or rate-limiting. |

When you see a non-zero exit, **always show the user the JSON error**
verbatim before retrying or apologizing. The `hint` field usually tells
you exactly what to do.

## What this CLI does NOT do

- Write to Flipp (no list, cart, or favorite endpoints exposed).
- Run a vision model itself. `--with-images` exposes `image_url` so the
  agent can vision-process items whose `unit_price` came back null.
- Track historical prices across runs (no built-in cache).
- Handle merchant authentication for loyalty programs.
