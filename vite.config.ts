import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import viteCapacitor from '@capgo/vite-capacitor'

export default defineConfig({
  plugins: [vue(), viteCapacitor({
    platforms: ["ios", "android"],
    cleartext: true,
    networkUrl: true,
  }),],
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
