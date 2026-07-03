#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import process from 'node:process';

const files = [
  '.github/workflows/oidc-audience-matrix.yml',
  '.github/workflows/oidc-audience-cyspbot-focused.yml',
  '.github/workflows/oidc-audience-permission-controls.yml',
  '.github/workflows/oidc-audience-reusable-caller.yml',
  '.github/workflows/_oidc-audience-reusable.yml',
  '.github/workflows/oidc-audience-single.yml',
  '.github/workflows/oidc-audience-self-hosted.yml',
  '.github/workflows/oidc-audience-targeted.yml'
];

for (const file of files) {
  readFileSync(file, 'utf8');
}

const dryRun = spawnSync(
  process.execPath,
  [
    'scripts/run-audience-matrix.mjs',
    '--allowMissingEnv=true',
    '--outputDir=.tmp-local-verify',
    '--caseRegex=^(default-no-audience|github-app-cyspbot|azure-default)$'
  ],
  {
    stdio: 'inherit'
  }
);

if (dryRun.status !== 0) {
  process.exit(dryRun.status ?? 1);
}

console.log('Local verification completed.');
