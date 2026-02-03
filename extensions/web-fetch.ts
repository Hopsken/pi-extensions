/**
 * Web Fetch Extension
 *
 * Provides the `web_fetch` tool for fetching a URL and returning:
 * - raw HTML
 * - extracted plain text (via html-to-text)
 * - extracted markdown-ish content (via @mozilla/readability)
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
import { htmlToText } from 'html-to-text'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const parameters = Type.Object({
  url: Type.String({
    description: 'The URL to fetch',
  }),
  renderJs: Type.Optional(
    Type.Boolean({
      description:
        '(Ignored) Kept for backwards compatibility; this tool does not render JavaScript',
    }),
  ),
  format: Type.Optional(
    Type.Union(
      [Type.Literal('html'), Type.Literal('text'), Type.Literal('markdown')],
      {
        description: 'Response format (default: markdown)',
      },
    ),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      description:
        'Abort request after this many milliseconds (default: 30000)',
      minimum: 1,
      maximum: 300000,
    }),
  ),
})

type WebFetchFormat = 'html' | 'text' | 'markdown'

/** Details for rendering */
interface WebFetchDetails {
  url: string
  format: WebFetchFormat
  duration: number // ms
  status?: number
  contentType?: string | null
  contentLength?: number
  error?: string
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => controller.abort()
  if (signal && typeof signal.addEventListener === 'function') {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some sites block requests without a UA.
        'user-agent': DEFAULT_USER_AGENT,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
  } finally {
    clearTimeout(timeout)
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function htmlToPlainText(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    // Avoid overly noisy link formatting.
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
    ],
  }).trim()
}

function readabilityToMarkdownish(html: string, url: string): string {
  // Readability needs a DOM; jsdom provides it.
  const dom = new JSDOM(html, { url })

  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article) {
    // Fallback: treat whole document as text.
    return htmlToPlainText(html)
  }

  const parts: string[] = []
  const title = (article.title || '').trim()
  if (title) {
    parts.push(`# ${title}`)
  }

  const meta: string[] = []
  if (article.byline) meta.push(article.byline)
  if (article.siteName) meta.push(article.siteName)
  if (meta.length > 0) {
    parts.push(meta.join(' · '))
  }

  if (article.excerpt) {
    parts.push(`> ${article.excerpt.trim()}`)
  }

  const contentText = htmlToPlainText(article.content ?? '')
  if (contentText) {
    parts.push(contentText)
  }

  return parts.join('\n\n').trim()
}

const webFetchTool: ToolDefinition<typeof parameters, WebFetchDetails> = {
  name: 'web_fetch',
  label: 'Web Fetch',
  description: `Fetch a URL and return its content as html, text, or markdown.

Formats:
- html: raw HTML
- text: plain text converted from HTML (html-to-text)
- markdown: main-article extraction via @mozilla/readability (then converted to a markdown-ish text)

Note: This tool does NOT render JavaScript.`,

  parameters,

  async execute(
    _toolCallId: string,
    args: {
      url: string
      renderJs?: boolean
      format?: WebFetchFormat
      timeoutMs?: number
    },
    signal: AbortSignal,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const { url, format = 'markdown', timeoutMs = 30_000 } = args
    // NOTE: `renderJs` is accepted for backwards compatibility but ignored.
    const startTime = Date.now()

    try {
      const response = await fetchWithTimeout(url, timeoutMs, signal)
      const duration = Date.now() - startTime

      const contentType = response.headers.get('content-type')
      const status = response.status

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        const msg = `HTTP ${status} ${response.statusText}`
        return {
          content: [
            {
              type: 'text' as const,
              text: body ? `${msg}\n\n${body}` : msg,
            },
          ],
          details: {
            url,
            format,
            duration,
            status,
            contentType,
            error: msg,
          },
        }
      }

      // Read the response body as text.
      // For non-text responses, this may be garbage; callers should pick the right URL.
      const html = await response.text()

      let out: string
      if (format === 'html') {
        out = html
      } else if (format === 'text') {
        out = htmlToPlainText(html)
      } else {
        out = readabilityToMarkdownish(html, url)
      }

      return {
        content: [{ type: 'text' as const, text: out || '' }],
        details: {
          url,
          format,
          duration,
          status,
          contentType,
          contentLength: out?.length ?? 0,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        details: {
          url,
          format: args.format ?? 'markdown',
          duration,
          error: message,
        },
      }
    }
  },

  renderCall(
    args: { url: string; renderJs?: boolean; format?: WebFetchFormat },
    theme: Theme,
  ) {
    let text = theme.fg('toolTitle', theme.bold('web_fetch '))
    text += theme.fg('muted', args.url)
    if (args.format) {
      text += theme.fg('muted', ` (${args.format})`)
    }
    return new Text(text, 0, 0)
  },

  renderResult(
    result: AgentToolResult<WebFetchDetails>,
    { expanded }: ToolRenderResultOptions,
    theme: Theme,
  ) {
    const details = result.details

    if (details?.error) {
      return new Text(theme.fg('error', `Error: ${details.error}`), 0, 0)
    }

    const container = new Container()

    // Footer with status and duration
    const footerParts: string[] = []
    if (details?.status) footerParts.push(`HTTP ${details.status}`)
    if (details?.duration != null)
      footerParts.push(formatDuration(details.duration))
    if (details?.contentLength != null)
      footerParts.push(`${details.contentLength} chars`)

    const footerText =
      theme.fg('success', 'done') +
      (footerParts.length ? theme.fg('muted', ` ${footerParts.join(' ')}`) : '')

    container.addChild(new Text(footerText, 0, 0))

    // Render content (as markdown-ish preview).
    if (result.content?.[0]?.type === 'text') {
      const content = (result.content[0] as { text: string }).text
      const mdTheme = getMarkdownTheme()

      if (expanded) {
        container.addChild(new Markdown(content, 0, 0, mdTheme))
      } else {
        const lines = content.split('\n')
        const preview = lines.slice(0, 8).join('\n')
        container.addChild(new Markdown(preview, 0, 0, mdTheme))

        if (lines.length > 8) {
          container.addChild(
            new Text(
              theme.fg('muted', `... (${lines.length - 8} more lines)`),
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
  pi.registerTool(webFetchTool)
}
