import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://itmitalles.github.io",
  base: "/antikos",
  redirects: {
    "/play": "/antikos/antikos-strategy/",
  },
});
