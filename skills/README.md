# Skills

AI-agent skills that ship alongside `flipp-cli`. Each subfolder contains a
`SKILL.md` that follows the [skills.sh](https://www.skills.sh) convention so
it can be installed by any compatible agent runtime.

## Available skills

| Skill | Purpose |
| --- | --- |
| [`flipp-cli`](./flipp-cli/SKILL.md) | Teaches an AI agent how to use the `flipp` CLI for grocery/retail deals, weekly flyers, coupons, and merchant lookups. Covers 10 workflow recipes (recipe planning, shopping optimization, coupon stacking, price-watch, pantry restocking, trip planning, etc.). |

## Install

From any directory:

```bash
npx skills add thomas-chong/flipp-cli
```

The CLI auto-discovers every `SKILL.md` under `skills/` and installs them
into your agent's skill directory (`~/.claude/skills/`,
`~/.cursor/skills/`, etc.). See [skills.sh/docs](https://www.skills.sh/docs)
for the full list of supported agents.

## Contributing a new skill

Drop a folder under `skills/` with a `SKILL.md` at minimum:

```
skills/
└── your-skill/
    ├── SKILL.md         (required, with YAML frontmatter)
    ├── scripts/         (optional helper scripts)
    └── references/      (optional supporting docs)
```

Frontmatter must include `name` and `description`; the `description` is
what determines when the agent will trigger your skill, so be specific.

Add your skill to `../skills.sh.json` so it appears in groupings.
