/** Helpers that turn client results and errors into MCP tool results. */

import type { CallToolResult } from '@modelcontextprotocol/server';
import { SecurityTrailsError } from './client.js';

function text(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function jsonResult(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: text(data) }] };
}

export function structuredResult(data: Record<string, unknown>): CallToolResult {
    return { content: [{ type: 'text', text: text(data) }], structuredContent: data };
}

export function errorResult(error: unknown): CallToolResult {
    const message =
        error instanceof SecurityTrailsError
            ? error.message
            : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Wrap a handler so a thrown SecurityTrailsError becomes an `isError` result the
 * model can read and retry against, rather than a protocol-level failure.
 */
export function safe<Args>(run: (args: Args) => Promise<unknown>): (args: Args) => Promise<CallToolResult> {
    return async (args: Args) => {
        try {
            return jsonResult(await run(args));
        } catch (error) {
            return errorResult(error);
        }
    };
}

/** As {@link safe}, for tools that declare an `outputSchema`. */
export function safeStructured<Args>(
    run: (args: Args) => Promise<Record<string, unknown>>
): (args: Args) => Promise<CallToolResult> {
    return async (args: Args) => {
        try {
            return structuredResult(await run(args));
        } catch (error) {
            return errorResult(error);
        }
    };
}

/** Shared annotations: every tool in this server is a read-only remote lookup. */
export const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
} as const;
