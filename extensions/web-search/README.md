# Web Search Extension

Provides the `web_search` tool implemented on top of the **Brave Search API**.

## Setup

Set an API key:

```bash
export BRAVE_API_KEY="..."
```

## Tool

```ts
web_search({ query: "...", numResults: 10 })
```

Returns a markdown list of results (title, url, snippet).
