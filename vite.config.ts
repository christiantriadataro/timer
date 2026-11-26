import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // sqlite-wasm loads its .wasm relative to itself; pre-bundling breaks that path.
  optimizeDeps: {exclude: ['@sqlite.org/sqlite-wasm']},
  // The db worker imports modules, so it must be built as an ES module worker.
  worker: {format: 'es'},
})
