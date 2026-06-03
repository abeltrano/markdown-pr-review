// SPDX-License-Identifier: MIT
// Centralized logger with mandatory auth-header / bearer-token redaction.
// All log writes MUST funnel through redactAuthHeaders() to satisfy
// REQ-ERR-001 AC-3 and REQ-NFR-SEC-001.

import * as vscode from 'vscode';

const CHANNEL_NAME = 'ADO Markdown PR Reviewer';

// Matches a JWT or similarly structured access token: three dot-separated
// base64url segments, the first beginning with "eyJ" (the base64url prefix
// of `{"`).
const JWT_LIKE_REGEX = /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g;

// Header names recognized as auth carriers.
const AUTH_HEADER_NAMES = new Set([
    'authorization',
    'x-tfs-fedauthredirect',
    'cookie',
    'set-cookie'
]);

/**
 * Recursively walks an arbitrary JSON-shaped value and returns a copy with
 * any auth-header values or JWT-shaped strings replaced by `[REDACTED]`.
 * Pure function — does not mutate the input.
 *
 * Exported for unit testing (TC-145).
 */
export function redactAuthHeaders(input: unknown): unknown {
    if (typeof input === 'string') {
        return input.replace(JWT_LIKE_REGEX, '[REDACTED]');
    }
    if (Array.isArray(input)) {
        return input.map(redactAuthHeaders);
    }
    if (input && typeof input === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            if (AUTH_HEADER_NAMES.has(key.toLowerCase())) {
                out[key] = '[REDACTED]';
            } else if (typeof value === 'string') {
                out[key] = value.replace(JWT_LIKE_REGEX, '[REDACTED]');
            } else {
                out[key] = redactAuthHeaders(value);
            }
        }
        return out;
    }
    return input;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
    info(message: string, context?: unknown): void;
    warn(message: string, context?: unknown): void;
    error(message: string, context?: unknown): void;
    /** For tests / explicit disposal */
    dispose(): void;
    /** Expose the channel so callers can offer "Open Output" actions */
    readonly channel: vscode.OutputChannel;
}

export class OutputChannelLogger implements Logger {
    readonly channel: vscode.OutputChannel;
    private readonly component: string;

    constructor(component: string, channel?: vscode.OutputChannel) {
        this.component = component;
        this.channel = channel ?? vscode.window.createOutputChannel(CHANNEL_NAME);
    }

    info(message: string, context?: unknown): void {
        this.write('info', message, context);
    }

    warn(message: string, context?: unknown): void {
        this.write('warn', message, context);
    }

    error(message: string, context?: unknown): void {
        this.write('error', message, context);
    }

    dispose(): void {
        this.channel.dispose();
    }

    /** Returns a logger sharing the same channel but tagged with a new component name. */
    child(component: string): Logger {
        return new OutputChannelLogger(component, this.channel);
    }

    private write(level: LogLevel, message: string, context?: unknown): void {
        const timestamp = new Date().toISOString();
        const safeMessage = String(message).replace(JWT_LIKE_REGEX, '[REDACTED]');
        let line = `[${timestamp}] [${level.toUpperCase()}] [${this.component}] ${safeMessage}`;
        if (context !== undefined) {
            const safeContext = redactAuthHeaders(context);
            try {
                line += ' ' + JSON.stringify(safeContext);
            } catch {
                line += ' [unserializable context]';
            }
        }
        this.channel.appendLine(line);
    }
}

let sharedChannel: vscode.OutputChannel | undefined;

/** Returns a logger sharing the singleton output channel. Test-friendly. */
export function getLogger(component: string): Logger {
    if (!sharedChannel) {
        sharedChannel = vscode.window.createOutputChannel(CHANNEL_NAME);
    }
    return new OutputChannelLogger(component, sharedChannel);
}

/** Test seam: lets unit tests reset the singleton between cases. */
export function resetLoggerForTests(): void {
    sharedChannel?.dispose();
    sharedChannel = undefined;
}
