#!/usr/bin/env node
/**
 * Record an offline (cash) subscription payment for a restaurant.
 *
 * Operator-run only: the restaurant owner must NOT be able to self-activate.
 * Uses the service-role key, prints the target Supabase project ref, and requires
 * typing "yes" before writing — so you can't accidentally activate the wrong project.
 *
 * What it writes (upsert on restaurant_id):
 *   plan_code, status='active', current_period_start/end, provider='manual',
 *   payment_mode='cash', paid_amount_inr, payment_reference, notes.
 * Webhook reconciliation looks up by cashfree_subscription_id (left NULL here), so
 * Cashfree events never touch manual rows.
 *
 * Usage:
 *   RESTAURANT_CODE=DEMO PLAN_CODE=starter PERIOD_MONTHS=1 PAID_AMOUNT_INR=350 \
 *     PAYMENT_REFERENCE="receipt 123, received by X" node scripts/activate-cash-subscription.mjs
 *
 *   Optional: PERIOD_END=2026-10-21 (ISO date) instead of PERIOD_MONTHS.
 *   Optional: NOTES="..." for operator context.
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

const PLAN_CODES = ['starter', 'dine_in_qr', 'pro'];
const restaurantCode = (process.env.RESTAURANT_CODE ?? '').trim().toUpperCase();
const planCode = (process.env.PLAN_CODE ?? '').trim().toLowerCase();
const reference = (process.env.PAYMENT_REFERENCE ?? '').trim();
const amountRaw = (process.env.PAID_AMOUNT_INR ?? '').trim();
const periodEndRaw = (process.env.PERIOD_END ?? '').trim();
const periodMonthsRaw = (process.env.PERIOD_MONTHS ?? '').trim();
const notes = (process.env.NOTES ?? '').trim() || null;

if (!restaurantCode) fail('Set RESTAURANT_CODE (the restaurant code, e.g. DEMO).');
if (!PLAN_CODES.includes(planCode)) fail(`Set PLAN_CODE to one of: ${PLAN_CODES.join(', ')}.`);
if (!reference) fail('Set PAYMENT_REFERENCE (receipt no. / who received the cash).');
const paidAmount = Number(amountRaw);
if (!Number.isFinite(paidAmount) || paidAmount < 0) fail('Set PAID_AMOUNT_INR to a non-negative number.');

let periodEnd;
if (periodEndRaw) {
  periodEnd = new Date(periodEndRaw);
  if (Number.isNaN(periodEnd.getTime())) fail('PERIOD_END must be a valid date (e.g. 2026-10-21).');
} else if (periodMonthsRaw) {
  const months = Number(periodMonthsRaw);
  if (!Number.isInteger(months) || months < 1 || months > 24) fail('PERIOD_MONTHS must be 1–24.');
  periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + months);
} else {
  fail('Set PERIOD_END (ISO date) or PERIOD_MONTHS (1–24).');
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
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

async function main() {
  const ref = projectRef(supabaseUrl);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id, code, name')
    .eq('code', restaurantCode)
    .maybeSingle();
  if (restaurantError || !restaurant) fail(`Restaurant "${restaurantCode}" not found: ${restaurantError?.message ?? ''}`);

  const { data: plan } = await supabase.from('plans').select('code').eq('code', planCode).maybeSingle();
  if (!plan) fail(`Plan "${planCode}" is missing from the plans table — seed plans first.`);

  console.log('\n  Record cash subscription');
  console.log(`  ├ Supabase project : ${ref}`);
  console.log(`  ├ Restaurant       : ${restaurant.name} (${restaurant.code})`);
  console.log(`  ├ Plan             : ${planCode}`);
  console.log(`  ├ Amount (INR)     : ${paidAmount}`);
  console.log(`  ├ Valid till       : ${periodEnd.toISOString()}`);
  console.log(`  └ Reference        : ${reference}\n`);

  const confirm = (await askVisible(`  Type "yes" to write to project "${ref}": `)).trim();
  if (confirm !== 'yes') {
    console.log('  Aborted — nothing was written.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  const { error: subError } = await supabase.from('subscriptions').upsert(
    {
      restaurant_id: restaurant.id,
      plan_code: planCode,
      status: 'active',
      current_period_start: now,
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: null,
      provider: 'manual',
      payment_mode: 'cash',
      paid_amount_inr: paidAmount,
      payment_reference: reference,
      notes
    },
    { onConflict: 'restaurant_id' }
  );
  if (subError) fail(`Failed to record the subscription: ${subError.message}`);

  console.log(`\n  ✓ ${restaurant.code} is on ${planCode} (cash, valid till ${periodEnd.toISOString()}).\n`);
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
