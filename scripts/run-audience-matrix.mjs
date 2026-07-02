#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
const casesPath = args.cases ?? 'scripts/audience-cases.json';
const outputDir = args.outputDir ?? 'oidc-audience-results';
const modes = (args.modes ?? 'toolkit').split(',').map((mode) => mode.trim()).filter(Boolean);
const allowedModes = new Set(['toolkit', 'urlsearchparams', 'raw']);
const caseFilter = args.caseRegex ? new RegExp(args.caseRegex) : null;
const allowMissingEnv = args.allowMissingEnv === 'true';
const failOnUnexpected = args.failOnUnexpected === 'true';
const requireAnyAccepted = args.requireAnyAccepted === 'true';
const requireNoAccepted = args.requireNoAccepted === 'true';
const includeCategories = new Set((args.categories ?? '').split(',').map((category) => category.trim()).filter(Boolean));
const excludeCategories = new Set((args.excludeCategories ?? '').split(',').map((category) => category.trim()).filter(Boolean));

if (modes.length === 0) {
  throw new Error('At least one request mode is required.');
}

for (const mode of modes) {
  if (!allowedModes.has(mode)) {
    throw new Error(`Unknown request mode: ${mode}. Allowed modes: ${[...allowedModes].join(', ')}.`);
  }
}

const cases = (await selectCases(args, casesPath))
  .filter((testCase) => !caseFilter || caseFilter.test(testCase.id))
  .filter((testCase) => includeCategories.size === 0 || includeCategories.has(testCase.category))
  .filter((testCase) => !excludeCategories.has(testCase.category));

if (cases.length === 0) {
  throw new Error('No audience cases matched the selected filters.');
}

await mkdir(outputDir, {recursive: true});

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const hasOidcEnv = Boolean(requestUrl && requestToken);

const startedAt = new Date();
const results = [];

if (!hasOidcEnv) {
  const missing = {
    ok: false,
    skipped: true,
    status: null,
    error: 'Missing ACTIONS_ID_TOKEN_REQUEST_URL or ACTIONS_ID_TOKEN_REQUEST_TOKEN.',
    mode: null
  };

  for (const testCase of cases) {
    results.push(toResult(testCase, missing));
  }

  await writeReports({outputDir, startedAt, cases, results, modes, hasOidcEnv});

  if (!allowMissingEnv) {
    process.exitCode = 1;
  }

  enforceAcceptanceRequirements(results);
} else {
  console.log(`Running ${cases.length} audience cases across modes: ${modes.join(', ')}`);

  for (const testCase of cases) {
    for (const mode of modesForCase(testCase, modes)) {
      const result = await requestIdToken({requestUrl, requestToken, testCase, mode});
      results.push(toResult(testCase, result));
      console.log(formatConsoleResult(results.at(-1)));
    }
  }

  await writeReports({outputDir, startedAt, cases, results, modes, hasOidcEnv});

  if (failOnUnexpected && results.some((result) => result.expectationMatched === false)) {
    process.exitCode = 1;
  }

  enforceAcceptanceRequirements(results);
}

function enforceAcceptanceRequirements(results) {
  const acceptedCount = results.filter((result) => result.outcome === 'accepted').length;

  if (requireAnyAccepted && acceptedCount === 0) {
    console.error('No audience request was accepted, but --requireAnyAccepted=true was set.');
    process.exitCode = 1;
  }

  if (requireNoAccepted && acceptedCount > 0) {
    console.error(`${acceptedCount} audience request(s) were accepted, but --requireNoAccepted=true was set.`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      parsed[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      parsed[withoutPrefix] = 'true';
      continue;
    }

    const next = argv[index + 1];
    parsed[withoutPrefix] = next;
    index += 1;
  }

  return parsed;
}

async function selectCases(parsedArgs, selectedCasesPath) {
  if ('singleAudience' in parsedArgs || parsedArgs.singleAudienceNull === 'true') {
    return [
      {
        id: parsedArgs.singleId ?? 'manual-audience',
        category: 'manual',
        audience: parsedArgs.singleAudienceNull === 'true' ? null : parsedArgs.singleAudience,
        why: 'Manual workflow_dispatch audience probe.'
      }
    ];
  }

  return expandCases(JSON.parse(await readFile(selectedCasesPath, 'utf8')));
}

function expandCases(raw) {
  const expanded = [...raw.cases];

  for (const generated of raw.generated ?? []) {
    for (const length of generated.lengths) {
      const prefix = generated.prefix ?? '';
      const repeatLength = Math.max(0, length - prefix.length);
      expanded.push({
        id: `${generated.idPrefix}-${length}`,
        category: generated.category,
        audience: `${prefix}${generated.char.repeat(repeatLength)}`,
        why: `${generated.why} Target length: ${length}.`
      });
    }
  }

  return expanded;
}

function modesForCase(testCase, selectedModes) {
  if (testCase.audience === null) {
    return selectedModes.filter((mode) => mode === 'toolkit' || mode === 'urlsearchparams');
  }

  return selectedModes;
}

async function requestIdToken({requestUrl, requestToken, testCase, mode}) {
  const start = Date.now();

  try {
    const url = buildTokenUrl({requestUrl, audience: testCase.audience, mode});
    const response = await fetch(url, {
      headers: {
        authorization: `bearer ${requestToken}`,
        accept: 'application/json'
      }
    });
    const responseText = await response.text();
    const elapsedMs = Date.now() - start;
    const body = parseJsonOrText(responseText);

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        mode,
        elapsedMs,
        response: sanitizeFailureBody(body)
      };
    }

    const token = body?.value;
    if (typeof token !== 'string' || token.length === 0) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        mode,
        elapsedMs,
        response: sanitizeFailureBody(body),
        error: 'Response did not include a non-empty value field.'
      };
    }

    mask(token);
    const decoded = decodeJwt(token);
    return {
      ok: true,
      skipped: false,
      status: response.status,
      mode,
      elapsedMs,
      tokenLength: token.length,
      header: decoded.header,
      claims: selectedClaims(decoded.payload)
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      status: null,
      mode,
      elapsedMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildTokenUrl({requestUrl, audience, mode}) {
  if (audience === null) {
    return requestUrl;
  }

  if (mode === 'toolkit') {
    return `${requestUrl}&audience=${encodeURIComponent(audience)}`;
  }

  if (mode === 'urlsearchparams') {
    const url = new URL(requestUrl);
    url.searchParams.append('audience', audience);
    return url.toString();
  }

  if (mode === 'raw') {
    return `${requestUrl}&audience=${audience}`;
  }

  throw new Error(`Unknown request mode: ${mode}.`);
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {text};
  }
}

function sanitizeFailureBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !['value', 'token'].includes(key.toLowerCase()))
  );
}

function decodeJwt(token) {
  const [encodedHeader, encodedPayload] = token.split('.');
  if (!encodedHeader || !encodedPayload) {
    throw new Error('Token does not have a JWT header and payload.');
  }

  return {
    header: JSON.parse(base64UrlDecode(encodedHeader)),
    payload: JSON.parse(base64UrlDecode(encodedPayload))
  };
}

function base64UrlDecode(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

function selectedClaims(payload) {
  const claimNames = [
    'iss',
    'aud',
    'sub',
    'repository',
    'repository_owner',
    'repository_id',
    'repository_owner_id',
    'workflow',
    'workflow_ref',
    'job_workflow_ref',
    'event_name',
    'ref',
    'runner_environment',
    'run_id',
    'run_attempt'
  ];

  return Object.fromEntries(claimNames.filter((name) => name in payload).map((name) => [name, payload[name]]));
}

function toResult(testCase, result) {
  const expected = testCase.expect ?? 'unknown';
  const outcome = result.skipped ? 'skipped' : result.ok ? 'accepted' : 'rejected';
  const expectationMatched = expected === 'unknown' ? null : expected === outcome;

  return {
    id: testCase.id,
    category: testCase.category,
    audience: testCase.audience,
    audienceLength: testCase.audience === null ? null : testCase.audience.length,
    mode: result.mode,
    outcome,
    status: result.status,
    ok: result.ok,
    skipped: result.skipped,
    elapsedMs: result.elapsedMs ?? null,
    expected,
    expectationMatched,
    why: testCase.why,
    claims: result.claims ?? null,
    tokenLength: result.tokenLength ?? null,
    response: result.response ?? null,
    error: result.error ?? null
  };
}

function formatConsoleResult(result) {
  const status = result.status === null ? '-' : result.status;
  const audience = result.audience === null ? '<default>' : result.audience;
  return `${result.outcome.toUpperCase()} status=${status} mode=${result.mode} id=${result.id} audience=${JSON.stringify(audience)}`;
}

async function writeReports({outputDir, startedAt, cases, results, modes, hasOidcEnv}) {
  const finishedAt = new Date();
  const report = {
    schema: 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    runner: {
      os: process.env.RUNNER_OS ?? null,
      arch: process.env.RUNNER_ARCH ?? null,
      environment: process.env.RUNNER_ENVIRONMENT ?? null,
      name: process.env.RUNNER_NAME ?? null
    },
    github: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      workflowRef: process.env.GITHUB_WORKFLOW_REF ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      eventName: process.env.GITHUB_EVENT_NAME ?? null,
      ref: process.env.GITHUB_REF ?? null,
      sha: process.env.GITHUB_SHA ?? null
    },
    request: {
      modes,
      hasOidcEnv
    },
    caseCount: cases.length,
    resultCount: results.length,
    summary: summarize(results),
    results
  };

  await writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'results.csv'), toCsv(results));
  const markdown = toMarkdown(report);
  await writeFile(path.join(outputDir, 'summary.md'), markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, {flag: 'a'});
  }
}

function summarize(results) {
  const summary = {
    accepted: 0,
    rejected: 0,
    skipped: 0,
    statuses: {},
    byCategory: {}
  };

  for (const result of results) {
    summary[result.outcome] += 1;
    const statusKey = result.status === null ? 'none' : String(result.status);
    summary.statuses[statusKey] = (summary.statuses[statusKey] ?? 0) + 1;
    summary.byCategory[result.category] ??= {accepted: 0, rejected: 0, skipped: 0};
    summary.byCategory[result.category][result.outcome] += 1;
  }

  return summary;
}

function toCsv(results) {
  const header = [
    'id',
    'category',
    'mode',
    'outcome',
    'status',
    'audienceLength',
    'audience',
    'claimAud',
    'errorMessage'
  ];

  const rows = results.map((result) => [
    result.id,
    result.category,
    result.mode,
    result.outcome,
    result.status,
    result.audienceLength,
    result.audience,
    result.claims?.aud ?? '',
    result.response?.errorMessage ?? result.error ?? ''
  ]);

  return `${header.join(',')}\n${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function toMarkdown(report) {
  const lines = [
    '# OIDC audience results',
    '',
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt}`,
    `Repository: ${report.github.repository ?? 'unknown'}`,
    `Workflow ref: ${report.github.workflowRef ?? 'unknown'}`,
    `Runner: ${report.runner.os ?? 'unknown'} / ${report.runner.environment ?? 'unknown'}`,
    `OIDC env present: ${report.request.hasOidcEnv}`,
    '',
    '## Summary',
    '',
    `Accepted: ${report.summary.accepted}`,
    `Rejected: ${report.summary.rejected}`,
    `Skipped: ${report.summary.skipped}`,
    '',
    '## Results',
    '',
    '| ID | Category | Mode | Outcome | Status | Length | Audience | Claim aud / error |',
    '| --- | --- | --- | --- | --- | ---: | --- | --- |'
  ];

  for (const result of report.results) {
    const audience = result.audience === null ? '<default>' : result.audience;
    const detail = result.ok ? result.claims?.aud : result.response?.errorMessage ?? result.error ?? '';
    lines.push(
      `| ${md(result.id)} | ${md(result.category)} | ${md(result.mode ?? '')} | ${md(result.outcome)} | ${md(result.status ?? '')} | ${md(result.audienceLength ?? '')} | ${md(audience)} | ${md(detail ?? '')} |`
    );
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function md(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function mask(secret) {
  process.stdout.write(`::add-mask::${secret}\n`);
}
