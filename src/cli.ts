import { Command } from "commander";
import { registerSearch } from "./commands/search.js";
import { registerFlyers } from "./commands/flyers.js";
import { registerMerchants } from "./commands/merchants.js";
import { registerDeals } from "./commands/deals.js";
import { registerCoupons } from "./commands/coupons.js";
import { registerLocate } from "./commands/locate.js";
import { registerDescribe } from "./commands/describe.js";
import { emitError, FlippError, ExitCode } from "./errors.js";

const program = new Command();
program
  .name("flipp")
  .description(
    "AI-agent-friendly CLI for the Flipp flyer & deals API. JSON-first on pipes; pretty tables on TTY.",
  )
  .version("0.1.0")
  .addHelpText(
    "after",
    `
Quick start:
  $ flipp locate --save                        # detect & remember postal code
  $ flipp search milk --sort price-asc         # find the cheapest milk nearby
  $ flipp flyers --merchant walmart --json     # list Walmart flyers as JSON
  $ flipp describe                             # machine-readable command manifest

Output convention:
  stdout = data (JSON when piped or --json; pretty table on TTY)
  stderr = human chatter (use --json to suppress)
  Exit code 0 success | 1 general | 2 usage | 3 not-found | 6 network/rate-limit
`,
  );

registerSearch(program);
registerFlyers(program);
registerMerchants(program);
registerDeals(program);
registerCoupons(program);
registerLocate(program);
registerDescribe(program);

const handleExit = (err: { code?: string; message: string }): never => {
  if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
    process.exit(0);
  }
  const exitCode =
    err.code === "commander.missingArgument" ||
    err.code === "commander.missingMandatoryOptionValue" ||
    err.code === "commander.unknownOption" ||
    err.code === "commander.unknownCommand" ||
    err.code === "commander.invalidArgument"
      ? ExitCode.Usage
      : ExitCode.General;
  emitError(
    new FlippError({
      code: err.code?.replace(/^commander\./, "") ?? "usage_error",
      message: err.message,
      exitCode,
      hint: "Run `flipp --help` for usage.",
    }),
  );
};

const silentOutput = {
  writeOut: (str: string) => process.stdout.write(str),
  writeErr: () => {
    /* suppress commander's plain-text errors */
  },
};

function applyOverrides(cmd: Command): void {
  cmd.configureOutput(silentOutput);
  cmd.exitOverride(handleExit);
  for (const sub of cmd.commands) applyOverrides(sub);
}
applyOverrides(program);

program.parseAsync(process.argv).catch(emitError);
