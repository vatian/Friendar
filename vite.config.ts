import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base — путь сайта на GitHub Pages: https://vatian.github.io/Friendar/
export default defineConfig({
  base: '/Friendar/',
  plugins: [react()],
});
