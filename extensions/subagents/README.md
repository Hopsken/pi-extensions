# Specialized Subagents Extension

Framework for spawning specialized subagents with custom tools, consistent UI rendering, and logging.

## Features

- **Custom tools per subagent**: Each subagent has its own tool set
- **Streaming UI**: Tool call progress, spinner animation, markdown rendering
- **Cost tracking**: LLM tokens and external API costs
- **Logging**: Session-like logging in `~/.pi/agent/subagents/`

## Available Subagents

| Subagent | Description                                                                                                                                                                    | Requirements                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Lookout  | Local codebase search by functionality/concept. Uses osgrep for semantic search + grep/find for exact matches.                                                                 | [osgrep](https://github.com/Ryandonofrio3/osgrep) |
| Oracle   | AI advisor powered by Claude Opus 4.5 for complex reasoning, code reviews, architecture planning, and debugging.                                                               | None                                              |
| Reviewer | Code review agent that analyzes diffs and returns structured feedback. Parses diff descriptions, focuses on security/performance/style, and flags issues with priority levels. | None                                              |
| Jester   | Quick, playful, high-variance answers from training data only. No tools, no browsing. For brainstorming and creative responses.                                                | None                                              |

## Creating New Subagents

See the `create-specialized-subagent` skill and existing subagents under `subagents/` for reference.
