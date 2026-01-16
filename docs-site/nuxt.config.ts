export default defineNuxtConfig({
  ssr: false,
  
  // Ensure we don't inherit from parent project
  rootDir: './',
  srcDir: './',
  
  app: {
    baseURL: '/RenderQ/',
    buildAssetsDir: 'assets',
    head: {
      title: 'RenderQ - Multi-Application Render Queue Manager',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke. Available for Windows, macOS, and Linux.' },
        { name: 'theme-color', content: '#4589ff' },
        // Open Graph
        { property: 'og:title', content: 'RenderQ - Multi-Application Render Queue Manager' },
        { property: 'og:description', content: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke. Available for Windows, macOS, and Linux.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://tdoukinitsas.github.io/RenderQ/' },
        { property: 'og:image', content: 'https://tdoukinitsas.github.io/RenderQ/screenshots/renderq_screenshot.jpg' },
        { property: 'og:image:width', content: '1920' },
        { property: 'og:image:height', content: '1080' },
        { property: 'og:image:type', content: 'image/jpeg' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'RenderQ - Multi-Application Render Queue Manager' },
        { name: 'twitter:description', content: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke. Available for Windows, macOS, and Linux.' },
        { name: 'twitter:image', content: 'https://tdoukinitsas.github.io/RenderQ/screenshots/renderq_screenshot.jpg' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/RenderQ/favicon.ico' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' }
      ]
    }
  },

  css: ['~/assets/styles/main.scss'],

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: ''
        }
      }
    }
  },

  nitro: {
    preset: 'static'
  },

  typescript: {
    strict: false,
    typeCheck: false
  },

  compatibilityDate: '2025-01-01'
})
