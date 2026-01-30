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
 *
 * IMPORTANT: Do not rely on array indices elsewhere in the code. If a pattern
 * needs version-aware tie-breaking, attach a `version()` extractor here.
 */
type TierPatternKind =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'gpt-5'
  | 'gemini-pro'
  | 'gemini-flash'

type TierPattern = {
  kind: TierPatternKind
  re: RegExp
  version?: (id: string) => number[] | null
}

function tierPatterns(tier: ModelTier): TierPattern[] {
  switch (tier) {
    case 'complex':
      return [
        {
          kind: 'claude-opus',
          // Match token "opus" in common Anthropic IDs:
          // - claude-3-opus-20240229
          // - claude-opus-4-5-20251101
          re: /(?:^|[-_ ])opus(?:$|[-_ ])/i,
          version: id => extractClaudeFamilyVersion(id, 'opus'),
        },
        {
          kind: 'gpt-5',
          re: /gpt[-_ ]?5(?:[._-]\d+)?/i,
          version: extractGptVersion,
        },
        { kind: 'gemini-pro', re: /gemini.*pro/i },
      ]
    case 'standard':
      return [
        {
          kind: 'claude-sonnet',
          // Match token "sonnet" in common Anthropic IDs:
          // - claude-3-7-sonnet-20250219
          // - claude-sonnet-4-0
          re: /(?:^|[-_ ])sonnet(?:$|[-_ ])/i,
          version: id => extractClaudeFamilyVersion(id, 'sonnet'),
        },
        { kind: 'gpt-5', re: /gpt[-_ ]?5/i, version: extractGptVersion },
        { kind: 'gemini-pro', re: /gemini.*pro/i },
      ]
    case 'simple':
      return [
        {
          kind: 'claude-haiku',
          // Match token "haiku" in common Anthropic IDs:
          // - claude-3-haiku-20240307
          // - claude-haiku-4-5-20251001
          re: /(?:^|[-_ ])haiku(?:$|[-_ ])/i,
          version: id => extractClaudeFamilyVersion(id, 'haiku'),
        },
        { kind: 'gemini-flash', re: /flash/i },
      ]
  }
}

function penaltyPatterns(): RegExp[] {
  return [/preview/i, /experimental/i, /beta/i]
}

function isUnstableModelId(id: string): boolean {
  return penaltyPatterns().some(re => re.test(id))
}

function isKnownMajorProvider(provider: string): boolean {
  return /openai|anthropic|google/i.test(provider)
}

function scoreModelForTier(
  m: { id: string; provider: string },
  tier: ModelTier,
) {
  // Score based on the *best* (highest-priority) tier pattern match only.
  // Do NOT sum matches; otherwise a model that matches multiple lower-priority
  // patterns can outscore a single higher-priority match.
  const match = bestTierPatternMatch(m.id, tier)
  if (!match) return 0
  return 100 - match.idx * 10
}

function sanitizeVersionString(v: string | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  if (!s) return null

  // Avoid accidentally treating dates/build numbers as model "versions".
  // Examples that should NOT beat "3.5":
  // - "20240229"
  // - "2024.10.22" / "2024-10-22"
  if (/^[0-9]{4,}$/.test(s) && !/[._-]/.test(s)) return null

  const parts = s.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    const first = Number.parseInt(parts[0]!, 10)
    if (Number.isFinite(first) && first >= 1900) return null
  }

  return s
}

function parseVersionParts(v: string): number[] {
  const parts = v.split(/[._-]/).filter(Boolean)

  const out: number[] = []
  for (const p of parts) {
    // Stop if we hit a date/build suffix like 20241022.
    if (
      out.length > 0 &&
      /^(19|20)\d{6}$/.test(p) &&
      Number.isFinite(Number.parseInt(p.slice(0, 4), 10))
    ) {
      break
    }

    const n = Number.parseInt(p, 10)
    if (!Number.isFinite(n)) continue
    out.push(n)
  }

  return out
}

function compareVersionParts(a: number[] | null, b: number[] | null): number {
  if (!a && !b) return 0
  if (a && !b) return 1
  if (!a && b) return -1

  const aa = a ?? []
  const bb = b ?? []
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0
    const bv = bb[i] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

function bestTierPatternMatch(
  id: string,
  tier: ModelTier,
): { idx: number; pattern: TierPattern } | null {
  const nid = normalizeModelId(id)
  const patterns = tierPatterns(tier)
  for (let idx = 0; idx < patterns.length; idx++) {
    const p = patterns[idx]!
    if (p.re.test(id) || p.re.test(nid)) return { idx, pattern: p }
  }
  return null
}

function extractClaudeFamilyVersion(
  id: string,
  family: 'opus' | 'sonnet' | 'haiku',
): number[] | null {
  // Common Anthropic formats we want to support:
  // - "claude-3.5-sonnet" / "claude-3-opus"
  // - "claude-opus-4-5" (new style)
  // - "opus-4.5" / "opus-4-5"

  // 1) Prefer the number directly attached to "claude" before the family.
  const m1 = id.match(
    new RegExp(`claude[-_ ]?v?(\\d+(?:[._-]\\d+)*)[-_ ]?${family}`, 'i'),
  )
  const v1 = sanitizeVersionString(m1?.[1])
  if (v1) return parseVersionParts(v1)

  // 2) New style: family comes first, then the version: "claude-opus-4-5".
  const m2 = id.match(
    new RegExp(`claude[-_ ]?${family}[-_ ]?v?(\\d+(?:[._-]\\d+)*)`, 'i'),
  )
  const v2 = sanitizeVersionString(m2?.[1])
  if (v2) return parseVersionParts(v2)

  // 3) Fall back to a number after the family token: "opus-4.5" / "opus-4-5".
  const m3 = id.match(new RegExp(`${family}[-_ ]?v?(\\d+(?:[._-]\\d+)*)`, 'i'))
  const v3 = sanitizeVersionString(m3?.[1])
  if (v3) return parseVersionParts(v3)

  return null
}

function extractGptVersion(id: string): number[] | null {
  const m = id.match(/gpt[-_ ]?v?(\d+(?:[._-]\d+)*)/i)
  const v = sanitizeVersionString(m?.[1])
  return v ? parseVersionParts(v) : null
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
      // Tie-breakers (in order):
      // 1) stable over preview/beta
      // 2) if both match the same highest-priority tier pattern, prefer the
      //    higher numeric version (e.g. gpt-5.2 > gpt-5.1, opus 4.5 > opus 3)
      // 3) deterministic provider+id
      const a = `${best.provider}:${best.id}`
      const b = `${m.provider}:${m.id}`

      const aPreview = isUnstableModelId(best.id)
      const bPreview = isUnstableModelId(m.id)
      if (aPreview !== bPreview) {
        if (aPreview && !bPreview) best = m as Model<any>
        continue
      }

      const aMatch = bestTierPatternMatch(best.id, tier)
      const bMatch = bestTierPatternMatch(m.id, tier)
      if (aMatch && bMatch && aMatch.pattern.kind === bMatch.pattern.kind) {
        const version = aMatch.pattern.version
        if (version) {
          const aVer = version(best.id)
          const bVer = version(m.id)
          if (compareVersionParts(bVer, aVer) > 0) {
            best = m as Model<any>
            continue
          }
        }
      }

      const aKnown = isKnownMajorProvider(best.provider)
      const bKnown = isKnownMajorProvider(m.provider)
      if (aKnown !== bKnown) {
        if (!aKnown && bKnown) best = m as Model<any>
        continue
      }

      if (b < a) best = m as Model<any>
    }
  }

  // If nothing matched tier patterns, bestScore will be 0.
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
