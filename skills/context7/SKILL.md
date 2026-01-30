---
name: context7
description: Search and retrieve documentation for libraries via Context7 API. Use for getting up-to-date documentation context for programming libraries like React, Next.js, etc.
---

# Context7

Search and retrieve library documentation using the Context7 API. Get relevant, up-to-date documentation snippets for any programming library.

## Setup

1. Create an account at https://context7.com/dashboard
2. Create an API key
3. Add to your shell profile (`~/.profile` or `~/.zprofile` for zsh):
   ```bash
   export CONTEXT7_API_KEY="your-api-key-here"
   ```
4. Install dependencies (run once):
   ```bash
   cd {baseDir}
   npm install
   ```

## Search Libraries

Find libraries by name to get their IDs:

```bash
{baseDir}/search.js "react"                    # Search for React libraries
{baseDir}/search.js "nextjs" -n 5              # Get 5 results
{baseDir}/search.js "typescript"               # Search TypeScript libs
```

### Options

- `-n <num>` - Number of results (default: 3, max: 20)

## Get Documentation

Retrieve documentation for a specific library:

```bash
{baseDir}/docs.js "/facebook/react" "how to use useState"
{baseDir}/docs.js "/vercel/next.js" "app router setup"
{baseDir}/docs.js "/microsoft/typescript" "generics" --format txt
```

### Options

- `--format <type>` - Output format: `json` (default) or `txt`

## Complete Workflow

1. First, search for the library to find its ID:
   ```bash
   {baseDir}/search.js "react"
   ```

2. Then, get documentation using the library ID:
   ```bash
   {baseDir}/docs.js "/facebook/react" "useEffect cleanup"
   ```

## Output Format

### Search Results
```
--- Library 1 ---
ID: /facebook/react
Name: React
Description: A JavaScript library for building user interfaces
Snippets: 1250
Trust Score: 95
Versions: v18.2.0, v17.0.2

--- Library 2 ---
...
```

### Documentation Results (JSON format)
```
--- Doc 1 ---
Title: Using the Effect Hook
Source: react.dev/reference/react/useEffect
Content:
  The Effect Hook lets you perform side effects...

--- Doc 2 ---
...
```

### Documentation Results (Text format)
```
[Plain text documentation ready for LLM context]
```

## When to Use

- Getting up-to-date documentation for libraries
- Understanding API usage and best practices
- Finding code examples and patterns
- Learning about specific library features
