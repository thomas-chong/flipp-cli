# AGENTS.md — flipp-cli

How AI agents should use this CLI.

## TL;DR

```bash
flipp describe                        # full machine-readable manifest
flipp search "milk" --json --limit 5  # always pass --json
echo $?                               # 0 ok; 2 usage; 3 not-found; 6 network
```

stdout = data, stderr = chatter, errors = JSON-on-stderr.

## Safe to call

All commands are **read-only**. There are no mutations, no auth tokens,
no destructive operations. Safe to invoke without `--dry-run` gating.

## Recommended invocation patterns

```bash
# Cheapest of X near a postal code
flipp search "<query>" --postal <code> --sort price-asc --limit 10 --json \
  --fields name,price,was,discount_pct,merchant,valid_to

# All Walmart flyers as JSON
flipp flyers --merchant walmart --json --fields merchant,valid_from,valid_to

# Top discounts across common groceries
flipp deals --min-discount 40 --json --limit 20

# Stream for filtering with jq
flipp search bread --ndjson | jq 'select(.discount_pct >= 25)'
```

## Error contract

On non-zero exit, stderr contains a single line:

```json
{"error":{"code":"invalid_postal_code","message":"...","hint":"..."}}
```

`code` is stable; check `code` rather than `message`.

| `code` | Exit | When |
| --- | --- | --- |
| `invalid_postal_code` | 2 | Malformed postal/ZIP |
| `invalid_sort` | 2 | Bad `--sort` value |
| `missing_postal_code` | 2 | No postal code resolvable |
| `not_found` | 3 | Upstream returned 404 |
| `timeout` | 6 | Request exceeded 15 s |
| `network_error` | 6 | DNS/connect failure |
| `upstream_error` | 6 | Flipp returned 5xx |

## Token-efficient defaults

- Use `--fields` to project; the raw Flipp payload includes many image URLs
  and signed S3 query strings that bloat context.
- Use `--limit` aggressively. Search returns up to 79 flyer items + 141
  ecom items by default.
- Use `--ndjson` if you plan to stream-filter; otherwise `--json` is fine.

## Postal-code resolution

The CLI resolves a postal code in this order: `--postal` flag → `FLIPP_POSTAL_CODE`
env → `~/.config/flipp-cli/config.json` → IP-based auto-detect (with
implicit save).

If your environment forbids writing to `~/.config`, always pass `--postal`.

## What this CLI does NOT do

- Write to Flipp (no list/cart/favorite endpoints exposed).
- Authenticate users.
- Cache responses (every call hits the upstream live).
- Rate-limit; Flipp has its own — see code `429` returned as `upstream_error`.
