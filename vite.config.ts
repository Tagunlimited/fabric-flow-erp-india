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
    },
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('jsbarcode')) {
            return 'vendor-pdf';
          }
          if (id.includes('xlsx') || id.includes('papaparse')) return 'vendor-data';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router')) {
            return 'vendor-react';
          }
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'vendor-ui';
        },
      },
    },
  }
}));