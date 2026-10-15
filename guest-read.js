import http from 'k6/http';
import { check, sleep } from 'k6';

// Read-heavy guest path: a diner scans the QR, loads the table context, then the menu. This is
// the dominant public traffic pattern. Run against staging (see loadtest/README.md).
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';
const TOKEN = __ENV.TABLE_TOKEN;

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 60 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500']
  }
};

export function setup() {
  if (!TOKEN) {
    throw new Error('Set TABLE_TOKEN=<a real table qr_token> to run this test.');
  }
}

export default function () {
  const ctx = http.get(`${BASE_URL}/public/t/${TOKEN}`);
  check(ctx, { 'context 200': (r) => r.status === 200 });

  const menu = http.get(`${BASE_URL}/public/t/${TOKEN}/menu`);
  check(menu, { 'menu 200': (r) => r.status === 200 });

  sleep(1);
}
