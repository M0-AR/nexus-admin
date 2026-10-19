import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE || "http://localhost:4000/api";
const EMAIL = __ENV.SMOKE_EMAIL || "owner@acme.test";
const PASSWORD = __ENV.SMOKE_PASSWORD || "Password123!";
const TENANT = __ENV.SMOKE_TENANT || "acme";

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      exec: "browse",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 5 },
        { duration: "15s", target: 5 },
        { duration: "5s", target: 0 },
      ],
    },
    auth: {
      executor: "constant-vus",
      exec: "authFlow",
      vus: 1,
      duration: "15s",
      startTime: "5s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD, tenantSlug: TENANT }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "setup login 200": (r) => r.status === 200 });
  return { token: res.json("accessToken") };
}

function authed(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

export function browse(data) {
  const params = authed(data.token);
  const responses = http.batch([
    ["GET", `${BASE}/auth/me`, null, params],
    ["GET", `${BASE}/orders?page=1&pageSize=10`, null, params],
    ["GET", `${BASE}/products?page=1&pageSize=10`, null, params],
  ]);
  for (const res of responses) check(res, { "read 200": (r) => r.status === 200 });
  sleep(0.5);
}

export function authFlow() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD, tenantSlug: TENANT }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "login 200": (r) => r.status === 200, "login returns token": (r) => Boolean(r.json("accessToken")) });
  sleep(1);
}
