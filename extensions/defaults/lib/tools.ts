import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { createLsTool, createReadTool } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { setupGetCurrentTimeTool } from '../tools/get-current-time'

/**
 * Parameter schema for READ tool override.
 * Supports multiple parameter name variants for maximum LLM compatibility:
 * - path (original/canonical)
 * - file_path (snake_case alternative)
 * - file (short alias)
 */
const ReadOverrideParams = Type.Object({
  file: Type.Optional(
    Type.String({
      description: 'Path to the file to read (alias for "path")',
    }),
  ),
  path: Type.Optional(
    Type.String({
      description: 'Path to the file to read (canonical parameter)',
    }),
  ),
  file_path: Type.Optional(
    Type.String({
      description: 'Path to the file to read (snake_case alternative)',
    }),
  ),
  offset: Type.Optional(
    Type.Number({
      description: 'Line number to start reading from (0-indexed)',
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum number of lines to read',
    }),
  ),
})

/**
 * Register tool overrides for the defaults extension.
 *
 * The `read` tool is overridden to:
 * 1. Accept multiple parameter name variants (path/file_path/file) for LLM compatibility
 * 2. Detect directories: if the path is a directory, delegate to the native `ls` tool
 *    instead of erroring with EISDIR.
 */
export function setupTools(pi: ExtensionAPI): void {
  const cwd = process.cwd()

  const nativeRead = createReadTool(cwd)
  const nativeLs = createLsTool(cwd)

  pi.registerTool({
    ...nativeRead,
    parameters: ReadOverrideParams, // Support multiple parameter name variants

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // Extract all possible parameter name variants
      const { path, file_path, file, offset, limit } = params

      // Apply priority order: path > file_path > file
      const pathValue = path ?? file_path ?? file

      // Validate that at least one path parameter is provided
      if (!pathValue) {
        throw new Error(
          'Missing required parameter: must provide one of "path", "file_path", or "file"',
        )
      }

      // Warn if multiple different values are provided (potential user error)
      const providedPaths = [path, file_path, file].filter(Boolean)
      if (providedPaths.length > 1 && new Set(providedPaths).size > 1) {
        console.warn(
          `[READ Override] Multiple different path values provided: ` +
            `path="${path}", file_path="${file_path}", file="${file}". ` +
            `Using "${pathValue}" (priority: path > file_path > file).`,
        )
      }

      // Resolve path relative to extension context's working directory
      const absolutePath = resolve(ctx.cwd, pathValue)

      try {
        const stat = await lstat(absolutePath)

        if (stat.isDirectory()) {
          // Warn user that read was called on a directory (temporary, for monitoring)
          ctx.ui.notify(`read called on directory: ${pathValue}`, 'info')

          // Delegate to native ls when reading a directory
          return nativeLs.execute(toolCallId, { path: pathValue }, signal)
        }
      } catch {
        // Path does not exist or cannot be accessed - let nativeRead handle the error
      }

      // Fall back to native read behavior for files (or let it error naturally)
      return nativeRead.execute(
        toolCallId,
        { path: pathValue, offset, limit },
        signal,
        onUpdate,
      )
    },
  })

  setupGetCurrentTimeTool(pi)
}
