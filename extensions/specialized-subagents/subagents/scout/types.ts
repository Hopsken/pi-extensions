/**
 * Scout subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

/** Input parameters for the scout subagent */
export interface ScoutInput {
  /** URL to fetch content from */
  url?: string;
  /** Search query for web or GitHub research */
  query?: string;
  /** GitHub repository to focus on (owner/repo format) */
  repo?: string;
  /** Question to answer based on fetched content */
  prompt: string;
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for scout tool rendering */
export interface ScoutDetails {
  /** URL input */
  url?: string;
  /** Query input */
  query?: string;
  /** Repository input */
  repo?: string;
  /** Prompt input */
  prompt?: string;
  /** Requested skill names (from input) */
  skills?: string[];
  /** Number of skills successfully resolved */
  skillsResolved?: number;
  /** Skill names that were not found */
  skillsNotFound?: string[];
  /** Tool calls made by the subagent */
  toolCalls: SubagentToolCall[];
  /** Current spinner frame for animation */
  spinnerFrame: number;
  /** The scout's response (for final result) */
  response?: string;
  /** Whether the request was aborted */
  aborted?: boolean;
  /** Error message if failed */
  error?: string;
  /** Usage stats from the subagent */
  usage?: SubagentUsage;

  /** Resolved model used for this run (provider + model id) */
  resolvedModel?: { provider: string; id: string };
}
