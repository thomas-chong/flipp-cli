export type Format = "json" | "ndjson" | "table" | "raw";

export interface OutputOptions {
  json?: boolean;
  ndjson?: boolean;
  pretty?: boolean;
  raw?: boolean;
  fields?: string;
  limit?: number;
}

export function resolveFormat(opts: OutputOptions): Format {
  if (opts.raw) return "raw";
  if (opts.ndjson) return "ndjson";
  if (opts.json) return "json";
  if (opts.pretty) return "table";
  return process.stdout.isTTY ? "table" : "json";
}

function pickFields(row: object, fields?: string): Record<string, unknown> {
  const rec = row as Record<string, unknown>;
  if (!fields) return rec;
  const keys = fields.split(",").map((s) => s.trim()).filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = rec[k];
  return out;
}

function applyLimit<T>(rows: T[], limit?: number): T[] {
  if (!limit || limit <= 0) return rows;
  return rows.slice(0, limit);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function renderTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "(no rows)\n";
  const cols = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const widths = cols.map((c) =>
    Math.max(
      c.length,
      ...rows.map((r) => {
        const v = r[c];
        if (v === null || v === undefined) return 0;
        return String(v).length;
      }),
    ),
  );
  const capped = widths.map((w) => Math.min(w, 40));
  const line = (cells: string[]) =>
    cells.map((c, i) => truncate(c, capped[i]!).padEnd(capped[i]!)).join("  ");
  const header = line(cols);
  const sep = capped.map((w) => "─".repeat(w)).join("  ");
  const body = rows
    .map((r) => line(cols.map((c) => (r[c] === undefined || r[c] === null ? "" : String(r[c])))))
    .join("\n");
  return `${header}\n${sep}\n${body}\n`;
}

export function emit<T extends object>(
  rows: T[] | T,
  opts: OutputOptions & { tableShape?: (row: T) => object } = {},
): void {
  const fmt = resolveFormat(opts);

  if (!Array.isArray(rows)) {
    if (fmt === "raw" || fmt === "json" || fmt === "ndjson") {
      process.stdout.write(JSON.stringify(rows) + "\n");
    } else {
      const tbl = opts.tableShape ? opts.tableShape(rows) : pickFields(rows, opts.fields);
      process.stdout.write(renderTable([tbl as Record<string, unknown>]));
    }
    return;
  }

  const limited = applyLimit(rows, opts.limit);

  if (fmt === "raw") {
    process.stdout.write(JSON.stringify(limited) + "\n");
    return;
  }
  if (fmt === "ndjson") {
    for (const r of limited) {
      process.stdout.write(JSON.stringify(pickFields(r, opts.fields)) + "\n");
    }
    return;
  }
  if (fmt === "json") {
    const projected = limited.map((r) => pickFields(r, opts.fields));
    process.stdout.write(JSON.stringify(projected) + "\n");
    return;
  }
  const projected = limited.map(
    (r) =>
      (opts.tableShape ? opts.tableShape(r) : pickFields(r, opts.fields)) as Record<string, unknown>,
  );
  process.stdout.write(renderTable(projected));
}

export function emitInfo(msg: string): void {
  if (process.stderr.isTTY) process.stderr.write(msg + "\n");
}

export function sanitizeQuery(q: string): string {
  if (/[\x00-\x1f\x7f]/.test(q)) {
    throw Object.assign(new Error("Query contains control characters."), {
      code: "invalid_query",
    });
  }
  return q.trim();
}
