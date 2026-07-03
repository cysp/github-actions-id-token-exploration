# GitHub Actions OIDC audience exploration

This repository contains GitHub Actions workflows for experimentally mapping which
`audience` values GitHub will accept when a workflow requests an OIDC ID token.

The immediate failure under investigation is from
`cysp/terraform-provider-contentful` run `28574332746`, job `84719196235`. The
failing action requested:

```text
audience: https://github.com/apps/cyspbot
```

GitHub's token issuer rejected that request before any downstream service saw a
token:

```text
Error Code : 400
Error Message: {"source":"actions-run-service","statusCode":400,"errorMessage":"Can't issue ID_TOKEN for audience 'https://github.com/apps/cyspbot'"}
```

## Authoritative references

GitHub documents that:

- OIDC tokens require `permissions: id-token: write`.
- `aud` defaults to the repository owner URL, for example
  `https://github.com/octo-org`.
- Custom actions can request a custom audience using
  `core.getIDToken(audience)`.
- Direct requests can call `ACTIONS_ID_TOKEN_REQUEST_URL` with an `audience`
  query parameter and the bearer token from `ACTIONS_ID_TOKEN_REQUEST_TOKEN`.

References:

- <https://docs.github.com/en/actions/reference/security/oidc>
- <https://docs.github.com/en/actions/concepts/security/openid-connect>
- <https://raw.githubusercontent.com/actions/toolkit/main/packages/core/src/oidc-utils.ts>
- <https://raw.githubusercontent.com/actions/toolkit/main/packages/core/README.md>
- <https://token.actions.githubusercontent.com/.well-known/openid-configuration>

The documentation confirms that custom audiences exist, but it does not define
the service-side validation rules for accepted audience forms. The workflows in
this repository are intended to fill that gap with reproducible observations.

## Audience coverage

The shared catalog in `scripts/audience-cases.json` currently expands to 289
cases:

- documented controls: default audience and explicit empty audience
- GitHub owner URLs: the repository owner, related owners, documentation example
  owners, HTTP/HTTPS, trailing slash, query string, and `/orgs` or `/users`
  path variants
- GitHub repository URLs: this repository, the observed failing repository,
  trailing slash, branch path, and `.git` suffix
- GitHub App forms: the exact failing `https://github.com/apps/cyspbot` value,
  trailing slash, query string, fragment, install path, top-level slug path,
  HTTP, uppercase host, and pre-encoded URL variants
- GitHub API URLs, provider-documented values, generic URL shapes, URI schemes,
  plain strings, reserved characters, whitespace, whitespace-only controls,
  multi-audience-looking strings, multiple-`github.com` values, query/fragment
  boundary variants, repository suffix boundary variants, root/owner suffix
  boundary variants, and length boundaries

The harness supports three request-construction modes. The broad, focused,
reusable, self-hosted, and single-audience workflows use all three by default;
the permission-control workflow uses the default toolkit-compatible mode because
it is checking permission behavior rather than encoding behavior.

- `toolkit`: matches the current `@actions/core` implementation by appending
  `encodeURIComponent(audience)` to `ACTIONS_ID_TOKEN_REQUEST_URL`
- `urlsearchparams`: uses the platform URL API to append the query parameter
- `raw`: appends the audience without query encoding, to distinguish issuer
  validation from client-side encoding behavior

## Workflows

- `oidc-audience-matrix.yml` runs the broad audience catalog on GitHub-hosted
  Linux using all three request modes by default.
- `oidc-audience-cyspbot-focused.yml` tests the exact failing
  `https://github.com/apps/cyspbot` value and close variants using multiple
  request encoding strategies.
- `oidc-audience-targeted.yml` runs targeted follow-up probes chosen from the
  current findings in `OBSERVATIONS.md`.
- `oidc-audience-permission-controls.yml` verifies the expected failure mode
  when `id-token: write` is absent.
- `oidc-audience-reusable-caller.yml` invokes `_oidc-audience-reusable.yml` to
  check whether the same audience behavior appears inside a reusable workflow.
- `oidc-audience-single.yml` tests one arbitrary audience value supplied at
  dispatch time.
- `oidc-audience-self-hosted.yml` is an opt-in workflow for a registered
  self-hosted runner.

Each workflow writes a Markdown job summary and, where artifact upload is
available, JSON and CSV result files.

Rejected values are expected and are part of the evidence. The investigation
workflows should continue after individual audience failures so the result
artifact contains the full acceptance matrix. The permission-control workflow is
the exception: it asserts that no requests are accepted without `id-token: write`
and that at least one request is accepted when that permission is present.

## Local runner note

`act` is not an authoritative way to test this behavior. GitHub's OIDC token is
issued by GitHub's Actions service using the runner-provided
`ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
environment variables. A local emulator can validate workflow syntax and script
control flow, but it cannot prove GitHub's issuer-side audience allow/deny
rules unless it is connected to the real GitHub Actions service.

The official self-hosted runner can test the real service once it is registered
to this repository, because jobs still obtain OIDC tokens from GitHub. Use the
`OIDC audience self-hosted` workflow for that path.
