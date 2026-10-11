import { expect, test } from "@playwright/test";

// Coolify healthcheck ucu: 200 "ok", önbelleklenmez
test("healthz 200 ok döner, no-store", async ({ request }) => {
  const res = await request.get("/healthz");
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("ok");
  expect(res.headers()["cache-control"]).toBe("no-store");
});
