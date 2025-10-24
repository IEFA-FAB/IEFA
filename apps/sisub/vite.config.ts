import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";

/* 
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootNodeModules = path.resolve(__dirname, '../../node_modules')
 */
export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), visualizer({open: true})],
  resolve: {
    dedupe: ["react", "react-dom"],
    // preserveSymlinks: true,
    alias: {
      "@iefa/auth": fileURLToPath(
        new URL("../../packages/auth/src", import.meta.url)
      ),
      "@iefa/ui": fileURLToPath(
        new URL("../../packages/ui/src", import.meta.url)
      ),
    },
  },
  server: {
    fs: { allow: [".."] }, // permite ler ../../packages/*
  },
  optimizeDeps: {
    // Evita prebundle estranho do pacote linkado
    exclude: ["@iefa/ui", "@iefa/auth"],
  },
  ssr: {
    // Se o sisub roda SSR em dev (React Router v7), garanta que a lib é empacotada pelo Vite
    noExternal: ["@iefa/ui", "@iefa/auth"],
  },
});
