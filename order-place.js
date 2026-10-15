import http from 'k6/http';
import { check, sleep } from 'k6';

// Write path: guests placing orders. setup() pulls a real menu item so the payload validates.
// NOTE: POST /orders is throttled to 10/min per IP — from a single k6 runner you will measure the
// rate limiter, not the DB. Run distributed (k6 Cloud / multiple runners) or raise the throttle in
// staging. See loadtest/README.md.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';
const TOKEN = __ENV.TABLE_TOKEN;

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 15 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    // Allow a little more headroom on the write path (DB round-trips + inserts).
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800']
  }
};

export function setup() {
  if (!TOKEN) {
    throw new Error('Set TABLE_TOKEN=<a real table qr_token> to run this test.');
  }
  const menu = http.get(`${BASE_URL}/public/t/${TOKEN}/menu`);
  check(menu, { 'menu loaded': (r) => r.status === 200 });
  const items = menu.json('items') || [];
  if (!items.length) {
    throw new Error('Menu has no items — seed the restaurant before load-testing orders.');
  }
  return { itemId: items[0].id };
}

export default function (data) {
  const payload = JSON.stringify({ items: [{ menu_item_id: data.itemId, quantity: 1 }] });
  const res = http.post(`${BASE_URL}/public/t/${TOKEN}/orders`, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  check(res, { 'order accepted': (r) => r.status === 200 || r.status === 201 });
  sleep(2);
}
