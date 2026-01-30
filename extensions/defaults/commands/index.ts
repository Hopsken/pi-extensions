import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerThemeCommand } from "./theme";

export function registerCommands(pi: ExtensionAPI) {
  registerThemeCommand(pi);
}
