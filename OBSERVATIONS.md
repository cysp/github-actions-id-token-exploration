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

## Public documentation reviewed

- GitHub's OIDC reference says the default `aud` claim is the repository owner
  URL and that a custom audience can be set with `core.getIDToken(audience)`:
  <https://docs.github.com/en/actions/reference/security/oidc>
- GitHub's cloud-provider OIDC guide says workflows can request the JWT via the
  Actions core toolkit or by calling the URL in
  `ACTIONS_ID_TOKEN_REQUEST_URL`:
  <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers>
- The public OIDC discovery document lists `aud` as a supported claim but does
  not describe custom audience syntax constraints:
  <https://token.actions.githubusercontent.com/.well-known/openid-configuration>
- The `@actions/core` documentation describes `audience` as an optional
  `getIDToken()` input, but does not document a validation allowlist:
  <https://github.com/actions/toolkit/tree/main/packages/core>
- GitHub issue search on 2026-07-03 for the exact rejection text
  `Can't issue ID_TOKEN for audience`, for `ID_TOKEN for audience`
  `github.com/apps`, and for `core.getIDToken audience github.com` did not find
  relevant reported issues.

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

1. For audiences that do not contain the case-insensitive substring `github.com`,
   GitHub accepts a very broad set of arbitrary strings, URL forms, schemes,
   punctuation, whitespace, control characters, Unicode, and long values.
2. If the audience contains `github.com` case-insensitively, GitHub validates
   the suffix beginning at the first `github.com` occurrence. Later valid
   GitHub URL text does not rescue an earlier rejected suffix.
3. The observed accepted `github.com` suffixes are:
   - `github.com`
   - `github.com/`
   - `github.com/cysp`
   - `github.com/cysp/`
   - `github.com/cysp/github-actions-id-token-exploration`
   - `github.com/cysp/github-actions-id-token-exploration/`
   - paths under `github.com/cysp/github-actions-id-token-exploration/`
   GitHub root and current-owner suffixes are exact endpoint forms; unlike the
   current-repository prefix, they do not accept arbitrary slash-prefixed
   subpaths.
4. The suffix must consume the rest of the audience, except that normal URL
   query/fragment syntax is accepted under the current repository prefix.
   Query/fragment after GitHub root or current-owner suffixes is rejected even
   with an explicit trailing slash. Query/fragment at the repository root is
   accepted with a trailing slash before the delimiter and rejected without that
   slash. Punctuation or whitespace immediately after root, current owner, or
   current repository accepted suffixes is rejected unless the suffix is already
   under the current repository path with a slash before the extra text.
5. The top-level GitHub App URL `github.com/apps/cyspbot` is outside the
   allowlist and is rejected in every tested form.
6. The issuer's validation is substring-oriented enough that these non-GitHub
   hostnames are still affected when they contain `github.com`:
   - `notgithub.com`
   - `github.com.example.com`
   - `github.com.au`
   - `github.comm`
   - `foo.github.com`
7. `api.github.com` does not need a separate rule to explain the evidence. Its
   behavior matches the `github.com` suffix rule because `api.github.com`
   contains `github.com`.
8. Git remote syntaxes are rejected; use HTTPS-style current owner/repository
   forms if a GitHub repository URL audience is needed.
9. The issuer appears to apply prefix-style string matching to paths below the
   current repository. It does not normalize `..` segments out of accepted
   repository subpaths before issuance, and it does not scan later
   `github.com/apps/...` text once the first `github.com` suffix is under an
   accepted current-repository subpath.
10. Treat `toolkit` and `urlsearchparams` as authoritative for literal audience
   values containing `%` or `#`. The `raw` mode is useful only to distinguish URL
   transport decoding behavior. Run 13 also showed raw-mode semicolon behavior
   that can alter the value GitHub receives, so encoded modes are authoritative
   for literal `;` values too.
11. URL schemes and userinfo do not appear to matter once the suffix beginning
    at `github.com` is otherwise accepted. Ports and trailing-dot hostnames are
    not canonicalized into accepted forms.
12. Percent-encoding characters inside `github.com` hides the substring in
    toolkit-compatible request modes. Raw mode decodes those values before
    GitHub sees the audience and can therefore reject values that encoded modes
    accept.
13. For the cyspbot-focused audience set, `push` and `workflow_dispatch`
    produced identical issuer outcomes. Current evidence does not show event
    trigger type as a factor.

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

## Next probes

Run 6 should test:

- Whether `github.com` substring matching is case-sensitive when the value is not
  a normal URL that a parser can lowercase.
- Whether owner/repository path matching is case-sensitive.
- Whether `api.github.com` behavior is actually explained by the same
  `github.com` substring rule.
- Whether common Git remote URL syntaxes are accepted or rejected.

## Run 6: casing, api.github.com, and Git URL probes

Commit: `a8182b1`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28631081747>

Summary: `21` accepted, `39` rejected.

### High-confidence observations

- `github.com` matching is case-insensitive:
  - accepted: `GITHUB.com`
  - accepted: `GitHub.com`
  - rejected: `GITHUB.com/apps/cyspbot`
  - rejected: `GitHub.com/apps/cyspbot`
  - rejected: `prefix GITHUB.com/apps/cyspbot suffix`
- Current owner/repository path matching is case-insensitive:
  - accepted: `https://github.com/CYSP`
  - accepted: `https://github.com/cysp/GITHUB-ACTIONS-ID-TOKEN-EXPLORATION`
- `api.github.com` behavior is consistent with the same suffix rule beginning at
  the embedded `github.com` substring:
  - accepted: `api.github.com`
  - rejected: `api.github.com/app`
  - accepted: `https://api.github.com/cysp`
  - accepted: `https://api.github.com/cysp/github-actions-id-token-exploration`
  - rejected: `https://api.github.com/apps/cyspbot`
  - rejected: `https://api.github.com.example.com`
  - rejected: `https://api.github.com.example.com/cysp`
  - rejected: `https://example.com/api.github.com/app`
- Common Git remote syntaxes were rejected:
  - `git@github.com:cysp/github-actions-id-token-exploration.git`
  - `ssh://git@github.com/cysp/github-actions-id-token-exploration.git`
  - `git://github.com/cysp/github-actions-id-token-exploration.git`
  - `git+ssh://git@github.com/cysp/github-actions-id-token-exploration.git`
  - `git@github.com:apps/cyspbot.git`

## Next probes

Run 7 should test:

- Whether percent-encoded owner/repository path characters are normalized before
  allowlist matching.
- Whether duplicate slashes and dot segments are normalized before allowlist
  matching.
- Whether traversal-like paths under the current repository can escape the
  accepted repository prefix.

## Run 7: path normalization probes

Commit: `17c1144`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28631316360>

Summary: `13` accepted, `17` rejected.

### High-confidence observations

- Literal percent-encoded owner/repository path characters are rejected in
  `toolkit` and `urlsearchparams` modes:
  - `https://github.com/c%79sp/github-actions-id-token-exploration`
  - `https://github.com/cysp/github-actions-id-token-%65xploration`
  - `https://github.com/cysp%2Fgithub-actions-id-token-exploration`
  - `https://github.com/cysp/github-actions-id-token-exploration%2Fsettings`
- The same percent-encoded values were accepted in `raw` mode because the raw
  request URL lets the query parser decode `%xx` before GitHub sees the audience
  string. For actual action/toolkit behavior, use the encoded modes as the
  authoritative result.
- Duplicate slash and dot segment before the repository name are rejected:
  - `https://github.com/cysp//github-actions-id-token-exploration`
  - `https://github.com/cysp/./github-actions-id-token-exploration`
- Traversal-like paths below the accepted current repository prefix are accepted:
  - `https://github.com/cysp/github-actions-id-token-exploration/../apps/cyspbot`
  - `https://github.com/cysp/github-actions-id-token-exploration/%2E%2E/apps/cyspbot`
  - `https://github.com/cysp/github-actions-id-token-exploration/%252E%252E/apps/cyspbot`
- Traversal-like path below only the owner prefix is rejected:
  - `https://github.com/cysp/../apps/cyspbot`

### Interpretation

The allowlist appears to be string/prefix based, not URL-normalization based.
Once the audience suffix is under the accepted current repository prefix,
additional path text is accepted even if a URL parser might later interpret that
text as a traversal. Relying parties should compare the `aud` value as an exact
string or with their own explicit canonicalization rules, not by normalizing it
as a URL after issuance.

## Next probes

Run 8 should test:

- Whether ports, userinfo, trailing-dot hostnames, or non-HTTP schemes are
  canonicalized before the `github.com` allowlist is applied.
- Whether percent-encoding characters inside `github.com` hides the substring or
  is decoded before matching.
- Whether SSH-like URLs without a `.git` suffix are accepted when their suffix
  otherwise matches the current owner/repository allowlist.

## Run 8: host canonicalization probes

Commit: `fc43780`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28631604572>

Summary: `21` accepted, `30` rejected.

### High-confidence observations

- Ports are not canonicalized into accepted GitHub forms, even default port 443:
  - rejected: `https://github.com:443`
  - rejected: `https://github.com:443/cysp`
  - rejected: `https://github.com:443/cysp/github-actions-id-token-exploration`
  - rejected: `https://github.com:8443/cysp/github-actions-id-token-exploration`
- Userinfo is accepted or rejected according to the same suffix rule:
  - accepted: `https://token@github.com/cysp`
  - rejected: `https://token@github.com/apps/cyspbot`
- Trailing-dot hostnames are rejected:
  - `https://github.com./cysp`
  - `https://github.com./apps/cyspbot`
- Scheme does not appear to matter:
  - accepted: `ftp://github.com/cysp`
  - accepted: `ssh://github.com/cysp`
  - accepted: `ssh://github.com/cysp/github-actions-id-token-exploration`
  - rejected: `ftp://github.com/apps/cyspbot`
  - rejected: `ssh://github.com/apps/cyspbot`
- Percent-encoding characters inside `github.com` prevents the special
  substring handling in toolkit-compatible request modes:
  - accepted in encoded modes: `https://gith%75b.com/apps/cyspbot`
  - accepted in encoded modes: `https://%67ithub.com/apps/cyspbot`
  - accepted in encoded modes: `gith%75b.com/apps/cyspbot`
- Raw mode rejected those encoded-host values because the raw request URL lets
  the query parser decode `%xx` before GitHub sees the audience. Encoded modes
  are the relevant result for real `@actions/core` usage.

## Next probes

Run 9 should test:

- Whether there is a practical maximum audience length above 2048 characters.
- Whether generic control characters, Unicode, invalid percent escapes, and
  JSON-looking values are accepted when they do not contain `github.com`.

## Run 9: generic character and length boundaries

Commit: `edb70d9`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28631801514>

Summary: `51` accepted, `0` rejected.

### High-confidence observations

- Generic Unicode values were accepted:
  - `café`
  - `対象`
  - `audience-😀`
- Generic control-character values were accepted:
  - NUL
  - carriage return
  - CRLF
  - DEL
- Invalid-percent-looking strings were accepted:
  - `bad%zzescape`
  - `bad%`
- JSON-looking values without `github.com` were accepted:
  - `["cyspbot","api://cyspbot"]`
  - `{"aud":"cyspbot"}`
- Long generic values were accepted at 4096, 8192, and 16384 characters for both
  plain `a...` strings and `https://example.com/...` URL-shaped strings.

### Interpretation

The issuer is extremely permissive for audience values that do not trigger the
case-insensitive `github.com` substring rule. The only rejection family observed
so far is the GitHub-specific allowlist behavior, not a general character,
encoding, JSON, control-character, or practical length restriction up to 16K
characters.

## Next probes

Run 10 should test:

- Whether the issuer validates only the first case-insensitive `github.com`
  occurrence, or whether a later accepted `github.com` suffix can rescue an
  earlier rejected one.
- Whether a later rejected GitHub App URL can make an otherwise accepted current
  repository subpath fail.
- Whether delimiters such as comma, space, newline, query, fragment, and
  JSON-looking punctuation change that multi-occurrence behavior.

## Run 10: multiple github.com occurrences

Commit: `90532a1`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28632090942>

Summary: `9` accepted, `33` rejected.

### High-confidence observations

- Later accepted GitHub owner/repository URLs did not rescue values whose first
  `github.com` suffix was rejected:
  - `https://github.com/apps/cyspbot,https://github.com/cysp`
  - `https://github.com/apps/cyspbot,https://github.com/cysp/github-actions-id-token-exploration`
  - `https://github.com/apps/cyspbot https://github.com/cysp`
  - `https://github.com/apps/cyspbot?next=https://github.com/cysp`
  - `https://github.com/apps/cyspbot#https://github.com/cysp/github-actions-id-token-exploration`
  - `https://example.com/github.com/apps/cyspbot,https://github.com/cysp`
- Later rejected GitHub App-looking text did not make accepted current-repository
  subpaths fail:
  - `https://github.com/cysp/github-actions-id-token-exploration/path/github.com/apps/cyspbot`
  - `https://github.com/cysp/github-actions-id-token-exploration/issues?next=https://github.com/apps/cyspbot`
  - `https://github.com/cysp/github-actions-id-token-exploration/issues#https://github.com/apps/cyspbot`
- Extra text after the accepted owner prefix is still rejected when the first
  suffix is not one of the accepted whole-owner forms:
  - `https://github.com/cysp\nhttps://github.com/apps/cyspbot`
  - `["https://github.com/cysp","https://github.com/apps/cyspbot"]`
- The current repository name must end at a path boundary or the end of the
  accepted suffix:
  - rejected: `https://github.com/cysp/github-actions-id-token-explorationgithub.com/apps/cyspbot`
- Raw mode again has a URL-fragment transport caveat. For
  `.../issues#https://github.com/apps/cyspbot`, the raw request mode only sent
  the pre-fragment audience to GitHub and the returned `aud` was
  `https://github.com/cysp/github-actions-id-token-exploration/issues`.

### Interpretation

The `github.com` validation rule is best modeled as first-occurrence suffix
validation, not as a scan for any acceptable GitHub URL and not as a scan that
rejects every later GitHub App-looking substring. If the suffix beginning at the
first case-insensitive `github.com` occurrence is accepted, later `github.com`
text under an accepted current-repository subpath can appear in the issued
`aud`. If that first suffix is rejected, later accepted owner/repository text
does not make issuance succeed.

## Next probes

Run 11 should test:

- Whether `?` and `#` are accepted after root, owner, and repository suffixes
  when there is an explicit trailing slash before the delimiter.
- Whether that behavior differs with or without a URL scheme.
- Whether a trailing slash before query/fragment changes the already rejected
  GitHub App URL family.
- Whether owner child paths remain rejected even when followed by query text.

## Run 11: query and fragment boundaries

Commit: `2f8e8aa`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28632399276>

Summary: `13` accepted, `32` rejected.

### High-confidence observations

- GitHub root query/fragment forms were rejected in the toolkit-compatible
  modes even with an explicit slash before the delimiter:
  - `https://github.com/?x=1`
  - `https://github.com/#fragment`
  - `github.com/?x=1`
  - `github.com/#fragment`
- Current-owner query/fragment forms were rejected in the toolkit-compatible
  modes even with an explicit slash before the delimiter:
  - `https://github.com/cysp/?tab=repositories`
  - `https://github.com/cysp/#profile`
  - `github.com/cysp/?tab=repositories`
  - `github.com/cysp/#profile`
- Current-repository query/fragment forms with a trailing slash were accepted:
  - `https://github.com/cysp/github-actions-id-token-exploration/#readme`
  - `github.com/cysp/github-actions-id-token-exploration/?tab=readme`
  - `github.com/cysp/github-actions-id-token-exploration/#readme`
- Adding a trailing slash before query/fragment did not make GitHub App URLs
  acceptable:
  - `https://github.com/apps/cyspbot/?installation_id=1`
  - `https://github.com/apps/cyspbot/#oidc`
- Current-owner child paths remain rejected, including with a slash before query
  text:
  - `https://github.com/cysp/actions?x=1`
  - `https://github.com/cysp/actions/?x=1`
- Raw mode accepted some `#fragment` cases because an unencoded fragment is not
  sent to the server as part of the HTTP request URL. For example, raw mode for
  `https://github.com/cysp/#profile` returned an `aud` of
  `https://github.com/cysp/`. Treat toolkit and `urlsearchparams` as the
  authoritative results for literal fragment-containing audiences.

### Interpretation

The query/fragment exception is tied to the current repository prefix, not to
all accepted GitHub suffixes. GitHub root and current-owner audiences must end
exactly at the accepted suffix or trailing slash. The current repository accepts
query/fragment text only when the suffix has a path boundary before the
delimiter, such as the repository trailing slash or a subpath.

## Run 12: workflow dispatch trigger check

Commit: `9f98550`

Runs:

- `workflow_dispatch` focused run: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28633390811>
- Compared push focused run: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28632505925>

Summary: both runs returned `21` accepted, `18` rejected, with `0` outcome
differences across the focused case/mode pairs.

### High-confidence observations

- The exact failing value was rejected in both push and `workflow_dispatch`:
  - `https://github.com/apps/cyspbot`
- Close GitHub App URL variants were also rejected in both trigger types:
  - `https://github.com/apps`
  - `https://github.com/apps/cyspbot/`
  - `https://github.com/apps/cyspbot?installation_id=1`
  - `https://github.com/apps/cyspbot#oidc`
  - `github.com/apps/cyspbot`
- Supported non-GitHub-App-specific values were accepted in both trigger types:
  - `cyspbot`
  - `api://cyspbot`
  - `urn:github:app:cyspbot`
  - `api://AzureADTokenExchange`
  - `sts.amazonaws.com`
- Current owner and repository GitHub URL values were accepted in both trigger
  types:
  - `https://github.com/cysp`
  - `https://github.com/cysp/github-actions-id-token-exploration`

### Interpretation

For the focused case set, the event trigger did not affect issuance behavior.
This supports the working conclusion that, after `id-token: write` makes the
request environment available, the audience string is the controlling factor for
these accept/reject decisions.

## Next probes

Run 13 should test:

- Whether the current repository suffix must end at the exact repository name,
  a slash, or a repository-root trailing slash before query/fragment.
- Whether punctuation or whitespace immediately after the current repository
  name is rejected when there is no path slash.
- Whether slash-prefixed punctuation or whitespace remains accepted because it
  is under the current repository path prefix.

## Run 13: current repository suffix boundaries

Commit: `7b3d186`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28635330282>

Summary: `10` accepted, `23` rejected.

### High-confidence observations

- Punctuation or whitespace immediately after the current repository name was
  rejected in toolkit-compatible modes when there was no slash before it:
  - `https://github.com/cysp/github-actions-id-token-exploration.`
  - `https://github.com/cysp/github-actions-id-token-exploration-extra`
  - `https://github.com/cysp/github-actions-id-token-exploration_extra`
  - `https://github.com/cysp/github-actions-id-token-exploration:extra`
  - `https://github.com/cysp/github-actions-id-token-exploration;param=1`
  - `https://github.com/cysp/github-actions-id-token-exploration@main`
  - `https://github.com/cysp/github-actions-id-token-exploration extra`
  - `https://github.com/cysp/github-actions-id-token-exploration\nextra`
- Slash-prefixed text under the current repository path was accepted:
  - `https://github.com/cysp/github-actions-id-token-exploration/.`
  - `https://github.com/cysp/github-actions-id-token-exploration/;param=1`
  - `https://github.com/cysp/github-actions-id-token-exploration/ extra`
- Raw mode produced transport artifacts for semicolon-containing values. For
  example, raw mode for
  `https://github.com/cysp/github-actions-id-token-exploration;param=1`
  returned an `aud` of `https://github.com/cysp`, which is not the literal value
  requested by toolkit-compatible modes. Treat toolkit and `urlsearchparams` as
  authoritative for literal semicolon-containing audiences.

### Interpretation

The accepted current repository suffix ends at the exact repository name, a
slash, or a repository-root trailing slash before query/fragment. The issuer
does not treat arbitrary punctuation or whitespace after the repository name as
a path boundary. Once a slash appears after the repository name, the issuer
continues to accept arbitrary subpath-looking text, including punctuation and
spaces.

## Next probes

Run 14 should test:

- Whether accepted GitHub root and current-owner suffixes are exact endpoints,
  unlike the current repository prefix.
- Whether punctuation or whitespace immediately after `github.com` or
  `github.com/cysp` is rejected.
- Whether slash-prefixed punctuation or whitespace after root or owner remains
  rejected rather than becoming an accepted subpath.

## Run 14: root and owner suffix boundaries

Commit: `2f6c23c`

Run:

- `OIDC audience targeted`: <https://github.com/cysp/github-actions-id-token-exploration/actions/runs/28640606521>

Summary: `2` accepted, `49` rejected. The two accepted rows were raw-mode
semicolon transport artifacts; all toolkit-compatible mode requests were
rejected.

### High-confidence observations

- Punctuation or whitespace immediately after GitHub root was rejected:
  - `https://github.com.`
  - `https://github.com-extra`
  - `https://github.com extra`
  - `https://github.com\nextra`
- Slash-prefixed extra text after GitHub root was rejected:
  - `https://github.com/.`
  - `https://github.com/ extra`
- Punctuation or whitespace immediately after the current owner was rejected:
  - `https://github.com/cysp.`
  - `https://github.com/cysp-extra`
  - `https://github.com/cysp_extra`
  - `https://github.com/cysp:extra`
  - `https://github.com/cysp;param=1`
  - `https://github.com/cysp@main`
  - `https://github.com/cysp extra`
  - `https://github.com/cysp\nextra`
- Slash-prefixed extra text after the current owner was rejected:
  - `https://github.com/cysp/.`
  - `https://github.com/cysp/;param=1`
  - `https://github.com/cysp/ extra`
- Raw mode accepted the semicolon-containing current-owner cases by returning
  an `aud` of `https://github.com/cysp`, not the literal audience requested by
  toolkit-compatible modes.

### Interpretation

The accepted GitHub root and current-owner suffixes are exact endpoint forms.
They do not behave like the current repository prefix: adding a slash and extra
path-looking text after root or owner remains rejected. This further narrows the
allowlist shape to exact root, exact owner, exact repository, and arbitrary
paths only under the current repository prefix.

## Next probes

Run 15 should test:

- Whether omitting the audience parameter differs from sending an explicit empty
  audience value.
- Whether whitespace-only and control-only audiences are accepted as literal
  custom audience values.
- Whether these boundary values behave consistently across toolkit-compatible
  request construction modes and raw mode.
