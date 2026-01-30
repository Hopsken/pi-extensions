import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupHooks } from "./hooks";
import { setupTools } from "./lib/tools";
import { setupCommands } from "./setup-commands";

export default function (pi: ExtensionAPI) {
  setupHooks(pi);
  setupCommands(pi);
  setupTools(pi);
}
