# Web Fetch Extension

Provides the `web_fetch` tool for fetching a URL and returning:

- `html`: raw HTML
- `text`: extracted plain text (via `html-to-text`)
- `markdown`: main-article extraction via `@mozilla/readability` (returned as markdown-ish text)

## Notes

- This tool does **not** render JavaScript.
- Uses native `fetch()` under Node.
