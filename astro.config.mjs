import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  redirects: { "/": { status: 302, destination: "/fonlar/yat" }, "/favoriler": "/fonlar/yat" }, // derleme zamanında statik, SSR'a uğramaz
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
