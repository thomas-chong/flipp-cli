# flipp-cli

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
