import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://fon.yourapiservice.com", // canonical, og:url, sitemap, robots, llms.txt mutlak adresleri
  output: "server",
  redirects: { "/": { status: 302, destination: "/fonlar/yat" }, "/favoriler": "/fonlar/yat" }, // derleme zamanında statik, SSR'a uğramaz
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
