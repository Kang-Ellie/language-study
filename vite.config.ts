import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' → 빌드 결과물을 어떤 폴더에서 열어도 동작 (완전 로컬)
export default defineConfig({
  plugins: [react()],
  base: './',
})
