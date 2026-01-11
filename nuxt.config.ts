// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  
  ssr: false,
  
  modules: [
    '@pinia/nuxt',
  ],
  
  css: [
    '~/assets/scss/main.scss',
  ],
  
  app: {
    baseURL: './',
    buildAssetsDir: 'assets',
    head: {
      title: 'RenderQ',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  
  router: {
    options: {
      hashMode: true,
    },
  },
  
  // Fix for Electron file:// protocol
  $production: {
    app: {
      baseURL: './',
      cdnURL: './',
    },
  },
  
  nitro: {
    output: {
      publicDir: '.output/public',
    },
    prerender: {
      crawlLinks: false,
    },
  },
  
  vite: {
    base: './',
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "~/assets/scss/_variables.scss" as *;`,
        },
      },
    },
  },
  
  runtimeConfig: {
    public: {
      defaultBlenderPath: 'C:\\Program Files\\Blender Foundation',
    },
  },
  
  compatibilityDate: '2024-01-01',
})
