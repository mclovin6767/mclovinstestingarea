#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const envPath = resolve(repoRoot, '.env');

if (existsSync(envPath)) {
  loadDotenv({ path: envPath, quiet: true });
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_DEMO_SEED !== 'true') {
  throw new Error('Refusing to seed demo credentials in production. Set ALLOW_PRODUCTION_DEMO_SEED=true to override.');
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// No credential is baked into this script — the demo owner's email/password must be supplied at
// run time so a known secret is never committed (and re-runs can't reset a real user's password).
const email = process.env.DEMO_OWNER_EMAIL;
const password = process.env.DEMO_OWNER_PASSWORD;
const restaurantCode = (process.env.DEMO_RESTAURANT_CODE ?? 'DEMO').toUpperCase();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
}
if (!email || !password) {
  throw new Error('DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD are required (no default is baked in).');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const categories = [
  { name: 'Starters', sort_order: 1 },
  { name: 'Mains', sort_order: 2 },
  { name: 'Beverages', sort_order: 3 }
];

const menuItems = [
  { name: 'Paneer Tikka', category: 'Starters', price: 220, tax_rate: 0, food_type: 'VEG' },
  { name: 'Masala Dosa', category: 'Mains', price: 140, tax_rate: 0, food_type: 'VEG' },
  { name: 'Egg Bhurji', category: 'Mains', price: 120, tax_rate: 0, food_type: 'EGG' },
  { name: 'Chicken Tikka', category: 'Starters', price: 280, tax_rate: 0, food_type: 'NON_VEG' },
  { name: 'Filter Coffee', category: 'Beverages', price: 60, tax_rate: 0, food_type: 'VEG' }
];

async function main() {
  await assertDatabaseReady();
  const user = await ensureUser();
  const restaurant = await ensureRestaurant();
  await ensureRestaurantLink(restaurant.id, user.id);
  const categoryByName = await ensureCategories(restaurant.id);
  const itemByName = await ensureMenuItems(restaurant.id, categoryByName);
  await ensureSettings(restaurant.id);
  await ensureSampleInvoice(restaurant, itemByName);

  console.log('Demo workspace is ready.');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Restaurant: ${restaurant.name} (${restaurant.code})`);
}

async function assertDatabaseReady() {
  const { error } = await supabase.from('restaurants').select('id').limit(1);
  if (error) {
    throw new Error(
      `Database schema is not installed yet: ${error.message}. Add DATABASE_URL and run npm run db:setup, then run npm run seed:demo again.`
    );
  }
}

async function ensureUser() {
  const existing = await findUserByEmail(email);
  if (existing) {
    const updated = await updateUser(existing.id);
    return updated ?? existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Demo Owner'
    }
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Failed to create demo user');
  }

  return data.user;
}

async function updateUser(userId) {
  const attributes = {
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Demo Owner'
    }
  };
  const { data, error } = await supabase.auth.admin.updateUserById(userId, attributes);

  if (!error) {
    return data.user;
  }

  const retry = await supabase.auth.admin.updateUserById(userId, {
    password,
    user_metadata: attributes.user_metadata
  });

  if (retry.error) {
    throw new Error(retry.error.message);
  }

  return retry.data.user;
}

async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match || data.users.length < 1000) {
      return match ?? null;
    }
  }

  return null;
}

async function ensureRestaurant() {
  const { data, error } = await supabase
    .from('restaurants')
    .upsert(
      {
        name: 'Demo Restaurant',
        code: restaurantCode,
        gstin: '29ABCDE1234F1Z5',
        currency: 'INR',
        timezone: 'Asia/Kolkata'
      },
      { onConflict: 'code' }
    )
    .select('id, name, code, gstin, currency, timezone, created_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to upsert restaurant');
  }

  return data;
}

async function ensureRestaurantLink(restaurantId, userId) {
  const { error } = await supabase.from('restaurant_users').upsert(
    {
      restaurant_id: restaurantId,
      user_id: userId,
      role: 'owner'
    },
    { onConflict: 'restaurant_id,user_id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureCategories(restaurantId) {
  const byName = new Map();

  for (const category of categories) {
    const existing = await findOne('categories', {
      restaurant_id: restaurantId,
      name: category.name
    });
    const payload = {
      restaurant_id: restaurantId,
      name: category.name,
      sort_order: category.sort_order,
      is_active: true
    };
    const row = existing
      ? await updateById('categories', existing.id, payload)
      : await insertRow('categories', payload);
    byName.set(category.name, row);
  }

  return byName;
}

async function ensureMenuItems(restaurantId, categoryByName) {
  const byName = new Map();

  for (const item of menuItems) {
    const category = categoryByName.get(item.category);
    const existing = await findOne('menu_items', {
      restaurant_id: restaurantId,
      name: item.name
    });
    const payload = {
      restaurant_id: restaurantId,
      category_id: category?.id ?? null,
      name: item.name,
      price: item.price,
      tax_rate: item.tax_rate,
      food_type: item.food_type,
      dietary_tags: [],
      is_active: true,
      is_deleted: false
    };
    const row = existing
      ? await updateById('menu_items', existing.id, payload)
      : await insertRow('menu_items', payload);
    byName.set(item.name, row);
  }

  return byName;
}

async function ensureSettings(restaurantId) {
  const settings = [
    ['tax', { default_gst_rate: 0 }],
    ['invoice', { prefix: restaurantCode, footer: 'Thank you for dining with us.' }],
    ['brand', { primary: '#059669', accent: '#10B981', highlight: '#EAB308' }],
    ['contact', { phone: '+91 98765 43210', email: 'owner@qrdines.local' }],
    [
      'printer',
      {
        receipt: {
          enabled: true,
          paper_width_mm: 80,
          characters_per_line: 48,
          copies: 1,
          auto_print: false,
          cut_paper: true,
          open_cash_drawer: false,
          footer_text: 'Thank you!'
        },
        pdf: {
          page_size: 'A4',
          delivery_mode: 'download',
          show_logo: true
        },
        browser: {
          enabled: true,
          print_dialog: true
        }
      }
    ]
  ];

  for (const [key, value] of settings) {
    const { error } = await supabase.from('settings').upsert(
      {
        restaurant_id: restaurantId,
        key,
        value
      },
      { onConflict: 'restaurant_id,key' }
    );

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function ensureSampleInvoice(restaurant, itemByName) {
  const year = new Date().getFullYear();
  const invoiceNumber = `${year}-${restaurant.code}-00001`;
  const existingInvoice = await findOne('invoices', {
    restaurant_id: restaurant.id,
    invoice_number: invoiceNumber
  });

  await ensureInvoiceSequence(restaurant.id, year, 1);

  if (existingInvoice) {
    return existingInvoice;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurant.id,
      status: 'billed',
      notes: 'Seeded demo bill'
    })
    .select('id')
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? 'Failed to create demo order');
  }

  const billLines = [
    { item: itemByName.get('Paneer Tikka'), qty: 1 },
    { item: itemByName.get('Masala Dosa'), qty: 2 },
    { item: itemByName.get('Chicken Tikka'), qty: 1 },
    { item: itemByName.get('Filter Coffee'), qty: 2 }
  ].filter((line) => line.item);
  const orderRows = billLines.map((line) => {
    const unitPrice = Number(line.item.price);
    const qty = Number(line.qty);
    const taxRate = Number(line.item.tax_rate);
    const base = unitPrice * qty;
    const taxAmount = roundMoney((base * taxRate) / 100);
    return {
      order_id: order.id,
      menu_item_id: line.item.id,
      name_snapshot: line.item.name,
      qty,
      unit_price: unitPrice,
      discount_type: 'none',
      discount_value: 0,
      tax_rate: taxRate,
      food_type: line.item.food_type ?? 'VEG',
      tax_amount: taxAmount,
      line_total: roundMoney(base + taxAmount)
    };
  });

  const { error: orderItemsError } = await supabase.from('order_items').insert(orderRows);
  if (orderItemsError) {
    throw new Error(orderItemsError.message);
  }

  const subtotal = roundMoney(orderRows.reduce((sum, row) => sum + row.unit_price * row.qty, 0));
  const taxTotal = roundMoney(orderRows.reduce((sum, row) => sum + row.tax_amount, 0));
  const total = roundMoney(subtotal + taxTotal);

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      restaurant_id: restaurant.id,
      order_id: order.id,
      invoice_number: invoiceNumber,
      year,
      subtotal,
      discount_total: 0,
      tax_total: taxTotal,
      round_off: 0,
      total,
      payment_method: 'upi',
      status: 'finalized'
    })
    .select('id')
    .single();

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message ?? 'Failed to create demo invoice');
  }

  if (taxTotal > 0) {
    const { error: taxError } = await supabase.from('invoice_taxes').insert({
      invoice_id: invoice.id,
      tax_name: `GST ${orderRows[0]?.tax_rate ?? 0}%`,
      tax_rate: orderRows[0]?.tax_rate ?? 0,
      tax_amount: taxTotal
    });

    if (taxError) {
      throw new Error(taxError.message);
    }
  }

  return invoice;
}

async function ensureInvoiceSequence(restaurantId, year, minLastNumber) {
  const existing = await findOne('invoice_sequences', {
    restaurant_id: restaurantId,
    year
  });

  if (!existing) {
    await insertRow('invoice_sequences', {
      restaurant_id: restaurantId,
      year,
      last_number: minLastNumber
    });
    return;
  }

  if (Number(existing.last_number) < minLastNumber) {
    await updateById('invoice_sequences', existing.id, {
      last_number: minLastNumber
    });
  }
}

async function findOne(table, filters) {
  let query = supabase.from(table).select('*');
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function insertRow(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error || !data) {
    throw new Error(error?.message ?? `Failed to insert ${table}`);
  }
  return data;
}

async function updateById(table, id, payload) {
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select('*').single();
  if (error || !data) {
    throw new Error(error?.message ?? `Failed to update ${table}`);
  }
  return data;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
