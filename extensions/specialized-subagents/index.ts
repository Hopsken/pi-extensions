import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createJesterTool, JESTER_GUIDANCE } from "./subagents/jester";
import { createLookoutTool, LOOKOUT_GUIDANCE } from "./subagents/lookout";
import { createOracleTool, ORACLE_GUIDANCE } from "./subagents/oracle";
import { createReviewerTool, REVIEWER_GUIDANCE } from "./subagents/reviewer";

/**
 * Specialized Subagents Extension
 *
 * Provides specialized subagents with custom tools:
 * - lookout: Local codebase search by functionality/concept (uses osgrep)
 * - oracle: Expert AI advisor for complex reasoning and planning
 * - reviewer: Code review feedback on diffs
 * - jester: No-tools, training-data-only answers (high variance)
 */

// Collect all subagent guidances
const SUBAGENT_GUIDANCES = [
  LOOKOUT_GUIDANCE,
  ORACLE_GUIDANCE,
  REVIEWER_GUIDANCE,
  JESTER_GUIDANCE,
];

export default function (pi: ExtensionAPI) {
  // Register subagent tools
  pi.registerTool(createLookoutTool());
  pi.registerTool(createOracleTool());
  pi.registerTool(createReviewerTool());
  pi.registerTool(createJesterTool());

  // Inject subagent guidance into system prompt
  pi.on("before_agent_start", async (event) => {
    const guidance = SUBAGENT_GUIDANCES.join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n${guidance}`,
    };
  });
}
