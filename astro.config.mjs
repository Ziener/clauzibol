// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.clauzibol.nl',
  // Hybrid: alle pagina's standaard statisch, API-routes kunnen
  // `export const prerender = false;` zetten voor server-side.
  output: 'static',
  adapter: vercel(),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/uitschrijven'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
