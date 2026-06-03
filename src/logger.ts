// SPDX-License-Identifier: MIT
// Centralized logger with mandatory auth-header / bearer-token redaction.
// All log writes MUST funnel through redactAuthHeaders() to satisfy
// REQ-ERR-001 AC-3 and REQ-NFR-SEC-001.

import * as vscode from 'vscode';
import {
    JWT_LIKE_REGEX,
    redactAuthHeaders,
    redactJwtsAndUrlTokens
} from './redact';

// Re-export for callers (and unit tests) that already pull from logger.
export { redactAuthHeaders } from './redact';

const CHANNEL_NAME = 'ADO Markdown PR Reviewer';

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
        const safeMessage = redactJwtsAndUrlTokens(String(message));
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

// Silence the unused-import diagnostic when the bundler tree-shakes the
// regex (it's used inside redact.ts now, but kept exported here for
// backward compat).
void JWT_LIKE_REGEX;
