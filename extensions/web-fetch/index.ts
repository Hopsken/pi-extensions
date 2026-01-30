import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createWebFetchTool } from "./lib/tools";

/**
 * Web Fetch Extension
 *
 * Provides the `web_fetch` tool for fetching a URL and returning:
 * - raw HTML
 * - extracted plain text (via html-to-text)
 * - extracted markdown-ish content (via @mozilla/readability)
 */
export default function (pi: ExtensionAPI) {
  pi.registerTool(createWebFetchTool());
}
