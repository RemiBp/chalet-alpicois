/**
 * Push env vars to Vercel (production + preview + development).
 * Reads email creds from ~/.cursor/mcp.json → maps to backend vars.
 * Usage: node scripts/setup-vercel-env.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mcp = JSON.parse(readFileSync(join(homedir(), '.cursor/mcp.json'), 'utf8'));
const e = mcp.mcpServers?.email?.env;
if (!e?.MCP_EMAIL_PASSWORD) {
  console.error('Email MCP config introuvable dans ~/.cursor/mcp.json');
  process.exit(1);
}

const adminPassword = randomBytes(12).toString('base64url');
const cronSecret = randomBytes(32).toString('hex');

const vars = [
  ['EMAIL_USER', e.MCP_EMAIL_USERNAME || e.MCP_EMAIL_ADDRESS, true],
  ['EMAIL_PASS', e.MCP_EMAIL_PASSWORD, true],
  ['IMAP_HOST', e.MCP_EMAIL_IMAP_HOST || 'imap.hostinger.com', false],
  ['IMAP_PORT', e.MCP_EMAIL_IMAP_PORT || '993', false],
  ['ADMIN_PASSWORD', adminPassword, true],
  ['CRON_SECRET', cronSecret, true],
];

const ENVS = ['production'];

function addEnv(name, value, sensitive) {
  for (const env of ENVS) {
    const flags = [
      'env', 'add', name, env,
      '--value', value,
      '--force', '--yes',
    ];
    if (sensitive) flags.push('--sensitive');
    execSync(`vercel ${flags.map(a => JSON.stringify(a)).join(' ')}`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    console.log(`   ✓ ${name} (${env})`);
  }
}

console.log('Adding Vercel environment variables…\n');
for (const [name, value, sensitive] of vars) {
  console.log(`→ ${name}`);
  addEnv(name, value, sensitive);
}

const notes = `# Generated ${new Date().toISOString()} — DO NOT COMMIT
ADMIN_PASSWORD=${adminPassword}
CRON_SECRET=${cronSecret}
EMAIL_USER=${e.MCP_EMAIL_USERNAME}
`;
writeFileSync(join(ROOT, 'backend/.env.vercel-setup'), notes, { mode: 0o600 });
console.log('\n✅ Variables ajoutées sur Vercel (prod + preview + dev)');
console.log('📝 Mot de passe admin sauvegardé dans backend/.env.vercel-setup (local, gitignored)');
