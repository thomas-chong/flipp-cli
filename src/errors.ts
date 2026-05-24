export const ExitCode = {
  Ok: 0,
  General: 1,
  Usage: 2,
  NotFound: 3,
  AuthOrPermission: 4,
  Conflict: 5,
  RateLimitOrNetwork: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class FlippError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;
  readonly hint?: string;
  readonly detail?: unknown;

  constructor(opts: {
    code: string;
    message: string;
    exitCode?: ExitCodeValue;
    hint?: string;
    detail?: unknown;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.exitCode = opts.exitCode ?? ExitCode.General;
    this.hint = opts.hint;
    this.detail = opts.detail;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.hint ? { hint: this.hint } : {}),
        ...(this.detail !== undefined ? { detail: this.detail } : {}),
      },
    };
  }
}

export function emitError(err: unknown): never {
  const e =
    err instanceof FlippError
      ? err
      : new FlippError({
          code: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        });
  process.stderr.write(JSON.stringify(e.toJSON()) + "\n");
  process.exit(e.exitCode);
}
