#!/usr/bin/env node
import("../dist/cli.js").catch((err) => {
  process.stderr.write(JSON.stringify({ error: { code: "bootstrap_failed", message: String(err) } }) + "\n");
  process.exit(1);
});
