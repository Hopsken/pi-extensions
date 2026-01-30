import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebSearchTool } from "./lib/tools";

/**
 * Web Search Extension
 *
 * Provides the `web_search` tool using the Brave Search API.
 *
 * Requires: BRAVE_API_KEY
 */
export default function (pi: ExtensionAPI) {
  pi.registerTool(createWebSearchTool());
}
