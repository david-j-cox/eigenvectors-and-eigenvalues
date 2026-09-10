#!/usr/bin/env tsx
/**
 * Write the pilot acceptance thresholds where the Python diagnostics can read
 * them, so the task and the analysis cannot disagree about what counts as
 * acceptable. Run after changing PILOT_TARGETS.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PILOT_TARGETS, DEFAULT_DESIGN, EXPERIMENT_VERSION } from '../src/config/task';

const out = resolve(process.cwd(), '../analysis/pilot_targets.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      _generated_by: 'experiment/scripts/export_targets.ts -- do not edit by hand',
      experiment_version: EXPERIMENT_VERSION,
      state_bin_responses: DEFAULT_DESIGN.stateBinResponses,
      targets: PILOT_TARGETS,
    },
    null,
    2,
  ) + '\n',
  'utf-8',
);
console.log(`wrote ${out}`);
