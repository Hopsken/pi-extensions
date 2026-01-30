/**
 * Web search tool using Brave Search API.
 *
 * Docs: https://api.search.brave.com/app/documentation/web-search
 * Env: BRAVE_API_KEY
 */

import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolDefinition,
  ToolRenderResultOptions,
} from '@mariozechner/pi-coding-agent'
import { getMarkdownTheme } from '@mariozechner/pi-coding-agent'
import { Container, Markdown, Text } from '@mariozechner/pi-tui'
import { Type } from '@sinclair/typebox'

const parameters = Type.Object({
  query: Type.String({
    description: 'The search query',
  }),
  numResults: Type.Optional(
    Type.Integer({
      description: 'Number of results to return (default: 10, max: 20)',
      minimum: 1,
      maximum: 20,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description: 'Two-letter country code for results (e.g. US, DE)',
      minLength: 2,
      maxLength: 2,
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description:
        'Time filter: pd (day), pw (week), pm (month), py (year), or YYYY-MM-DDtoYYYY-MM-DD',
    }),
  ),
})

interface BraveWebResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

interface BraveWebSearchResponse {
  web?: {
    results?: BraveWebResult[]
  }
}

interface WebSearchDetails {
  query: string
  resultCount: number
  duration: number // ms
  provider: 'brave'
  error?: string
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function requireBraveApiKey(): string {
  const key = process.env.BRAVE_API_KEY
  if (!key) throw new Error('BRAVE_API_KEY environment variable is not set')
  return key
}

function formatResultsMarkdown(
  query: string,
  results: BraveWebResult[],
): string {
  if (!results.length) return 'No results found.'

  const lines: string[] = []
  lines.push(`# Search Results`)
  lines.push(`Query: ${query}`)
  lines.push('')

  results.forEach((r, i) => {
    const title = (r.title || 'Untitled').trim()
    const url = r.url || ''
    const desc = (r.description || '').trim()

    lines.push(`## ${i + 1}. ${title}`)
    if (url) lines.push(`**URL:** ${url}`)
    if (r.age) lines.push(`**Age:** ${r.age}`)
    if (desc) lines.push(`\n${desc}`)
    lines.push('\n---\n')
  })

  return lines.join('\n').trim()
}

async function braveWebSearch(
  args: {
    query: string
    numResults?: number
    country?: string
    freshness?: string
  },
  signal?: AbortSignal,
): Promise<BraveWebSearchResponse> {
  const apiKey = requireBraveApiKey()

  const { query, numResults = 10, country, freshness } = args

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(numResults))

  if (country) url.searchParams.set('country', country)
  if (freshness) url.searchParams.set('freshness', freshness)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-subscription-token': apiKey,
      'user-agent': 'pi-web-search/1.0',
    },
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Brave Search API error (${response.status}): ${text || response.statusText}`,
    )
  }

  return (await response.json()) as BraveWebSearchResponse
}

const webSearchTool: ToolDefinition<typeof parameters, WebSearchDetails> = {
  name: 'web_search',
  label: 'Web Search',
  description: `Search the web for information via Brave Search API.

Returns a list of results (title, URL, snippet).

Requires: BRAVE_API_KEY environment variable`,

  parameters,

  async execute(
    _toolCallId: string,
    args: {
      query: string
      numResults?: number
      country?: string
      freshness?: string
    },
    _onUpdate: unknown,
    _ctx: unknown,
    signal?: AbortSignal,
  ) {
    const start = Date.now()
    const { query } = args

    try {
      const data = await braveWebSearch(args, signal)
      const results = data.web?.results ?? []
      const markdown = formatResultsMarkdown(query, results)

      return {
        content: [{ type: 'text' as const, text: markdown }],
        details: {
          query,
          resultCount: results.length,
          duration: Date.now() - start,
          provider: 'brave' as const,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        details: {
          query,
          resultCount: 0,
          duration: Date.now() - start,
          provider: 'brave' as const,
          error: message,
        },
      }
    }
  },

  renderCall(args, theme: Theme) {
    const q = typeof args.query === 'string' ? args.query : ''
    return new Text(
      theme.fg('toolTitle', theme.bold('web_search ')) + theme.fg('muted', q),
      0,
      0,
    )
  },

  renderResult(
    result: AgentToolResult<WebSearchDetails>,
    { expanded }: ToolRenderResultOptions,
    theme: Theme,
  ) {
    const container = new Container()
    const details = result.details

    if (details?.error) {
      container.addChild(
        new Text(theme.fg('error', `Error: ${details.error}`), 0, 0),
      )
      return container
    }

    const footerParts: string[] = []
    if (details) {
      footerParts.push(`${details.resultCount} results`)
      footerParts.push(formatDuration(details.duration))
    }

    container.addChild(
      new Text(
        theme.fg('success', 'done') +
          theme.fg(
            'muted',
            footerParts.length ? ` ${footerParts.join(' · ')}` : '',
          ),
        0,
        0,
      ),
    )

    const textContent = result.content?.[0]
    if (textContent?.type === 'text') {
      const text = textContent.text ?? ''
      const mdTheme = getMarkdownTheme()

      if (expanded) {
        container.addChild(new Markdown(text, 0, 0, mdTheme))
      } else {
        const lines = text.split('\n')
        const preview = lines.slice(0, 12).join('\n')
        container.addChild(new Markdown(preview, 0, 0, mdTheme))
        if (lines.length > 12) {
          container.addChild(
            new Text(
              theme.fg('muted', `... (${lines.length - 12} more lines)`),
              0,
              0,
            ),
          )
        }
      }
    }

    return container
  },
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(webSearchTool)
}
