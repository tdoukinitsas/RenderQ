<template>
  <div class="docs-site">
    <header class="site-header">
      <div class="container">
        <div class="header-content">
          <div class="logo-section">
            <img 
              src="/assets/icon.svg" 
              alt="RenderQ Logo" 
              class="logo"
              @error="handleImageError"
            />
            <div class="title-section">
              <h1>RenderQ</h1>
              <p class="version">Version {{ version }}</p>
            </div>
          </div>
        </div>
        <p class="tagline">Multi-Application Render Queue Manager</p>
        <p class="supported-apps">
          <span class="app-badge app-badge--blender">Blender</span>
          <span class="app-badge app-badge--cinema4d">Cinema 4D</span>
          <span class="app-badge app-badge--houdini">Houdini</span>
          <span class="app-badge app-badge--aftereffects">After Effects</span>
          <span class="app-badge app-badge--nuke">Nuke</span>
        </p>
      </div>
    </header>

    <section class="screenshot-section">
      <div class="container">
        <div class="screenshot-wrapper">
          <img 
            src="/screenshots/renderq-screenshot.jpg" 
            alt="RenderQ main interface showing render queue and preview panel" 
            class="app-screenshot"
            @error="handleImageError"
          />
        </div>
      </div>
    </section>

    <section class="download-section">
      <div class="container">
        <h2>Download</h2>
        <p class="download-subtitle">Free and open-source. Available for Windows, macOS, and Linux.</p>
        
        <div class="download-grid">
          <a 
            :href="downloadLinks.windows" 
            class="download-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="platform-icon">🪟</div>
            <h3>Windows</h3>
            <p>Windows 10/11 (64-bit)</p>
            <div class="download-button">
              <span>Download Installer</span>
              <span class="file-size">.exe</span>
            </div>
          </a>

          <a 
            :href="downloadLinks.mac" 
            class="download-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="platform-icon">🍎</div>
            <h3>macOS</h3>
            <p>macOS 11+ (Intel & Apple Silicon)</p>
            <div class="download-button">
              <span>Download DMG</span>
              <span class="file-size">.dmg</span>
            </div>
          </a>

          <a 
            :href="downloadLinks.linux" 
            class="download-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="platform-icon">🐧</div>
            <h3>Linux</h3>
            <p>Universal Linux (AppImage)</p>
            <div class="download-button">
              <span>Download AppImage</span>
              <span class="file-size">.AppImage</span>
            </div>
          </a>
        </div>

        <div class="other-formats">
          <p>Other formats:</p>
          <div class="format-links">
            <a :href="downloadLinks.deb" target="_blank" rel="noopener noreferrer">
              Debian/Ubuntu (.deb)
            </a>
            <a :href="downloadLinks.rpm" target="_blank" rel="noopener noreferrer">
              Fedora/RHEL (.rpm)
            </a>
            <a :href="downloadLinks.macZip" target="_blank" rel="noopener noreferrer">
              macOS (.zip)
            </a>
          </div>
        </div>

        <div class="github-link">
          <a 
            href="https://github.com/tdoukinitsas/RenderQ/releases/latest" 
            target="_blank"
            rel="noopener noreferrer"
          >
            View all releases on GitHub →
          </a>
        </div>
      </div>
    </section>

    <section class="features-section">
      <div class="container">
        <h2>Features</h2>
        
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">🎬</div>
            <h3>Multi-Application Support</h3>
            <p>Manage render queues for Blender, Cinema 4D, Houdini, After Effects, and Nuke all in one place.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>Real-time Progress</h3>
            <p>Monitor render progress with live preview, frame-by-frame updates, and ETA calculations.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">💻</div>
            <h3>System Monitor</h3>
            <p>Keep an eye on CPU, RAM, GPU, and VRAM usage while your renders are processing.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">🖼️</div>
            <h3>Live Preview</h3>
            <p>View rendered frames as they complete, with support for EXR layers and sequence playback.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">📁</div>
            <h3>Drag & Drop</h3>
            <p>Simply drag and drop scene files to add them to the queue. Supports all major formats.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">💾</div>
            <h3>Queue Persistence</h3>
            <p>Save and load render queues. Auto-save ensures you never lose your work.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">⏸️</div>
            <h3>Pause & Resume</h3>
            <p>Pause rendering at any time and resume right where you left off.</p>
          </div>

          <div class="feature-card">
            <div class="feature-icon">🔔</div>
            <h3>Notifications</h3>
            <p>Get notified when renders complete or if errors occur.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="supported-section">
      <div class="container">
        <h2>Supported Applications</h2>
        
        <div class="apps-grid">
          <div class="app-card app-card--blender">
            <h3>Blender</h3>
            <p class="extensions">.blend</p>
            <p>Full support for Cycles and Eevee render engines with GPU acceleration.</p>
          </div>

          <div class="app-card app-card--cinema4d">
            <h3>Cinema 4D</h3>
            <p class="extensions">.c4d</p>
            <p>Render with takes and multi-pass support via command line.</p>
          </div>

          <div class="app-card app-card--houdini">
            <h3>Houdini</h3>
            <p class="extensions">.hip, .hiplc, .hipnc</p>
            <p>Batch rendering with hbatch/hython for Mantra and other engines.</p>
          </div>

          <div class="app-card app-card--aftereffects">
            <h3>After Effects</h3>
            <p class="extensions">.aep, .aepx</p>
            <p>Render compositions with aerender, supporting render settings templates.</p>
          </div>

          <div class="app-card app-card--nuke">
            <h3>Nuke</h3>
            <p class="extensions">.nk, .nknc</p>
            <p>Render Write nodes with full frame range control.</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="site-footer">
      <div class="container">
        <p>
          <strong>RenderQ</strong> is licensed under
          <a href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener noreferrer">
            AGPL-3.0
          </a>
        </p>
        <p>
          Developed by
          <a href="https://github.com/tdoukinitsas" target="_blank" rel="noopener noreferrer">
            Thomas Doukinitsas
          </a>
        </p>
        <p>
          <a href="https://github.com/tdoukinitsas/RenderQ" target="_blank" rel="noopener noreferrer">
            View on GitHub
          </a>
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const version = ref('2.2.1');

const downloadLinks = computed(() => {
  const baseUrl = `https://github.com/tdoukinitsas/RenderQ/releases/download/v${version.value}`;
  return {
    windows: `${baseUrl}/RenderQ.Setup.${version.value}.exe`,
    mac: `${baseUrl}/RenderQ-${version.value}.dmg`,
    linux: `${baseUrl}/RenderQ-${version.value}.AppImage`,
    deb: `${baseUrl}/renderq_${version.value}_amd64.deb`,
    rpm: `${baseUrl}/renderq-${version.value}.x86_64.rpm`,
    macZip: `${baseUrl}/RenderQ-${version.value}-mac.zip`
  };
});

const handleImageError = (event: Event) => {
  (event.target as HTMLImageElement).style.display = 'none';
};

onMounted(async () => {
  // Fetch version from package.json
  try {
    const packageRes = await fetch('/RenderQ/package.json');
    const packageData = await packageRes.json();
    version.value = packageData.version;
  } catch (error) {
    console.error('Failed to fetch version:', error);
  }
});

// SEO
useHead({
  title: 'RenderQ - Multi-Application Render Queue Manager',
  meta: [
    { name: 'description', content: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke. Available for Windows, macOS, and Linux.' }
  ]
});

useSeoMeta({
  title: 'RenderQ - Multi-Application Render Queue Manager',
  description: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke. Available for Windows, macOS, and Linux.',
  ogTitle: 'RenderQ - Multi-Application Render Queue Manager',
  ogDescription: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke.',
  ogType: 'website',
  ogUrl: 'https://tdoukinitsas.github.io/RenderQ/',
  ogImage: 'https://tdoukinitsas.github.io/RenderQ/screenshots/renderq_screenshot.jpg',
  ogImageWidth: '1920',
  ogImageHeight: '1080',
  ogImageType: 'image/jpeg',
  twitterCard: 'summary_large_image',
  twitterTitle: 'RenderQ - Multi-Application Render Queue Manager',
  twitterDescription: 'Free, open-source render queue manager for Blender, Cinema 4D, Houdini, After Effects, and Nuke.',
  twitterImage: 'https://tdoukinitsas.github.io/RenderQ/screenshots/renderq_screenshot.jpg'
});
</script>

<style scoped lang="scss">
// Colors
$accent-primary: #4589ff;
$accent-hover: #78a9ff;
$bg-primary: #161616;
$bg-secondary: #262626;
$text-primary: #ffffff;
$text-secondary: rgba(255, 255, 255, 0.8);
$text-tertiary: rgba(255, 255, 255, 0.6);

// App colors
$app-blender: #ff9966;
$app-cinema4d: #3b82f6;
$app-houdini: #ff6b35;
$app-aftereffects: #9d4edd;
$app-nuke: #fbbf24;

.docs-site {
  min-height: 100vh;
  background: linear-gradient(135deg, $bg-primary 0%, #1a1a2e 100%);
  color: $text-primary;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.site-header {
  padding: 4rem 0 2rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .header-content {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 1rem;
  }

  .logo-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
  }

  .logo {
    width: 100px;
    height: 100px;
    object-fit: contain;
  }

  .title-section {
    text-align: left;
  }

  h1 {
    font-size: 4rem;
    font-weight: 700;
    margin: 0;
    color: $accent-primary;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .version {
    font-size: 1.25rem;
    color: $text-tertiary;
    margin: 0.5rem 0 0;
  }

  .tagline {
    font-size: 1.5rem;
    color: $text-secondary;
    margin: 1rem 0 1.5rem;
  }

  .supported-apps {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
}

.app-badge {
  display: inline-flex;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  color: $text-primary;

  &--blender { background-color: $app-blender; }
  &--cinema4d { background-color: $app-cinema4d; }
  &--houdini { background-color: $app-houdini; }
  &--aftereffects { background-color: $app-aftereffects; }
  &--nuke { background-color: $app-nuke; }
}

.screenshot-section {
  padding: 4rem 0;
  background: rgba(0, 0, 0, 0.2);

  .screenshot-wrapper {
    max-width: 1000px;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;

    &:hover {
      transform: translateY(-8px);
      box-shadow: 0 24px 80px rgba(69, 137, 255, 0.3);
    }
  }

  .app-screenshot {
    width: 100%;
    height: auto;
    display: block;
  }
}

.download-section {
  padding: 4rem 0;
  background: rgba(255, 255, 255, 0.02);

  h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 1rem;
    color: $accent-primary;
  }

  .download-subtitle {
    text-align: center;
    font-size: 1.25rem;
    color: $text-tertiary;
    margin-bottom: 3rem;
  }

  .download-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    margin-bottom: 3rem;
  }

  .download-card {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
    text-decoration: none;
    color: inherit;
    display: block;

    &:hover {
      transform: translateY(-4px);
      border-color: $accent-primary;
      box-shadow: 0 8px 24px rgba(69, 137, 255, 0.3);
    }

    .platform-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    h3 {
      font-size: 1.75rem;
      margin: 0 0 0.5rem;
      color: $text-primary;
    }

    p {
      color: $text-tertiary;
      margin: 0 0 1.5rem;
    }

    .download-button {
      background: $accent-primary;
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      transition: background-color 0.2s;

      &:hover {
        background: $accent-hover;
      }

      .file-size {
        font-size: 0.875rem;
        opacity: 0.8;
        font-weight: 400;
      }
    }
  }

  .other-formats {
    text-align: center;
    margin: 2rem 0;

    p {
      color: $text-tertiary;
      margin-bottom: 1rem;
    }

    .format-links {
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;

      a {
        color: $accent-primary;
        text-decoration: none;
        font-weight: 500;
        transition: opacity 0.2s;

        &:hover {
          opacity: 0.8;
          text-decoration: underline;
        }
      }
    }
  }

  .github-link {
    text-align: center;
    margin-top: 2rem;

    a {
      color: $text-secondary;
      text-decoration: none;
      font-size: 1.125rem;
      transition: color 0.2s;

      &:hover {
        color: $accent-primary;
      }
    }
  }
}

.features-section {
  padding: 4rem 0;

  h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: $accent-primary;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 2rem;
  }

  .feature-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
      transform: translateY(-4px);
    }

    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }

    h3 {
      font-size: 1.25rem;
      margin: 0 0 0.75rem;
      color: $text-primary;
    }

    p {
      color: $text-tertiary;
      margin: 0;
      font-size: 0.9375rem;
      line-height: 1.6;
    }
  }
}

.supported-section {
  padding: 4rem 0;
  background: rgba(255, 255, 255, 0.02);

  h2 {
    text-align: center;
    font-size: 2.5rem;
    margin-bottom: 3rem;
    color: $accent-primary;
  }

  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  .app-card {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 1.5rem;
    border-left: 4px solid;
    transition: all 0.3s ease;

    &:hover {
      transform: translateX(4px);
      background: rgba(255, 255, 255, 0.05);
    }

    &--blender { border-color: $app-blender; }
    &--cinema4d { border-color: $app-cinema4d; }
    &--houdini { border-color: $app-houdini; }
    &--aftereffects { border-color: $app-aftereffects; }
    &--nuke { border-color: $app-nuke; }

    h3 {
      font-size: 1.25rem;
      margin: 0 0 0.25rem;
      color: $text-primary;
    }

    .extensions {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.875rem;
      color: $text-tertiary;
      margin: 0 0 0.75rem;
    }

    p:last-child {
      color: $text-secondary;
      margin: 0;
      font-size: 0.9375rem;
      line-height: 1.5;
    }
  }
}

.site-footer {
  padding: 3rem 0;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);

  p {
    margin: 0.5rem 0;
    color: $text-tertiary;
  }

  a {
    color: $accent-primary;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

@media (max-width: 768px) {
  .site-header {
    .logo-section {
      flex-direction: column;
      gap: 1rem;
    }

    .title-section {
      text-align: center;
    }

    h1 {
      font-size: 2.5rem;
    }

    .tagline {
      font-size: 1.125rem;
    }

    .supported-apps {
      gap: 0.5rem;
    }
  }

  .download-section {
    .download-grid {
      grid-template-columns: 1fr;
    }

    .other-formats .format-links {
      flex-direction: column;
      gap: 1rem;
    }
  }

  .features-section h2,
  .supported-section h2,
  .download-section h2 {
    font-size: 2rem;
  }
}
</style>
