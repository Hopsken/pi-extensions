/**
 * Intelligent model selection for specialized subagents.
 *
 * Option 1 (heuristics only): choose a model based on the task complexity,
 * then pick the best available model from the registry.
 */

import type { Model } from '@mariozechner/pi-ai'
import type { ExtensionContext } from '@mariozechner/pi-coding-agent'

export type SubagentName = 'oracle' | 'reviewer' | 'lookout' | 'jester'

export type ModelTier = 'complex' | 'standard' | 'simple'

export interface SelectModelInput {
  subagent: SubagentName
  userMessage: string
  /** Optional extra signals (e.g. reviewer focus). */
  hints?: Record<string, unknown>
}

export interface SelectedModel {
  model: Model<any>
  modelId: string
  tier: ModelTier
  thinkingLevel: 'low' | 'medium' | 'high'
}

function normalize(text: string): string {
  return text.toLowerCase()
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some(n => text.includes(n))
}

function estimateTier(subagent: SubagentName, userMessage: string): ModelTier {
  const t = normalize(userMessage)

  // Jester is always simple/cheap.
  if (subagent === 'jester') return 'simple'

  // Oracle is usually complex reasoning/planning.
  if (subagent === 'oracle') {
    if (
      includesAny(t, [
        'architecture',
        'design',
        'refactor',
        'debug',
        'root cause',
        'race condition',
        'performance',
        'optimize',
        'threat model',
        'security',
        'plan',
        'migration',
      ])
    ) {
      return 'complex'
    }

    // If question seems short/straightforward, keep standard.
    return t.length < 200 ? 'standard' : 'complex'
  }

  // Reviewer: complex for security/perf/large diffs, otherwise standard.
  if (subagent === 'reviewer') {
    if (
      includesAny(t, [
        'security',
        'vulnerability',
        'auth',
        'permission',
        'sqli',
        'xss',
        'csrf',
        'rce',
        'perf',
        'performance',
        'latency',
        'memory',
        'leak',
        'concurrency',
      ])
    ) {
      return 'complex'
    }

    // Heuristic: mentions many files/lines
    if (includesAny(t, ['files changed', 'diff', 'patch']) && t.length > 2000) {
      return 'complex'
    }

    return 'standard'
  }

  // Lookout: tools do the work; keep it cheap unless explanation-heavy.
  if (subagent === 'lookout') {
    if (
      includesAny(t, [
        'explain',
        'how does',
        'walk me through',
        'trace',
        'data flow',
        'control flow',
        'end-to-end',
      ])
    ) {
      return 'standard'
    }
    return 'simple'
  }

  return 'standard'
}

function tierToThinkingLevel(tier: ModelTier): 'low' | 'medium' | 'high' {
  switch (tier) {
    case 'complex':
      return 'high'
    case 'standard':
      return 'medium'
    case 'simple':
      return 'low'
  }
}

function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/\s+/g, '')
}

/**
 * Build a priority list of regex patterns for a tier.
 * These are intentionally fuzzy because providers name models differently.
 */
function tierPatterns(tier: ModelTier): RegExp[] {
  switch (tier) {
    case 'complex':
      return [
        /claude.*opus/i,
        /gpt[-_]?5(\.\d+)?/i,
        /gemini.*pro/i,
        /o\d/i, // OpenAI "o1/o3" style
        /ultra/i,
      ]
    case 'standard':
      return [/claude.*sonnet/i, /gpt[-_]?5/i, /gemini.*pro/i]
    case 'simple':
      return [/claude.*haiku/i, /flash/i]
  }
}

function penaltyPatterns(): RegExp[] {
  return [/preview/i, /experimental/i, /beta/i]
}

function scoreModelForTier(
  m: { id: string; provider: string },
  tier: ModelTier,
) {
  const id = m.id
  const nid = normalizeModelId(id)
  let score = 0

  const patterns = tierPatterns(tier)
  patterns.forEach((re, idx) => {
    if (re.test(id) || re.test(nid)) {
      // Earlier patterns = higher priority
      score += 100 - idx * 10
    }
  })

  // Light preference for common vendor families if present in id
  if (/openai/i.test(id)) score += 3
  if (/anthropic/i.test(id)) score += 3
  if (/google/i.test(id)) score += 3

  // Penalize unstable variants unless they are the only matches
  for (const re of penaltyPatterns()) {
    if (re.test(id)) score -= 5
  }

  return score
}

function resolveBestAvailable(
  ctx: ExtensionContext,
  tier: ModelTier,
): Model<any> {
  const available = ctx.modelRegistry.getAvailable()
  if (available.length === 0) {
    throw new Error('No available models found in model registry.')
  }

  let best: Model<any> | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const m of available) {
    const s = scoreModelForTier(m, tier)
    if (s > bestScore) {
      best = m as Model<any>
      bestScore = s
    } else if (s === bestScore && best) {
      // Tie-breaker: stable over preview, then deterministic provider+id
      const a = `${best.provider}:${best.id}`
      const b = `${m.provider}:${m.id}`
      const aPreview = /preview|experimental|beta/i.test(best.id)
      const bPreview = /preview|experimental|beta/i.test(m.id)
      if (aPreview && !bPreview) best = m as Model<any>
      else if (a === b) best = best
      else if (b < a) best = m as Model<any>
    }
  }

  // If absolutely nothing matched tier patterns, bestScore may be 0 or negative.
  // Still return something deterministic.
  return best ?? (available[0] as Model<any>)
}

export function selectSubagentModel(
  input: SelectModelInput,
  ctx: ExtensionContext,
): SelectedModel {
  const tier = estimateTier(input.subagent, input.userMessage)
  const thinkingLevel = tierToThinkingLevel(tier)

  const model = resolveBestAvailable(ctx, tier)

  return {
    model,
    modelId: model.id,
    tier,
    thinkingLevel,
  }
}
