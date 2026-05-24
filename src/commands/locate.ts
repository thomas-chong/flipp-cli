import { Command } from "commander";
import { locateByIp } from "../client.js";
import { rememberPostal } from "../config.js";
import { emit, emitInfo, type OutputOptions } from "../output.js";

interface LocateOpts extends OutputOptions {
  save?: boolean;
}

export function registerLocate(program: Command): void {
  program
    .command("locate")
    .description("Detect postal/ZIP code from current IP and optionally save it.")
    .option("--save", "Persist the detected postal code to ~/.config/flipp-cli/config.json.")
    .option("--json", "Force JSON output.")
    .option("--pretty", "Force pretty table.")
    .action(async (opts: LocateOpts) => {
      const loc = await locateByIp();
      if (opts.save) {
        rememberPostal(loc.postal_code);
        emitInfo(`Saved postal code ${loc.postal_code} to config.`);
      }
      emit(loc, { ...opts, tableShape: (r) => r });
    });
}
