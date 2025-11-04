import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __WS_TOKEN__: JSON.stringify(process.env.WS_TOKEN || ''),
    global: 'globalThis',
  },
  server: {
    host: "::",
    port: 8081,
    hmr: {
      port: 8081,
      clientPort: 8081,
    },
    watch: {
      usePolling: true,
    },
  },
  plugins: [
    react({
      tsDecorators: true,
      devTarget: 'es2022',
    }),
    // Add any development-only plugins here
    // Example:
    // mode === 'development' && someDevPlugin()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    target: 'es2022'
  },
  optimizeDeps: {
    include: ['jsbarcode'],
    esbuildOptions: {
      target: 'es2022'
    }
  },
  build: {
    commonjsOptions: {
      include: [/jsbarcode/, /node_modules/]
    }
  }
}));