import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === '1' ? '/chalet-alpicois/' : '/',
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 19)),
  },
})
