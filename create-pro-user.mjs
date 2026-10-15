#!/usr/bin/env node
/**
 * Provision a confirmed Pro-tier owner + restaurant, using the service-role key from your env.
 *
 * Guards:
 *   - Password is read from a HIDDEN interactive prompt (never echoed, never in shell history or a
 *     file). Set PRO_USER_PASSWORD only for non-interactive/CI use.
 *   - Prints the target Supabase project ref and requires you to type "yes" before writing — so you
 *     can't accidentally provision into the wrong project.
 *   - Idempotent: an existing email is reused; its password is left alone UNLESS you opt in with
 *     PRO_RESET_PASSWORD=true. The restaurant code is deterministic and every write is an upsert,
 *     so re-running just re-asserts Pro.
 *
 * Usage:
 *   PRO_USER_EMAIL=you@example.com node scripts/create-pro-user.mjs
 *   # to (re)set the password of an existing account:
 *   PRO_USER_EMAIL=you@example.com PRO_RESET_PASSWORD=true node scripts/create-pro-user.mjs
 *   # optional: PRO_RESTAURANT_NAME, PRO_RESTAURANT_CODE, PRO_USER_PASSWORD (non-interactive)
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
for (const candidate of [resolve(repoRoot, '.env'), resolve(repoRoot, 'apps/backend/.env')]) {
  if (existsSync(candidate)) loadDotenv({ path: candidate, quiet: true });
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (env or apps/backend/.env).');
}

const email = (process.env.PRO_USER_EMAIL ?? process.argv[2] ?? '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  fail('Set PRO_USER_EMAIL (or pass the email as the first argument).');
}

const PLAN_CODE = 'pro';
const restaurantName = process.env.PRO_RESTAURANT_NAME ?? 'QR Dines Pro';
const restaurantCode = (process.env.PRO_RESTAURANT_CODE ?? deriveCode(email)).toUpperCase().slice(0, 16);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function deriveCode(addr) {
  const local = addr.split('@')[0].replace(/[^a-z0-9]/gi, '');
  return local || 'PRO';
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return url;
  }
}

function askVisible(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (answer) => (rl.close(), res(answer))));
}

// Read a line without echoing it. Falls back to PRO_USER_PASSWORD when there's no TTY.
function askHidden(question) {
  return new Promise((res) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      res(process.env.PRO_USER_PASSWORD ?? '');
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (buf) => {
      const code = buf[0];
      if (code === 0x0d || code === 0x0a || code === 0x04) {
        // Enter / Ctrl-D — finish.
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        res(value);
      } else if (code === 0x03) {
        // Ctrl-C — abort.
        process.stdout.write('\n');
        process.exit(1);
      } else if (code === 0x7f || code === 0x08) {
        // Backspace / Delete.
        value = value.slice(0, -1);
      } else {
        value += buf.toString('utf8');
      }
    };
    stdin.on('data', onData);
  });
}

async function findUserByEmail(supabase, addr) {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((user) => (user.email ?? '').toLowerCase() === addr);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const ref = projectRef(supabaseUrl);
  console.log('\n  Provision a PRO user');
  console.log(`  ├ Supabase project : ${ref}`);
  console.log(`  ├ Email            : ${email}`);
  console.log(`  └ Restaurant       : ${restaurantName} (${restaurantCode})\n`);

  const confirm = (await askVisible(`  Type "yes" to write to project "${ref}": `)).trim();
  if (confirm !== 'yes') {
    console.log('  Aborted — nothing was written.');
    process.exit(0);
  }

  const password = process.env.PRO_USER_PASSWORD ?? (await askHidden('  New password (hidden): '));
  if (!password || password.length < 8) {
    fail('Password must be at least 8 characters.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // FK guard: subscriptions.plan_code references plans(code). Fail clearly if plans isn't seeded.
  const { data: plan } = await supabase.from('plans').select('code').eq('code', PLAN_CODE).maybeSingle();
  if (!plan) {
    fail(`The "${PLAN_CODE}" plan is missing from the plans table — seed plans first.`);
  }

  // 1. Auth user (email confirmed so they can sign in immediately). Idempotent: reuse if it exists.
  let userId;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    if (/already|exists|registered/i.test(created.error.message)) {
      const existing = await findUserByEmail(supabase, email);
      if (!existing) fail(`User exists but could not be found: ${created.error.message}`);
      userId = existing.id;
      if (process.env.PRO_RESET_PASSWORD === 'true') {
        const { error: resetError } = await supabase.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true
        });
        if (resetError) fail(`Failed to reset the password: ${resetError.message}`);
        console.log('  • User already exists — password reset to the one you just entered.');
      } else {
        console.log('  • User already exists — reused (password unchanged; set PRO_RESET_PASSWORD=true to reset it).');
      }
    } else {
      fail(`Failed to create user: ${created.error.message}`);
    }
  } else {
    userId = created.data.user.id;
    console.log('  • Auth user created (email confirmed).');
  }

  // 2. Restaurant (deterministic code -> idempotent upsert).
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .upsert(
      { name: restaurantName, code: restaurantCode, currency: 'INR', timezone: 'Asia/Kolkata' },
      { onConflict: 'code' }
    )
    .select('id, code')
    .single();
  if (restaurantError || !restaurant) fail(`Failed to create restaurant: ${restaurantError?.message}`);
  console.log(`  • Restaurant ready (${restaurant.code}).`);

  // 3. Owner link.
  const { error: linkError } = await supabase
    .from('restaurant_users')
    .upsert({ restaurant_id: restaurant.id, user_id: userId, role: 'owner' }, { onConflict: 'restaurant_id,user_id' });
  if (linkError) fail(`Failed to link owner: ${linkError.message}`);

  // 4. Active Pro subscription (subscriptions.restaurant_id is unique -> upsert re-asserts Pro).
  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({ restaurant_id: restaurant.id, plan_code: PLAN_CODE, status: 'active' }, { onConflict: 'restaurant_id' });
  if (subError) fail(`Failed to set the subscription: ${subError.message}`);

  console.log(`\n  ✓ ${email} is an owner of "${restaurantName}" on the ${PLAN_CODE} plan (project ${ref}).\n`);
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
