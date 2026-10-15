import http from 'k6/http';
import { check } from 'k6';

// Baseline: hammer the unauthenticated liveness probe to sanity-check the stack (Node event loop,
// proxy, TLS) under concurrency before load-testing real endpoints. Run against staging.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export const options = {
  stages: [
    { duration: '30s', target: 25 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300']
  }
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
