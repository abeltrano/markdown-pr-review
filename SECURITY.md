# Security Policy

## Supported versions

Only the latest published version of **Azure DevOps Markdown PR Review** receives
security updates. Please upgrade before reporting an issue.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4   | :x:                |

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

To report a vulnerability:

1. Use [GitHub's private vulnerability reporting][gh-priv]. From this
   repository's **Security** tab, click **Report a vulnerability**.
2. Include a clear description of the issue, steps to reproduce, the
   extension version, and the VS Code version you are running.
3. Expect an initial acknowledgement within 7 days.

[gh-priv]: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability

## Credential handling

The extension handles two kinds of secrets:

- **Microsoft Entra ID (Azure AD) access tokens** are acquired via
  `vscode.authentication.getSession('microsoft', …)`. Tokens never leave
  the local VS Code process and are managed by VS Code's authentication
  provider.
- **Personal Access Tokens (PATs)** are stored in
  [VS Code `SecretStorage`][secret-storage], which uses the OS-level
  secure credential store: Keychain on macOS, Credential Manager on
  Windows, and libsecret on Linux.

All HTTP responses, error logs, and exception messages are routed
through a redaction layer ([`src/redact.ts`](src/redact.ts)) that
strips bearer tokens,
PATs, JWTs, and other sensitive substrings before they are written to
the output channel.

[secret-storage]: https://code.visualstudio.com/api/references/vscode-api#SecretStorage

## Network surface

The extension communicates only with Azure DevOps Services hosts under
the user-configured organization (and `login.microsoftonline.com` for
Entra ID auth, which VS Code itself handles). The extension performs no
telemetry, calls no third-party endpoints, and has no auto-update
mechanism — updates flow through the VS Code Marketplace only.
