# Security Policy

## Supported versions

Security fixes are provided for the latest published `0.1.x` version. Upgrade to the latest patch release before reporting behavior that may already be fixed.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use the repository's [private vulnerability report](https://github.com/ugnoguchigxp/spec-html/security/advisories/new) and include:

- the affected version and operating system;
- the smallest reproducible input or request;
- the expected and observed security boundary;
- any known impact or workaround.

If private reporting is unavailable, open a public issue that asks the maintainer for a private contact channel without including exploit details.

You should receive an acknowledgement within seven days. The maintainer will validate the report, coordinate a fix and disclosure timeline, and credit the reporter unless anonymity is requested.

## Security boundary

Spec HTML is a trusted-local-content viewer, not a hosted renderer or HTML sanitizer. HTML documents may execute scripts. The server binds to loopback by default; non-loopback use requires explicit allowed hosts and must remain on a trusted network. See the README security model for the complete boundary.
