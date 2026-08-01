# Security policy

Please do not report security issues, exposed credentials, or merchant data in a public issue.

## Report a vulnerability

Use GitHub's private vulnerability reporting flow for this repository when it is available. If it is not available, contact the maintainer privately through the [lvsao GitHub profile](https://github.com/lvsao) and include:

- a short description of the issue;
- the affected file, skill, or workflow;
- safe reproduction steps with secrets and merchant data removed;
- the potential impact.

Do not publish proof-of-concept tokens, session cookies, store domains tied to private data, or destructive commands.

## If a secret was exposed

Revoke or rotate the credential immediately, remove it from local logs and artifacts, then report the exposure privately. Removing a secret from the latest commit does not invalidate it.

General skill bugs and feature requests belong in the public issue tracker only after confirming that they contain no private information.
