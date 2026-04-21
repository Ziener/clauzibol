// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Hybrid: alle pagina's standaard statisch, API-routes kunnen
  // `export const prerender = false;` zetten voor server-side.
  output: 'static',
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  }
});
