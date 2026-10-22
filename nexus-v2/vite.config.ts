import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    strictPort: true,
  },
  esbuild: {
    // Strip all console and debugger statements from production bundle
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-three': ['three'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-firebase': ['firebase/app', 'firebase/database'],
        },
      },
    },
  },
}))
