import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Les JSON de secours sont utiles en local mais ne doivent jamais devenir
    // accessibles publiquement dans le bundle Vercel.
    {
      name: 'remove-private-static-data',
      closeBundle() {
        rmSync('dist/data', { recursive: true, force: true })
      },
    },
  ],
  base: process.env.GITHUB_PAGES === '1' ? '/chalet-alpicois/' : '/',
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 19)),
  },
})
