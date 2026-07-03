# OIDC audience observations

This document tracks observed behavior while investigating which `audience`
values GitHub's Actions OIDC issuer accepts.

## Goal

The motivating failure is a GitHub Actions OIDC request with:

```text
audience: https://github.com/apps/cyspbot
```

GitHub rejected it before any downstream service received a token:

```text
Can't issue ID_TOKEN for audience 'https://github.com/apps/cyspbot'
```

The objective is to identify which parts of the audience value influence
issuance and find a supported audience form for a GitHub App identity.

## Run 1: broad matrix

Commit: `bd1c4f7`

Runs:

- `OIDC audience matrix`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018353>
- `OIDC audience cyspbot focused`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018334>
- `OIDC audience permission controls`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018378>
- `OIDC audience reusable caller`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018460>

### High-confidence observations

- Runner OS did not affect results. Ubuntu, macOS, and Windows all returned
  `182` accepted and `72` rejected in the broad matrix.
- Request construction mode did not affect the core result. `toolkit`,
  `urlsearchparams`, and `raw` all rejected the exact failing GitHub App URL.
- `permissions: id-token: write` only controls whether the request variables are
  available. With the permission present, audience value controls issuer
  acceptance.
- GitHub accepts broad custom audience strings. Accepted examples include:
  `cyspbot`, `api://cyspbot`, `urn:github:app:cyspbot`,
  `api://AzureADTokenExchange`, `sts.amazonaws.com`, generic `https://example.com`
  URLs, whitespace-containing strings, and 2048-character strings.
- All GitHub App URL forms tested in run 1 were rejected with HTTP `400`,
  including:
  - `https://github.com/apps`
  - `https://github.com/apps/cyspbot`
  - `http://github.com/apps/cyspbot`
  - `https://GITHUB.com/apps/cyspbot`
  - `https://github.com/apps/cyspbot/`
  - `https://github.com/apps/cyspbot?installation_id=1`
  - `https://github.com/apps/cyspbot#oidc`
  - `https://github.com/apps/cyspbot/installations/new`
  - `github.com/apps/cyspbot`
- GitHub API URLs tested in run 1 were rejected:
  - `https://api.github.com/app`
  - `https://api.github.com/repos/cysp/github-actions-id-token-exploration`
- GitHub owner/repository URLs are not simply accepted because they are GitHub
  URLs. Current-owner and current-repository forms were accepted, while unrelated
  owners and repositories were rejected.

### Important accepted GitHub URL examples

- `https://github.com`
- `https://github.com/`
- `https://github.com/cysp`
- `http://github.com/cysp`
- `https://GITHUB.com/cysp`
- `https://github.com/cysp/`
- `https://github.com/cysp/github-actions-id-token-exploration`
- `https://github.com/cysp/github-actions-id-token-exploration/`
- `https://github.com/cysp/github-actions-id-token-exploration/tree/main`

### Important rejected GitHub URL examples

- `https://github.com/chikachow`
- `https://github.com/actions`
- `https://github.com/octo-org`
- `https://github.com/cysp?tab=repositories`
- `https://github.com/orgs/cysp`
- `https://github.com/users/cysp`
- `https://github.com/cysp/terraform-provider-contentful`
- `https://github.com/cysp/github-actions-id-token-exploration.git`
- `https://github.com/cyspbot`

## Current hypotheses

The evidence supports these working hypotheses:

1. The issuer has special validation for `github.com` and `api.github.com`
   audiences.
2. For `github.com`, accepted URLs appear related to the current repository owner
   and current repository, plus the host root.
3. Top-level GitHub reserved paths such as `/apps`, `/orgs`, and `/users` appear
   rejected, even when the path contains the current owner or a real GitHub App
   slug.
4. The known failure is not caused by URL encoding, request construction mode,
   runner OS, job type, or missing `id-token: write`.
5. A non-URL or non-GitHub URL audience is likely the right shape for a GitHub
   App-specific audience, for example `cyspbot`, `api://cyspbot`, or
   `urn:github:app:cyspbot`.

These are hypotheses until narrowed by targeted follow-up runs.

## Next probes

The next run should test:

- Whether arbitrary current-repository subpaths are accepted.
- Whether arbitrary current-owner subpaths are accepted.
- Whether rejection is tied to top-level GitHub reserved paths.
- Whether `/apps/cyspbot` is accepted on non-GitHub domains.
- Whether an otherwise plain string is rejected merely because it contains the
  exact GitHub App URL as a substring.
- Whether encoded `/apps` variants are decoded before validation.
- Whether comma or space separated values are rejected only when they contain a
  rejected GitHub URL.
