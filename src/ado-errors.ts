// SPDX-License-Identifier: MIT
// ADO error types — extracted so they can be imported by vscode-free
// modules (e.g., error-classification) without pulling in the rest of
// the ado-client (which depends on auth-manager → vscode).

export class AdoRestError extends Error {
    constructor(
        public readonly status: number,
        public readonly endpoint: string,
        public readonly responseBody: string,
        message: string
    ) {
        super(message);
        this.name = 'AdoRestError';
    }
}

export class AdoNetworkError extends Error {
    constructor(public readonly endpoint: string, cause: unknown) {
        super(`Cannot reach Azure DevOps: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = 'AdoNetworkError';
    }
}
