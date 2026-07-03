# GitHub Actions OIDC audience report

This report summarizes the observed allowed and disallowed `audience` values
when requesting a GitHub Actions OIDC ID token from this repository.

The motivating failure was an action in
`cysp/terraform-provider-contentful` run `28574332746`, job `84719196235`,
requesting:

```text
https://github.com/apps/cyspbot
```

GitHub rejected the request before issuing a token:

```text
Can't issue ID_TOKEN for audience 'https://github.com/apps/cyspbot'
```

## Evidence base

Authoritative documentation establishes the public contract:

- GitHub's OIDC reference says the default `aud` is the repository owner URL and
  a custom audience can be set with `core.getIDToken(audience)`:
  <https://docs.github.com/en/actions/reference/security/oidc>
- GitHub's cloud-provider OIDC guide says custom code can request the token via
  the Actions core toolkit or via `ACTIONS_ID_TOKEN_REQUEST_URL` and
  `ACTIONS_ID_TOKEN_REQUEST_TOKEN`:
  <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers>
- `@actions/core` documents `getIDToken(audience)` and currently URL-encodes the
  audience with `encodeURIComponent` before appending it to the request URL:
  <https://github.com/actions/toolkit/tree/main/packages/core>
- The OIDC discovery document lists supported claims, including `aud`, but does
  not describe validation syntax for custom audiences:
  <https://token.actions.githubusercontent.com/.well-known/openid-configuration>

The documentation confirms that custom audiences exist, but it does not publish
GitHub's issuer-side allowlist for audience values containing `github.com`. The
findings below come from GitHub-hosted Actions runs recorded in
`OBSERVATIONS.md`.

## Conclusion

Do not use `https://github.com/apps/cyspbot` as the GitHub Actions OIDC
audience. In these experiments, GitHub rejected it in every tested request mode
and trigger because the first case-insensitive `github.com` occurrence is
followed by `/apps/cyspbot`, which is outside the issuer's observed allowlist.

Use a non-`github.com` audience for a GitHub-App-specific relying party. These
were accepted:

- `urn:github:app:cyspbot`
- `api://cyspbot`
- `cyspbot`

## Findings

### 1. Audiences without `github.com` are broadly allowed

If the audience does not contain the case-insensitive substring `github.com`,
GitHub accepted a wide range of strings, URL forms, schemes, punctuation,
Unicode, control characters, and long values.

Observed accepted examples:

- Plain names: `cyspbot`
- URI-like values: `urn:github:app:cyspbot`, `api://cyspbot`
- Cloud-provider values: `api://AzureADTokenExchange`, `sts.amazonaws.com`
- Generic URLs: `https://example.com`, `https://example.com/apps/cyspbot`
- Unicode: `café`, `対象`, `audience-😀`
- JSON-looking strings: `["cyspbot","api://cyspbot"]`, `{"aud":"cyspbot"}`
- Invalid-percent-looking strings: `bad%zzescape`, `bad%`
- Long values: 4096, 8192, and 16384 character non-`github.com` strings
- Whitespace/control values in toolkit-compatible request modes: single space,
  tab, newline, CRLF, NUL, and embedded control characters

Relevant runs:

- Run 1, broad matrix: `28625018353`
- Run 9, generic character and length boundaries: `28631801514`
- Run 15, empty, whitespace-only, and control-only audiences: `28645827067`

### 2. Empty audience is not a literal empty `aud`

Omitting the audience and sending an explicit empty audience both returned the
documented default owner audience.

Observed accepted examples:

- No `audience` query parameter: returned `aud` of `https://github.com/cysp`
- Explicit empty audience: returned `aud` of `https://github.com/cysp`

Non-empty whitespace and control audiences were different: encoded request modes
returned the literal whitespace/control value as `aud`.

Relevant run:

- Run 15: `28645827067`

### 3. `github.com` triggers special issuer validation

When the audience contains `github.com` case-insensitively, GitHub does not
treat the value like an arbitrary string. It validates the suffix beginning at
the first `github.com` occurrence.

Observed accepted examples:

- `github.com`
- `GITHUB.com`
- `GitHub.com`
- `https://github.com`
- `https://github.com/`
- `https://github.com/cysp`
- `https://github.com/cysp/github-actions-id-token-exploration`

Observed rejected examples:

- `prefix github.com suffix`
- `https://github.com/apps/cyspbot`
- `GITHUB.com/apps/cyspbot`
- `prefix GITHUB.com/apps/cyspbot suffix`
- `https://github.com/apps/cyspbot,https://github.com/cysp`
- `https://example.com/github.com/apps/cyspbot,https://github.com/cysp`

Later accepted GitHub text did not rescue an earlier rejected suffix. Later
rejected GitHub text did not fail an audience once the first suffix was already
under an accepted current-repository path.

Observed accepted later-`github.com` examples:

- `https://github.com/cysp/github-actions-id-token-exploration/path/github.com/apps/cyspbot`
- `https://github.com/cysp/github-actions-id-token-exploration/issues?next=https://github.com/apps/cyspbot`

Relevant runs:

- Run 4, substring and delimiter probes: `28630772842`
- Run 6, casing and `api.github.com` probes: `28631081747`
- Run 10, multiple `github.com` occurrences: `28632090942`

### 4. Accepted `github.com` suffixes are narrow

The observed accepted `github.com` suffixes are:

- GitHub root: `github.com`, `github.com/`
- Current owner endpoint: `github.com/cysp`, `github.com/cysp/`
- Current repository endpoint:
  `github.com/cysp/github-actions-id-token-exploration`,
  `github.com/cysp/github-actions-id-token-exploration/`
- Paths below the current repository prefix:
  `github.com/cysp/github-actions-id-token-exploration/...`

Observed accepted examples:

- `https://github.com`
- `https://github.com/`
- `https://github.com/cysp`
- `http://github.com/cysp`
- `https://GITHUB.com/cysp`
- `https://github.com/cysp/github-actions-id-token-exploration`
- `https://github.com/cysp/github-actions-id-token-exploration/issues`
- `https://github.com/cysp/github-actions-id-token-exploration/settings`
- `https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018353`

Observed rejected examples:

- `https://github.com/chikachow`
- `https://github.com/actions`
- `https://github.com/octo-org`
- `https://github.com/cyspbot`
- `https://github.com/cysp/actions`
- `https://github.com/cysp/repositories`
- `https://github.com/cysp/terraform-provider-contentful`
- `https://github.com/orgs/cysp`
- `https://github.com/users/cysp`

Relevant runs:

- Run 1: `28625018353`
- Run 2, GitHub path and substring probes: `28630521128`
- Run 14, root and owner suffix boundaries: `28640606521`

### 5. Root and owner endpoints are exact; repository is a prefix

GitHub root and current-owner suffixes are accepted only as exact endpoints with
an optional trailing slash. They do not accept arbitrary child paths. The current
repository suffix does accept slash-prefixed child paths.

Observed accepted examples:

- `https://github.com`
- `https://github.com/`
- `https://github.com/cysp`
- `https://github.com/cysp/`
- `https://github.com/cysp/github-actions-id-token-exploration/.`
- `https://github.com/cysp/github-actions-id-token-exploration/;param=1`
- `https://github.com/cysp/github-actions-id-token-exploration/ extra`

Observed rejected examples:

- `https://github.com/.`
- `https://github.com/ extra`
- `https://github.com/cysp.`
- `https://github.com/cysp-extra`
- `https://github.com/cysp/;param=1`
- `https://github.com/cysp/ extra`
- `https://github.com/cysp/github-actions-id-token-exploration-extra`
- `https://github.com/cysp/github-actions-id-token-exploration extra`

Relevant runs:

- Run 13, current repository suffix boundaries: `28635330282`
- Run 14: `28640606521`

### 6. Query and fragment handling is repository-specific

Query and fragment text was accepted under the current repository prefix only
when there was a path boundary before the delimiter. Root and owner
query/fragment forms were rejected.

Observed accepted examples:

- `https://github.com/cysp/github-actions-id-token-exploration/?tab=readme`
- `github.com/cysp/github-actions-id-token-exploration/?tab=readme`
- `https://github.com/cysp/github-actions-id-token-exploration/#readme`
- `https://github.com/cysp/github-actions-id-token-exploration/tree/main?plain=1`
- `https://github.com/cysp/github-actions-id-token-exploration/issues#created-by-me`

Observed rejected examples:

- `https://github.com/?x=1`
- `github.com/?x=1`
- `https://github.com/cysp/?tab=repositories`
- `github.com/cysp/#profile`
- `https://github.com/cysp/github-actions-id-token-exploration?tab=readme`
- `https://github.com/apps/cyspbot/?installation_id=1`
- `https://github.com/apps/cyspbot/#oidc`

Relevant runs:

- Run 3, host-boundary and query probes: `28630633476`
- Run 4: `28630772842`
- Run 11, query and fragment boundaries: `28632399276`

### 7. GitHub App URL audiences are disallowed

All tested top-level GitHub App URL forms were rejected.

Observed rejected examples:

- `https://github.com/apps`
- `https://github.com/apps/cyspbot`
- `github.com/apps/cyspbot`
- `http://github.com/apps/cyspbot`
- `https://GITHUB.com/apps/cyspbot`
- `https://github.com/apps/cyspbot/`
- `https://github.com/apps/cyspbot?installation_id=1`
- `https://github.com/apps/cyspbot#oidc`
- `https://github.com/apps/cyspbot/installations/new`
- `https://github.com/%61pps/cyspbot`
- `https://github.com/a%70ps/cyspbot`
- `https://github.com/apps%2Fcyspbot`
- `https://github.com//apps/cyspbot`

The `/apps/cyspbot` path itself is not globally disallowed. It was accepted on
non-`github.com` audiences.

Observed accepted examples:

- `https://example.com/apps/cyspbot`
- `https://github.example.com/apps/cyspbot`

Relevant runs:

- Run 1: `28625018353`
- Run 2: `28630521128`
- Run 12, dispatch trigger check: `28633390811`

### 8. Host parsing is substring-oriented, not URL-host-only

The issuer is affected by `github.com` appearing inside a larger hostname or
elsewhere in the audience string. This means values that are not actually hosted
at `github.com` can still be rejected.

Observed rejected examples:

- `https://github.com.example.com`
- `https://github.com.example.com/other`
- `https://github.com.example.com/cysp`
- `https://notgithub.com/apps/cyspbot`
- `https://github.com.au/apps/cyspbot`
- `https://github.comm/apps/cyspbot`
- `https://foo.github.com/apps/cyspbot`
- `https://example.com/path?next=https://github.com/apps/cyspbot`

Observed accepted examples:

- `https://notgithub.com`
- `https://notgithub.com/cysp`
- `https://mygithub.org/apps/cyspbot`
- `https://raw.githubusercontent.com/apps/cyspbot`

Relevant runs:

- Run 3: `28630633476`
- Run 4: `28630772842`

### 9. `api.github.com` follows the same substring rule

No separate API-host rule is needed to explain the results. `api.github.com`
contains `github.com`, and behavior matched validation of the suffix beginning
at that embedded substring.

Observed accepted examples:

- `https://api.github.com`
- `https://api.github.com/`
- `api.github.com`
- `https://api.github.com/cysp`
- `https://api.github.com/cysp/github-actions-id-token-exploration`

Observed rejected examples:

- `https://api.github.com/app`
- `https://api.github.com/repos/cysp/github-actions-id-token-exploration`
- `https://api.github.com/apps/cyspbot`
- `https://api.github.com.example.com`
- `https://example.com/api.github.com/app`

Relevant runs:

- Run 3: `28630633476`
- Run 6: `28631081747`

### 10. Encoding and raw request mode can change what GitHub receives

Toolkit-compatible modes are authoritative for real `@actions/core` usage
because `getIDToken(audience)` URL-encodes the audience before appending it to
the request URL. Raw mode was useful diagnostically but sometimes changed the
literal audience GitHub received.

Observed accepted examples in toolkit-compatible modes:

- `https://gith%75b.com/apps/cyspbot`
- `https://%67ithub.com/apps/cyspbot`
- `gith%75b.com/apps/cyspbot`

Those same encoded-host values were rejected in raw mode because the request URL
parser decoded `%xx` before GitHub saw the audience.

Other raw-mode caveats observed:

- Unencoded `#` was interpreted as a URL fragment and was not sent as part of
  the `audience` query value.
- Semicolon-containing raw values could return a truncated `aud`, such as
  `https://github.com/cysp` instead of the literal requested value.
- Raw whitespace-only values could collapse to the default owner audience.

Relevant runs:

- Run 3: `28630633476`
- Run 7, path normalization probes: `28631316360`
- Run 8, host canonicalization probes: `28631604572`
- Run 13: `28635330282`
- Run 15: `28645827067`

### 11. URL normalization is limited

The issuer appears to use string or prefix matching rather than full URL
canonicalization.

Observed rejected examples:

- `https://github.com:443`
- `https://github.com:443/cysp`
- `https://github.com:443/cysp/github-actions-id-token-exploration`
- `https://github.com./cysp`
- `https://github.com./apps/cyspbot`
- `https://github.com/cysp//github-actions-id-token-exploration`
- `https://github.com/cysp/./github-actions-id-token-exploration`
- `https://github.com/c%79sp/github-actions-id-token-exploration`
- `https://github.com/cysp/github-actions-id-token-%65xploration`
- `https://github.com/cysp%2Fgithub-actions-id-token-exploration`

Observed accepted examples:

- `ftp://github.com/cysp`
- `ssh://github.com/cysp`
- `ssh://github.com/cysp/github-actions-id-token-exploration`
- `https://token@github.com/cysp`
- `https://github.com/cysp/github-actions-id-token-exploration/../apps/cyspbot`
- `https://github.com/cysp/github-actions-id-token-exploration/%2E%2E/apps/cyspbot`

Interpretation: schemes and userinfo did not matter once the suffix beginning at
`github.com` matched an accepted form. Ports, trailing-dot hostnames, duplicate
slashes before the repository name, dot segments before the repository name, and
percent-encoded owner/repository characters were not normalized into accepted
forms. Traversal-like path text below the accepted repository prefix was still
accepted.

Relevant runs:

- Run 7: `28631316360`
- Run 8: `28631604572`

### 12. Git remote syntaxes are rejected

Common Git remote URL syntaxes were not accepted as OIDC audiences.

Observed rejected examples:

- `git@github.com:cysp/github-actions-id-token-exploration.git`
- `ssh://git@github.com/cysp/github-actions-id-token-exploration.git`
- `git://github.com/cysp/github-actions-id-token-exploration.git`
- `git+ssh://git@github.com/cysp/github-actions-id-token-exploration.git`
- `git@github.com:apps/cyspbot.git`

Use an HTTPS-style current owner or current repository audience if a GitHub
repository URL is required.

Relevant run:

- Run 6: `28631081747`

### 13. Tested non-factors

The motivating failure was not explained by request mode, runner OS, workflow
trigger, reusable workflow use, or missing `id-token: write`.

Observed scenarios:

- Runner OS: Ubuntu, macOS, and Windows all returned the same broad-matrix
  totals in run 1: `182` accepted and `72` rejected.
- Request mode: `toolkit`, `urlsearchparams`, and `raw` all rejected
  `https://github.com/apps/cyspbot` in the initial focused runs.
- Trigger: push and `workflow_dispatch` focused runs both returned `21`
  accepted and `18` rejected with `0` outcome differences.
- Permissions: without `id-token: write`, token-request variables were absent;
  with the permission, audience value controlled issuer acceptance.
- Local runner: `act` can validate workflow control flow but cannot prove
  GitHub issuer-side audience behavior because it does not receive GitHub's
  real `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`.

Relevant runs:

- Run 1 matrix/focused/permission/reusable runs:
  `28625018353`, `28625018334`, `28625018378`, `28625018460`
- Run 12 dispatch comparison: `28633390811` compared with `28632505925`

## Practical guidance

For a GitHub-App-specific relying party, use an audience that avoids the
case-insensitive substring `github.com`.

Recommended form:

```text
urn:github:app:cyspbot
```

Other observed-valid forms:

```text
api://cyspbot
cyspbot
```

Avoid these forms:

```text
https://github.com/apps/cyspbot
github.com/apps/cyspbot
https://api.github.com/apps/cyspbot
```

Relying parties should compare `aud` as an exact expected string. Do not rely on
URL normalization to make a received audience equivalent to the intended value.

## Residual caveats

These observations are for
`cysp/github-actions-id-token-exploration` on GitHub-hosted Actions runners.
GitHub can change undocumented issuer validation behavior. The experiments show
the observed issuer boundary but do not prove behavior for every owner,
repository, organization policy, enterprise setting, or future GitHub release.
