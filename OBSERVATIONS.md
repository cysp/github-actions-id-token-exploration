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

Run 2 should test:

- Whether arbitrary current-repository subpaths are accepted.
- Whether arbitrary current-owner subpaths are accepted.
- Whether rejection is tied to top-level GitHub reserved paths.
- Whether `/apps/cyspbot` is accepted on non-GitHub domains.
- Whether an otherwise plain string is rejected merely because it contains the
  exact GitHub App URL as a substring.
- Whether encoded `/apps` variants are decoded before validation.
- Whether comma or space separated values are rejected only when they contain a
  rejected GitHub URL.

## Run 2: targeted GitHub path and substring probes

Commit: `4e1dc3b`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28630521128>

Summary: `36` accepted, `54` rejected.

### High-confidence observations

- Arbitrary current-repository subpaths were accepted:
  - `https://github.com/cysp/github-actions-id-token-exploration/issues`
  - `https://github.com/cysp/github-actions-id-token-exploration/pulls`
  - `https://github.com/cysp/github-actions-id-token-exploration/actions`
  - `https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28625018353`
  - `https://github.com/cysp/github-actions-id-token-exploration/settings`
- Current-owner paths that are not the repository name were rejected:
  - `https://github.com/cysp/apps/cyspbot`
  - `https://github.com/cysp/actions`
  - `https://github.com/cysp/repositories`
- Top-level GitHub reserved paths were rejected:
  - `https://github.com/marketplace`
  - `https://github.com/login`
  - `https://github.com/settings`
  - `https://github.com/new`
  - `https://github.com/features`
  - `https://github.com/enterprise`
- Encoded `/apps/cyspbot` variants under `github.com` were rejected:
  - `https://github.com/%61pps/cyspbot`
  - `https://github.com/a%70ps/cyspbot`
  - `https://github.com/apps%2Fcyspbot`
  - `https://github.com//apps/cyspbot`
- The rejected GitHub App URL was also rejected when embedded in larger strings:
  - `["https://github.com/apps/cyspbot"]`
  - `prefix:https://github.com/apps/cyspbot`
  - `https://github.com/apps/cyspbot:suffix`
  - `(https://github.com/apps/cyspbot)`
- The `/apps/cyspbot` path itself is not globally rejected. These non-GitHub
  URLs were accepted:
  - `https://example.com/apps/cyspbot`
  - `https://github.example.com/apps/cyspbot`
- Separator characters alone are not rejected. These were accepted:
  - `cyspbot,api://cyspbot`
  - `cyspbot,https://example.com/apps/cyspbot`
  - `cyspbot api://cyspbot`
  - `cyspbot https://example.com/apps/cyspbot`
- Surprising result: `https://github.com.example.com/apps/cyspbot` was rejected.
  That is not the `github.com` host, so follow-up should determine whether the
  issuer is doing substring matching, suffix matching, URL parser canonicalizing,
  or another host/path heuristic.

## Refined hypotheses after run 2

1. `github.com/{owner}/{repo}` for the current repository is accepted as a
   prefix, with arbitrary additional path segments.
2. `github.com/{owner}` for the current owner is accepted only as that owner URL,
   with optional trailing slash and scheme/host case variation. Arbitrary
   subpaths below the owner are rejected unless the next path segment is the
   current repository name.
3. Top-level `github.com` paths are rejected unless the path is empty or matches
   the current owner/repository rule.
4. The issuer appears to detect rejected GitHub App URLs even when embedded
   inside larger strings.
5. Host-boundary handling is not fully understood because
   `github.com.example.com` was rejected while `github.example.com` was accepted.

## Next probes

Run 3 should test:

- Whether hostnames containing `github.com` as a prefix, suffix, or label are
  rejected only with `/apps/cyspbot` or more generally.
- Whether `github.com` substring detection applies without a URL scheme.
- Whether current repository query strings and fragments are accepted or
  rejected.
- Whether current repository paths with a `.git` segment under the accepted repo
  prefix are accepted.
- Whether `api.github.com` rejection is host-specific or path-specific.

## Run 3: host-boundary and query probes

Commit: `9190cd1`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28630633476>

Summary: `16` accepted, `41` rejected.

### High-confidence observations

- `api.github.com` root is accepted, but API resource paths are rejected:
  - accepted: `https://api.github.com`
  - accepted: `https://api.github.com/`
  - rejected: `https://api.github.com/repos/cysp/github-actions-id-token-exploration`
- The issuer appears to treat `github.com` as a special substring, not just as a
  URL hostname. These were rejected:
  - `https://github.com.example.com`
  - `https://github.com.example.com/other`
  - `https://github.com.example.com/cysp`
  - `https://notgithub.com/apps/cyspbot`
  - `https://github.com.au/apps/cyspbot`
  - `https://github.comm/apps/cyspbot`
  - `https://foo.github.com/apps/cyspbot`
- A GitHub-owned domain that does not contain the literal substring
  `github.com` was accepted:
  - `https://raw.githubusercontent.com/apps/cyspbot`
- Current repository query and fragment handling is mixed:
  - rejected: `https://github.com/cysp/github-actions-id-token-exploration?tab=readme`
  - rejected in encoded modes: `https://github.com/cysp/github-actions-id-token-exploration#readme`
  - accepted: `https://github.com/cysp/github-actions-id-token-exploration/issues?q=is%3Aissue`
  - accepted: `https://github.com/cysp/github-actions-id-token-exploration/.git`
- Raw mode accepted the fragment case because an unencoded `#` is interpreted as
  a URL fragment in the request URL and is not sent as part of the `audience`
  query parameter. Treat `toolkit` and `urlsearchparams` as authoritative for
  literal audience values containing `#`.
- Embedding otherwise accepted GitHub URLs in a larger string caused rejection:
  - `prefix https://github.com/cysp suffix`
  - `prefix https://github.com/cysp/github-actions-id-token-exploration suffix`

## Refined hypotheses after run 3

1. If the audience contains the literal substring `github.com`, GitHub applies a
   special allowlist rather than treating it as an arbitrary string.
2. Accepted `github.com` forms currently observed are:
   - `https://github.com`
   - `https://github.com/`
   - the current owner URL with optional trailing slash and scheme/host case
     variation
   - the current repository URL and arbitrary subpaths under it
3. The accepted `github.com` form probably must be the whole audience value.
   Adding prefix/suffix text causes rejection.
4. Query strings at the current repository root are rejected, while query strings
   below a current-repository subpath may be accepted. This needs a smaller
   follow-up set.
5. `api.github.com` root is allowed, while API resource paths are not.

## Next probes

Run 4 should test:

- Bare `github.com` values without a scheme.
- `github.com` substring values without `/apps/cyspbot`.
- Domains that contain `github.com` as text but are otherwise unrelated.
- Query and fragment behavior at current repository root, trailing slash, and
  subpaths.
- Whether the current repository URL can be embedded with punctuation that might
  be parsed as a delimiter.

## Run 4: substring and delimiter probes

Commit: `ddf778d`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28630772842>

Summary: `33` accepted, `15` rejected.

### High-confidence observations

- Bare `github.com` forms are accepted if they match an already accepted suffix:
  - `github.com`
  - `github.com/`
  - `github.com/cysp`
  - `github.com/cysp/github-actions-id-token-exploration`
- A bare embedded `github.com` with extra text is rejected:
  - `prefix github.com suffix`
- The `github.com` substring rule explains earlier surprising host-boundary
  behavior:
  - accepted: `https://notgithub.com`
  - rejected: `https://notgithub.com/other`
  - accepted: `https://notgithub.com/cysp`
  - accepted: `https://mygithub.org/apps/cyspbot`
- This strongly suggests GitHub is not only parsing the URL hostname. Instead,
  the issuer appears to search for literal `github.com` inside the complete
  audience string and validate the suffix beginning at that substring.
- The substring can appear in path or query and still trigger rejection:
  - `https://example.com/github.com/apps/cyspbot`
  - `https://example.com/path?next=https://github.com/apps/cyspbot`
- Current repository query behavior is now clearer:
  - accepted: `https://github.com/cysp/github-actions-id-token-exploration/?tab=readme`
  - accepted: `https://github.com/cysp/github-actions-id-token-exploration/tree/main?plain=1`
  - accepted: `https://github.com/cysp/github-actions-id-token-exploration/issues#created-by-me`
  - previously rejected: `https://github.com/cysp/github-actions-id-token-exploration?tab=readme`
- Embedded current repository URL behavior depends on delimiter:
  - rejected: `(https://github.com/cysp/github-actions-id-token-exploration)`
  - accepted: `cyspbot,https://github.com/cysp/github-actions-id-token-exploration`

## Refined hypotheses after run 4

1. The issuer scans the full audience string for the literal substring
   `github.com`.
2. If `github.com` is present, the suffix beginning at `github.com` must match a
   GitHub-specific allowlist. Observed allowed suffixes include:
   - `github.com`
   - `github.com/`
   - `github.com/cysp`
   - `github.com/cysp/`
   - `github.com/cysp/github-actions-id-token-exploration`
   - `github.com/cysp/github-actions-id-token-exploration/`
   - subpaths under `github.com/cysp/github-actions-id-token-exploration/`
3. The current repository root with query but no slash before `?` is rejected;
   the same root with `/?` is accepted.
4. Comma may act as a delimiter between independently validated audience-looking
   values. Space and parentheses do not appear to act as safe delimiters.

## Next probes

Run 5 should test:

- Delimiters after otherwise accepted `github.com` suffixes: `?`, `#`, `:`,
  comma, space, and closing punctuation.
- Comma-separated values where one item is a valid GitHub owner/repo URL.
- Whether comma-separated values are accepted only when every GitHub-containing
  item satisfies the allowlist.

## Run 5: delimiter and comma-list probes

Commit: `00ea855`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28630856826>

Summary: `7` accepted, `29` rejected.

### High-confidence observations

- Delimiters immediately after otherwise accepted bare `github.com` suffixes are
  rejected:
  - `github.com?x=1`
  - `github.com#fragment` in encoded modes
  - `github.com:443`
  - `github.com,cyspbot`
  - `github.com/cysp?tab=repositories`
  - `github.com/cysp,cyspbot`
  - `github.com/cysp/github-actions-id-token-exploration,cyspbot`
  - `github.com/cysp/github-actions-id-token-exploration)`
- Raw mode again accepted the fragment case only because unencoded `#` is not
  sent as part of the `audience` query parameter. Encoded modes are
  authoritative for literal `#`.
- Comma is not a general delimiter after a GitHub substring. If the first
  `github.com` occurrence is followed by comma and more text, the value is
  rejected.
- A valid GitHub URL may appear after a non-GitHub prefix and comma if it is the
  final GitHub-containing suffix:
  - `cyspbot,https://github.com/cysp`
  - `cyspbot,https://github.com`
- Comma-separated values are rejected when the first `github.com` suffix includes
  a later rejected GitHub URL:
  - `cyspbot,https://github.com/actions`
  - `https://github.com/cysp,https://github.com/apps/cyspbot`

## Current model

This is the best model supported by the current evidence:

1. For audiences that do not contain the literal substring `github.com` and do
   not use `api.github.com` resource paths, GitHub accepts a very broad set of
   arbitrary strings, URL forms, schemes, punctuation, whitespace, and long
   values.
2. If the audience contains the literal substring `github.com`, GitHub appears
   to validate the suffix beginning at the first `github.com` occurrence.
3. The observed accepted `github.com` suffixes are:
   - `github.com`
   - `github.com/`
   - `github.com/cysp`
   - `github.com/cysp/`
   - `github.com/cysp/github-actions-id-token-exploration`
   - `github.com/cysp/github-actions-id-token-exploration/`
   - paths under `github.com/cysp/github-actions-id-token-exploration/`
4. The suffix must consume the rest of the audience, except that normal URL
   query/fragment syntax is accepted under subpaths of the current repository.
   Query at the repository root without a trailing slash is rejected, while
   `...?` under a subpath and `.../?` at the root are accepted.
5. The top-level GitHub App URL `github.com/apps/cyspbot` is outside the
   allowlist and is rejected in every tested form.
6. The issuer's validation is substring-oriented enough that these non-GitHub
   hostnames are still affected when they contain `github.com`:
   - `notgithub.com`
   - `github.com.example.com`
   - `github.com.au`
   - `github.comm`
   - `foo.github.com`
7. `api.github.com` root is accepted, but resource paths under `api.github.com`
   are rejected.

## Practical conclusion

Do not use `https://github.com/apps/cyspbot` as the OIDC audience. It is in a
GitHub-reserved URL namespace that the issuer rejects before the token reaches
the relying party.

Supported GitHub-App-specific audience shapes observed so far include:

- `cyspbot`
- `api://cyspbot`
- `urn:github:app:cyspbot`

Of these, `urn:github:app:cyspbot` is the most explicit non-URL shape, while
`api://cyspbot` follows a commonly accepted audience URI pattern.

## Remaining questions

- Whether GitHub documents or will confirm this `github.com` substring allowlist
  behavior.
- Whether the allowlist is exactly tied to the current repository owner and
  repository, or whether enterprise/org settings can alter it.
- Whether `github.com` substring handling is intentional or an implementation
  side effect.
