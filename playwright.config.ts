import { defineConfig } from "@playwright/test";

// Gerçek (yerel) Postgres verisiyle çalışır: DATABASE_URL veya postgres://tefas:tefas@localhost/tefas
// Deploy edilen build'i test eder (dev sunucusu 2000 satırlık SSR'da yavaş/kararsız).
// Çalışan bir sunucuya karşı: E2E_BASE_URL=https://fon.yourapiservice.com npm run test:e2e
const PORT = 4322;
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`, locale: "tr-TR" },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run build && node dist/server/entry.mjs",
    env: { PORT: String(PORT), HOST: "127.0.0.1" },
    url: `http://localhost:${PORT}/fonlar/yat`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
