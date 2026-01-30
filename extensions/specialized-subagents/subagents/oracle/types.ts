/**
 * Oracle subagent types.
 */

import type { SubagentToolCall, SubagentUsage } from "../../lib/types";

/** Input parameters for the oracle subagent */
export interface OracleInput {
  /** The task/question to consult the Oracle about */
  task: string;
  /** Optional context or background information */
  context?: string;
  /** Optional files to examine */
  files?: string[];
  /** Optional skill names to provide specialized context */
  skills?: string[];
}

/** Details structure for oracle tool rendering */
export interface OracleDetails {
  /** Task input */
  task: string;
  /** Context input */
  context?: string;
  /** Files input */
  files?: string[];
  /** Requested skill names (from input) */
  skills?: string[];
  /** Number of skills successfully resolved */
  skillsResolved?: number;
  /** Skill names that were not found */
  skillsNotFound?: string[];
  /** Tool calls made by the subagent (empty for oracle - advisory only) */
  toolCalls: SubagentToolCall[];
  /** Current spinner frame for animation */
  spinnerFrame: number;
  /** The oracle's response (for final result) */
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
