import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FlippError, ExitCode } from "./errors.js";
import { locateByIp } from "./client.js";
import type { Locale } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "flipp-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface StoredConfig {
  postal_code?: string;
  locale?: Locale;
}

function load(): StoredConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

function save(cfg: StoredConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

const POSTAL_CA = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const POSTAL_US = /^\d{5}(-\d{4})?$/;

function validatePostal(code: string): string {
  const c = code.trim().toUpperCase().replace(/\s+/g, "");
  if (POSTAL_CA.test(code.trim().toUpperCase()) || POSTAL_US.test(c)) return c;
  throw new FlippError({
    code: "invalid_postal_code",
    message: `Not a valid Canadian or US postal/ZIP code: ${JSON.stringify(code)}`,
    exitCode: ExitCode.Usage,
    hint: "Examples: M5V3B9 (Canada), 10001 (US).",
  });
}

export interface ResolvedConfig {
  postal_code: string;
  locale: Locale;
  source: "flag" | "env" | "stored" | "auto-ip";
}

export async function resolveConfig(opts: {
  postal?: string;
  locale?: Locale;
  autoLocate?: boolean;
}): Promise<ResolvedConfig> {
  const stored = load();
  const locale: Locale = opts.locale ?? stored.locale ?? "en-ca";

  if (opts.postal) {
    return { postal_code: validatePostal(opts.postal), locale, source: "flag" };
  }
  if (process.env.FLIPP_POSTAL_CODE) {
    return {
      postal_code: validatePostal(process.env.FLIPP_POSTAL_CODE),
      locale,
      source: "env",
    };
  }
  if (stored.postal_code) {
    return { postal_code: stored.postal_code, locale, source: "stored" };
  }
  if (opts.autoLocate !== false) {
    const loc = await locateByIp();
    save({ postal_code: loc.postal_code, locale });
    return { postal_code: loc.postal_code, locale, source: "auto-ip" };
  }
  throw new FlippError({
    code: "missing_postal_code",
    message: "No postal code available.",
    exitCode: ExitCode.Usage,
    hint: "Pass --postal <code>, set FLIPP_POSTAL_CODE, or run `flipp locate` once.",
  });
}

export function rememberPostal(code: string, locale?: Locale): void {
  const cfg = load();
  cfg.postal_code = validatePostal(code);
  if (locale) cfg.locale = locale;
  save(cfg);
}
