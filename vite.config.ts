import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * GitHub Pages project sites are served at `https://<user>.github.io/<repo>/`.
 * In GitHub Actions, `GITHUB_REPOSITORY` is `owner/repo` — we derive `base` from the repo name.
 * Local dev / builds without that env use `/`.
 */
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = repoName ? `/${repoName}/` : "/";

/**
 * Vite configuration: React + path alias `@/` → `src/`.
 */
export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
