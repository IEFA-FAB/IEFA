import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from 'nitro/vite'

const config = defineConfig({
    plugins: [
        devtools(),
        // this is the plugin that enables path aliases
        viteTsConfigPaths({
            projects: ["./tsconfig.json"],
        }),
        tailwindcss(),
        tanstackStart(),
        viteReact({
            babel: {
                plugins: ["babel-plugin-react-compiler"],
            },
        }),
        nitro()
    ],
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            "@iefa/auth": fileURLToPath(new URL("../../packages/auth/src", import.meta.url)),
            "@iefa/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
        },
    },
    server: {
        fs: { allow: [".."] }, 
    },
    optimizeDeps: {
        exclude: ["@iefa/ui", "@iefa/auth"],
    },
    ssr: {
        noExternal: ["@iefa/ui", "@iefa/auth", "lucide-react"],
    },
    nitro: {preset: 'node-server'},
});

export default config;
