// ============================================================
// Deployment preflight.
//
// Vite inlines VITE_* variables at build time and substitutes a
// default for anything missing, so a misconfigured deployment
// produces a build that looks healthy and fails only in front of a
// participant: events land in memory and vanish, or the end screen
// shows CHANGEME and nobody can be paid. This runs before the
// production build and turns each of those into a failed deploy.
// ============================================================

import { loadEnv } from 'vite';

interface Problem {
  variable: string;
  detail: string;
}

const problems: Problem[] = [];

// Resolved through Vite's own loader rather than from process.env, so this
// reads exactly what the build will inline: the .env files for a local build,
// and the platform's environment on Vercel. Checking process.env alone would
// fail a correctly configured local build and, worse, would let the check
// disagree with the bundle it is supposed to be vouching for.
const env = loadEnv('production', process.cwd(), 'VITE_');

function requireVar(name: string): string | null {
  const value = env[name]?.trim();
  if (!value) {
    problems.push({ variable: name, detail: 'not set' });
    return null;
  }
  return value;
}

const url = requireVar('VITE_SUPABASE_URL');
const anonKey = requireVar('VITE_SUPABASE_ANON_KEY');
const completionCode = requireVar('VITE_COMPLETION_CODE');

if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  problems.push({
    variable: 'VITE_SUPABASE_URL',
    detail: `expected https://<project>.supabase.co, got ${url}`,
  });
}

if (completionCode && /^(CHANGEME|TODO|XXX)$/i.test(completionCode)) {
  problems.push({
    variable: 'VITE_COMPLETION_CODE',
    detail: `still the placeholder ${completionCode}; participants could not be paid`,
  });
}

// ------------------------------------------------------------
// The check that matters most. This key ships inside the JavaScript
// bundle, readable by anyone who opens the page. The anon key can
// only insert and update, because that is all the RLS policies
// grant it. A service-role key bypasses RLS entirely, so shipping
// one here would let any participant download every other
// participant's data. Both key formats are checked.
// ------------------------------------------------------------
if (anonKey) {
  if (anonKey.startsWith('sb_secret_')) {
    problems.push({
      variable: 'VITE_SUPABASE_ANON_KEY',
      detail:
        'this is a SECRET key (sb_secret_...). It bypasses row-level security ' +
        'and would be published in the page bundle. Use the publishable key.',
    });
  } else if (anonKey.split('.').length === 3) {
    try {
      const claims = JSON.parse(
        Buffer.from(anonKey.split('.')[1], 'base64url').toString('utf8'),
      ) as { role?: string };
      if (claims.role && claims.role !== 'anon') {
        problems.push({
          variable: 'VITE_SUPABASE_ANON_KEY',
          detail:
            `this key carries role "${claims.role}", not "anon". A service_role ` +
            'key bypasses row-level security and would be published in the page bundle.',
        });
      }
    } catch {
      problems.push({
        variable: 'VITE_SUPABASE_ANON_KEY',
        detail: 'looks like a JWT but its payload could not be decoded',
      });
    }
  }
}

if (problems.length > 0) {
  console.error('\nPreflight failed. This build would not collect usable data.\n');
  for (const p of problems) console.error(`  ${p.variable}: ${p.detail}`);
  console.error(
    '\nSet these in the Vercel project (Settings -> Environment Variables),' +
      '\nthen redeploy. Vite reads them at build time, so a redeploy is required' +
      '\nafter any change.\n',
  );
  process.exit(1);
}

console.log('Preflight passed: Supabase configured, anon key is not privileged,');
console.log(`completion code set (${completionCode}).`);
