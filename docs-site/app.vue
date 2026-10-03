<template>
  <div class="docs-site">
    <header class="site-header">
      <div class="container">
        <div class="header-content">
          <div class="logo-section">
            <img
              :src="asset('assets/icon.svg')"
              alt="RenderQ logo"
              class="logo"
              @error="handleImageError"
            />
            <div class="title-section">
              <h1>RenderQ</h1>
              <p class="version">Version {{ version }}</p>
            </div>
          </div>
        </div>
        <p class="tagline">One render queue for every application in your pipeline</p>
        <p class="intro">
          Drop in scenes from Blender, Cinema 4D, Houdini, After Effects, Nuke and Maya, set each job up
          the way you need it, and let RenderQ work through them one after another, with a live preview of
          every frame, an ETA for the whole queue and a close eye on your hardware.
        </p>
        <p class="supported-apps" aria-label="Supported applications">
          <span v-for="app in apps" :key="app.key" class="app-badge" :class="`app-badge--${app.key}`">{{ app.name }}</span>
        </p>
      </div>
    </header>

    <section class="screenshot-section" aria-label="Screenshot">
      <div class="container">
        <div class="screenshot-wrapper">
          <img
            :src="asset('screenshots/renderq-screenshot.jpg')"
            alt="RenderQ rendering a Blender shot: the render queue on the left, the live preview of the latest frame top right and the system monitor below it"
            class="app-screenshot"
            width="1920"
            height="1080"
            @error="handleImageError"
          />
        </div>
      </div>
    </section>

    <section id="download" class="download-section">
      <div class="container">
        <h2>Download</h2>
        <p class="download-subtitle">Free and open source, for Windows, macOS and Linux.</p>

        <p v-if="detectedOS" class="download-recommended">Recommended for your system</p>

        <div class="download-grid" :class="`count-${prominentKeys.length}`">
          <a
            v-for="key in prominentKeys"
            :key="key"
            :href="downloadLinks[key]"
            class="download-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div class="platform-icon">
              <span class="material-symbols-outlined" aria-hidden="true">{{ platforms[key].icon }}</span>
            </div>
            <h3>{{ platforms[key].title }}</h3>
            <p>{{ platforms[key].description }}</p>
            <div class="download-button">
              <span>{{ platforms[key].button }}</span>
              <span class="file-size">{{ platforms[key].ext }}</span>
            </div>
          </a>
        </div>

        <div v-if="detectedOS === 'windows'" class="platform-note">
          <h3>First launch on Windows</h3>
          <p>
            RenderQ isn't code-signed yet, so Windows SmartScreen may say it "protected your PC".
            Choose <strong>More info</strong>, then <strong>Run anyway</strong>. You only need to do this once.
          </p>
        </div>

        <div v-if="detectedOS === 'mac'" class="platform-note">
          <h3>First launch on macOS</h3>
          <p>
            RenderQ isn't notarised yet, so macOS may refuse to open it or call it "damaged". After moving it to
            Applications, run this once in Terminal:
          </p>
          <code class="platform-command">xattr -cr /Applications/RenderQ.app</code>
        </div>

        <div v-if="otherKeys.length" class="other-os">
          <button
            type="button"
            class="other-os-toggle"
            :aria-expanded="showAllPlatforms"
            @click="showAllPlatforms = !showAllPlatforms"
          >
            {{ showAllPlatforms ? 'Hide other platforms' : 'Show other platforms' }}
          </button>

          <div v-if="showAllPlatforms" class="download-grid" :class="`count-${otherKeys.length}`">
            <a
              v-for="key in otherKeys"
              :key="key"
              :href="downloadLinks[key]"
              class="download-card"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div class="platform-icon">
                <span class="material-symbols-outlined" aria-hidden="true">{{ platforms[key].icon }}</span>
              </div>
              <h3>{{ platforms[key].title }}</h3>
              <p>{{ platforms[key].description }}</p>
              <div class="download-button">
                <span>{{ platforms[key].button }}</span>
                <span class="file-size">{{ platforms[key].ext }}</span>
              </div>
            </a>
          </div>
        </div>

        <div class="other-formats">
          <p>Other formats:</p>
          <div class="format-links">
            <a :href="downloadLinks.deb" target="_blank" rel="noopener noreferrer">Debian/Ubuntu (.deb, x64)</a>
            <a :href="downloadLinks.debArm" target="_blank" rel="noopener noreferrer">Debian/Ubuntu (.deb, ARM64)</a>
            <a :href="downloadLinks.rpm" target="_blank" rel="noopener noreferrer">Fedora/RHEL (.rpm, x64)</a>
            <a :href="downloadLinks.rpmArm" target="_blank" rel="noopener noreferrer">Fedora/RHEL (.rpm, ARM64)</a>
            <a :href="downloadLinks.appImageArm" target="_blank" rel="noopener noreferrer">AppImage (ARM64)</a>
            <a :href="downloadLinks.macArmZip" target="_blank" rel="noopener noreferrer">macOS Apple Silicon (.zip)</a>
            <a :href="downloadLinks.macIntelZip" target="_blank" rel="noopener noreferrer">macOS Intel (.zip)</a>
          </div>
        </div>

        <div class="github-link">
          <a href="https://github.com/tdoukinitsas/RenderQ/releases/latest" target="_blank" rel="noopener noreferrer">
            View all releases on GitHub →
          </a>
        </div>
      </div>
    </section>

    <section id="features" class="features-section">
      <div class="container">
        <h2>Features</h2>

        <div class="features-group">
          <h3 class="features-group-title">Build the queue</h3>
          <p class="features-group-intro">
            Every job keeps its own application, frame range and settings, so a Blender lighting pass, a Nuke
            comp and an After Effects trailer can sit in the same queue and render overnight.
          </p>
        </div>

        <FeatureHighlight
          title="Per-job render settings"
          :image-src="asset('screenshots/renderq_screenshot_job_settings.jpg')"
          image-alt="A Blender job opened up to show its render engine, compute device, view layers and render options"
        >
          <p>
            RenderQ reads each scene when you add it: frame range, output path, resolution, format, render engine
            and view layers. Open a job to change what you need for this render only, without touching the file.
          </p>
          <ul>
            <li><strong>Blender:</strong> engine, CPU or GPU device (CUDA, OptiX, HIP, oneAPI or Metal, detected for your GPU), view layers, one process per layer, frames per process, factory startup and a pre-render Python script</li>
            <li><strong>Any job:</strong> custom frame ranges such as <code>1-100, 150-200, 250</code>, custom resolution and output path</li>
            <li><strong>Resume:</strong> frames that already exist are skipped, so a stopped render carries on where it left off</li>
          </ul>
        </FeatureHighlight>

        <FeatureHighlight
          title="Nuke Write nodes and licences"
          :image-src="asset('screenshots/renderq_screenshot_nuke.jpg')"
          image-alt="A Nuke job listing the comp's Write nodes, the detected NukeX licence and render options"
        >
          <p>
            Nuke comps open with the right licence automatically: Nuke, NukeX, Indie or Non-commercial. Tick
            the Write nodes to render. RenderQ warns about Write nodes without a frame number, and about errors
            Nuke reported while loading the comp.
          </p>
          <p>
            Long renders can be split into several Nuke processes to free memory, and every finished frame
            shows up in the preview while the rest are still rendering.
          </p>
        </FeatureHighlight>

        <FeatureHighlight
          title="Organise the queue quickly"
          :image-src="asset('screenshots/renderq_screenshot_multiselect.jpg')"
          image-alt="Three jobs selected together, with a right-click menu offering Move to Top, Move to Bottom, Reset to Pending and Remove for all three"
        >
          <p>
            Drag scene files straight into the queue and drag jobs to reorder them. Select several with
            <kbd>Ctrl</kbd>/<kbd>Shift</kbd>-click or <kbd>Ctrl</kbd>+<kbd>A</kbd>, then move, reset or remove them together.
          </p>
          <ul>
            <li>Right-click for <strong>Duplicate</strong>, <strong>Move to Top</strong> (render next), <strong>Move to Bottom</strong>, <strong>Reset to Pending</strong>, or open the output or project folder</li>
            <li>The header sums up the queue: jobs pending, complete or needing attention, and frames still to render</li>
            <li>Queues save to JSON files and auto-save as you work, so nothing is lost if the app closes</li>
          </ul>
        </FeatureHighlight>

        <div class="features-group">
          <h3 class="features-group-title">Watch it render</h3>
          <p class="features-group-intro">
            See every frame as it lands, step back through what's done, and check details before the whole
            sequence is finished.
          </p>
        </div>

        <FeatureHighlight
          title="Live preview with zoom and frame stepping"
          :image-src="asset('screenshots/renderq_screenshot_preview_zoom.jpg')"
          image-alt="The preview zoomed to 242 percent on an earlier frame of the sequence, with frame stepping controls below"
        >
          <p>
            The newest frame appears as soon as it's written, including EXRs with a layer picker for multi-layer
            files. Scroll to zoom in on the spot you want to check, drag to pan, and switch between
            <strong>Fit</strong> and <strong>1:1</strong> with <kbd>0</kbd> and <kbd>1</kbd>.
          </p>
          <p>
            Step through rendered frames with <kbd>←</kbd>/<kbd>→</kbd> or the scrubber, which shows each frame's own
            number, or play the sequence back at the scene's frame rate.
          </p>
        </FeatureHighlight>

        <FeatureHighlight
          title="Full view"
          :image-src="asset('screenshots/renderq_screenshot_fullview.jpg')"
          image-alt="A rendered frame filling the whole window, with the playback controls along the bottom"
        >
          <p>
            Press <kbd>F</kbd> or double-click the preview to give a frame the whole window, and press
            <kbd>Esc</kbd> to go back. Zoom, panning and frame stepping all keep working.
          </p>
        </FeatureHighlight>

        <div class="features-group">
          <h3 class="features-group-title">Keep an eye on the machine</h3>
          <p class="features-group-intro">
            Know how hard your hardware is working and what each render process is doing.
          </p>
        </div>

        <FeatureHighlight
          title="System monitor"
          :image-src="asset('screenshots/renderq_screenshot_monitor_graph.jpg')"
          image-alt="The system monitor's graph of CPU, RAM, GPU and VRAM usage over the last five minutes"
        >
          <p>
            CPU, RAM, GPU and VRAM usage as bars, with sparklines once there's room, or as a graph covering
            30 seconds to an hour. GPU readings come from <code>nvidia-smi</code> on NVIDIA cards.
          </p>
          <p>
            The queue's progress and remaining time also appear in the window title and the Windows taskbar.
            You get a desktop notification when a job or the whole queue finishes, or when something fails.
          </p>
        </FeatureHighlight>

        <FeatureHighlight
          title="Processes and logs"
          :image-src="asset('screenshots/renderq_screenshot_processes.jpg')"
          image-alt="The Processes tab listing the running Blender process and a finished Nuke process, with Blender's output log below"
        >
          <p>
            Every render process RenderQ starts is listed with its full command line and live output, so you
            can see exactly what Blender, Nuke or aerender is doing and why a job failed. The <strong>Log</strong>
            tab keeps RenderQ's own history.
          </p>
        </FeatureHighlight>

        <div class="features-group">
          <h3 class="features-group-title">A workspace that fits you</h3>
          <p class="features-group-intro">
            Resize, hide and rearrange the panels, and drive the whole app from the keyboard.
          </p>
        </div>

        <FeatureHighlight
          title="Keyboard shortcuts and accessibility"
          :image-src="asset('screenshots/renderq_screenshot_shortcuts.jpg')"
          image-alt="The keyboard shortcuts overlay, listing shortcuts for the queue, jobs, preview and layout"
        >
          <p>
            Press <kbd>?</kbd> to see every shortcut: <kbd>Space</kbd> starts or pauses rendering,
            <kbd>Ctrl</kbd>+<kbd>I</kbd> adds files, arrow keys move through the queue and <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>
            reorders it.
          </p>
          <ul>
            <li>Panel dividers can be moved with the keyboard and read out by screen readers</li>
            <li>Every icon button has a label, and render progress and errors are announced</li>
            <li>Visible focus rings, and animations switched off when your system asks for reduced motion</li>
          </ul>
        </FeatureHighlight>

        <FeatureHighlight
          title="Flexible layout and auto-detection"
          :image-src="asset('screenshots/renderq_screenshot_settings.jpg')"
          image-alt="The Settings dialog listing a detected Blender installation, with tabs for each supported application"
        >
          <p>
            The queue takes a third of the window and the preview the rest, with the monitor sized to fit its
            bars. Drag the dividers or collapse any panel. The layout keeps its proportions when you resize the
            window and is remembered next time. Double-click a divider to reset it.
          </p>
          <p>
            Installed versions of each application are found automatically. Pick a different version, or
            point to a custom path, in Settings.
          </p>
        </FeatureHighlight>

        <div class="feature-grid">
          <div v-for="item in moreFeatures" :key="item.title" class="feature-card">
            <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="applications" class="supported-section">
      <div class="container">
        <h2>Supported Applications</h2>
        <p class="section-subtitle">RenderQ drives each application's own command-line renderer.</p>

        <div class="apps-grid">
          <div v-for="app in apps" :key="app.key" class="app-card" :class="`app-card--${app.key}`">
            <h3>{{ app.name }}</h3>
            <p class="extensions">{{ app.extensions }}</p>
            <p>{{ app.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="contribute-section">
      <div class="container">
        <h2>Open Source</h2>
        <div class="contribute-grid">
          <div class="contribute-card">
            <h3>Free to use</h3>
            <p>No accounts, no subscriptions and no render limits, for personal and commercial work.</p>
          </div>
          <div class="contribute-card">
            <h3>AGPL-3.0</h3>
            <p>The source is open: read it, build it yourself and adapt it to your pipeline.</p>
          </div>
          <div class="contribute-card">
            <h3>Contribute</h3>
            <p>Bug reports, feature ideas and pull requests are welcome on GitHub.</p>
          </div>
        </div>
        <div class="contribute-cta">
          <a href="https://github.com/tdoukinitsas/RenderQ" target="_blank" rel="noopener noreferrer" class="contribute-button">
            View on GitHub
          </a>
        </div>
      </div>
    </section>

    <footer class="site-footer">
      <div class="container">
        <p>
          <strong>RenderQ</strong> is licensed under
          <a href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener noreferrer">AGPL-3.0</a>
        </p>
        <p>
          Developed by
          <a href="https://github.com/tdoukinitsas" target="_blank" rel="noopener noreferrer">Thomas Doukinitsas</a>
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

// Files in public/ are served under the site's base path ("/RenderQ/"). Bind these URLs
// dynamically (:src) so Vite doesn't try to import them from the source tree at build time.
const baseURL = useRuntimeConfig().app.baseURL;
const asset = (path: string) => `${baseURL}${path.replace(/^\/+/, '')}`;

const version = ref('2.5.0');

const apps = [
  {
    key: 'blender',
    name: 'Blender',
    extensions: '.blend',
    description: 'Cycles, EEVEE and Workbench on CPU or GPU (CUDA, OptiX, HIP, oneAPI, Metal). Choose view layers, render them as separate processes, skip frames already on disk and run a Python script before rendering.',
  },
  {
    key: 'cinema4d',
    name: 'Cinema 4D',
    extensions: '.c4d',
    description: 'Command-line rendering with takes and your choice of thread count.',
  },
  {
    key: 'houdini',
    name: 'Houdini',
    extensions: '.hip, .hiplc, .hipnc',
    description: 'Batch rendering of a ROP node with hbatch or hython, for Mantra, Karma and other engines.',
  },
  {
    key: 'aftereffects',
    name: 'After Effects',
    extensions: '.aep, .aepx',
    description: 'Render compositions with aerender, using render settings and output module templates, with multi-frame rendering.',
  },
  {
    key: 'nuke',
    name: 'Nuke',
    extensions: '.nk, .nknc, .nkind',
    description: 'Nuke, NukeX, Indie and Non-commercial, with the licence detected automatically. Pick the Write nodes per job, skip frames already rendered and preview every finished frame.',
  },
  {
    key: 'maya',
    name: 'Maya',
    extensions: '.ma, .mb',
    description: "Batch rendering with Maya's Render command, with a per-job renderer: Arnold, V-Ray, RenderMan, Redshift or Maya's own. Frame range and output are read from .ma files.",
  },
];

const moreFeatures = [
  { icon: 'upload_file', title: 'Drag & drop', text: 'Drop scene files from any supported application onto the queue.' },
  { icon: 'pause_circle', title: 'Pause, resume, stop', text: 'Pause mid-queue and pick up where you left off.' },
  { icon: 'schedule', title: 'Queue ETA', text: 'Time remaining and expected finish time for the whole queue.' },
  { icon: 'warning', title: 'Overwrite protection', text: 'Warns before overwriting existing frames, or renders only the missing ones.' },
  { icon: 'notifications', title: 'Notifications', text: 'Desktop alerts when renders finish or fail.' },
  { icon: 'save', title: 'Auto-save', text: 'The queue is saved continuously and restored on the next launch.' },
];

// Download cards. With a detected OS only its builds are shown up front; the rest are behind a toggle.
type PlatformKey = 'windows' | 'macArm' | 'macIntel' | 'linux';
const allPlatformKeys: PlatformKey[] = ['windows', 'macArm', 'macIntel', 'linux'];
const osPlatformMap: Record<string, PlatformKey[]> = {
  windows: ['windows'],
  mac: ['macArm', 'macIntel'],
  linux: ['linux'],
};

const platforms: Record<PlatformKey, { icon: string; title: string; description: string; button: string; ext: string }> = {
  windows: { icon: 'desktop_windows', title: 'Windows', description: 'Windows 10/11 (x64 and ARM64)', button: 'Download Installer', ext: '.exe' },
  macArm: { icon: 'laptop_mac', title: 'macOS (Apple Silicon)', description: 'M1 and later', button: 'Download DMG', ext: '.dmg' },
  macIntel: { icon: 'laptop_mac', title: 'macOS (Intel)', description: 'Intel Macs', button: 'Download DMG', ext: '.dmg' },
  linux: { icon: 'terminal', title: 'Linux', description: 'Universal Linux (x64)', button: 'Download AppImage', ext: '.AppImage' },
};

const detectedOS = ref<string | null>(null);
const showAllPlatforms = ref(false);

const prominentKeys = computed<PlatformKey[]>(() =>
  detectedOS.value ? osPlatformMap[detectedOS.value] ?? [...allPlatformKeys] : [...allPlatformKeys]);
const otherKeys = computed<PlatformKey[]>(() => allPlatformKeys.filter(k => !prominentKeys.value.includes(k)));

const detectOS = (): string | null => {
  if (typeof navigator === 'undefined') return null;
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) {
    const p = String(uaData.platform).toLowerCase();
    if (p.includes('win')) return 'windows';
    if (p.includes('mac')) return 'mac';
    if (p.includes('linux') || p.includes('chrome os')) return 'linux';
  }
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return null;
};

// Asset names as electron-builder publishes them to the GitHub release
const downloadLinks = computed(() => {
  const v = version.value;
  const base = `https://github.com/tdoukinitsas/RenderQ/releases/download/v${v}`;
  return {
    windows: `${base}/RenderQ.Setup.${v}.exe`,
    macArm: `${base}/RenderQ-${v}-arm64.dmg`,
    macIntel: `${base}/RenderQ-${v}.dmg`,
    linux: `${base}/RenderQ-${v}.AppImage`,
    appImageArm: `${base}/RenderQ-${v}-arm64.AppImage`,
    deb: `${base}/renderq_${v}_amd64.deb`,
    debArm: `${base}/renderq_${v}_arm64.deb`,
    rpm: `${base}/renderq-${v}.x86_64.rpm`,
    rpmArm: `${base}/renderq-${v}.aarch64.rpm`,
    macArmZip: `${base}/RenderQ-${v}-arm64-mac.zip`,
    macIntelZip: `${base}/RenderQ-${v}-mac.zip`,
  };
});

const handleImageError = (event: Event) => {
  (event.target as HTMLImageElement).style.display = 'none';
};

onMounted(async () => {
  detectedOS.value = detectOS();

  // The deploy workflow copies the app's package.json next to the site
  try {
    const res = await fetch(asset('package.json'));
    const pkg = await res.json();
    if (pkg?.version) version.value = pkg.version;
  } catch (error) {
    console.error('Failed to fetch version:', error);
  }
});

const title = 'RenderQ - Multi-Application Render Queue Manager';
const description = 'Free, open-source render queue for Blender, Cinema 4D, Houdini, After Effects, Nuke and Maya, with live preview, system monitoring and keyboard shortcuts. For Windows, macOS and Linux.';
const ogImage = 'https://tdoukinitsas.github.io/RenderQ/screenshots/renderq-screenshot.jpg';

useHead({
  title,
  htmlAttrs: { lang: 'en' },
  meta: [{ name: 'description', content: description }],
});

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: 'https://tdoukinitsas.github.io/RenderQ/',
  ogImage,
  ogImageWidth: '1920',
  ogImageHeight: '1080',
  ogImageType: 'image/jpeg',
  twitterCard: 'summary_large_image',
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: ogImage,
});
</script>

<style scoped lang="scss">
$accent-primary: #4589ff;
$accent-hover: #78a9ff;
$bg-primary: #161616;
$text-primary: #ffffff;
$text-secondary: rgba(255, 255, 255, 0.82);
$text-tertiary: rgba(255, 255, 255, 0.65);

$app-blender: #ff9966;
$app-cinema4d: #3b82f6;
$app-houdini: #ff6b35;
$app-aftereffects: #9d4edd;
$app-nuke: #fbbf24;
$app-maya: #00b4b4;

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

a:focus-visible,
button:focus-visible {
  outline: 2px solid $accent-primary;
  outline-offset: 3px;
}

h2 {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: $accent-primary;
}

.section-subtitle,
.download-subtitle {
  text-align: center;
  font-size: 1.2rem;
  color: $text-tertiary;
  margin-bottom: 3rem;
}

.site-header {
  padding: 4rem 0 2.5rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .header-content {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .logo-section {
    display: flex;
    align-items: center;
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
    margin: 1rem 0 0;
  }

  .intro {
    max-width: 760px;
    font-size: 1.125rem;
    line-height: 1.7;
    color: $text-tertiary;
    margin: 0.75rem auto 1.5rem;
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
  color: #1a1a1a;

  &--blender { background-color: $app-blender; }
  &--cinema4d { background-color: $app-cinema4d; color: #fff; }
  &--houdini { background-color: $app-houdini; }
  &--aftereffects { background-color: $app-aftereffects; color: #fff; }
  &--nuke { background-color: $app-nuke; }
  &--maya { background-color: $app-maya; }
}

.screenshot-section {
  padding: 4rem 0;
  background: rgba(0, 0, 0, 0.2);

  .screenshot-wrapper {
    max-width: 1100px;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
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

  .download-subtitle {
    margin-bottom: 2rem;
  }

  .download-recommended {
    text-align: center;
    color: $text-tertiary;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 1rem;
  }

  .download-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .download-card {
    flex: 0 1 260px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;

    &:hover {
      transform: translateY(-4px);
      border-color: $accent-primary;
      box-shadow: 0 8px 24px rgba(69, 137, 255, 0.3);
    }

    .platform-icon .material-symbols-outlined {
      font-size: 3rem;
      color: $accent-primary;
    }

    h3 {
      font-size: 1.4rem;
      margin: 0.75rem 0 0.5rem;
    }

    p {
      color: $text-tertiary;
      margin: 0 0 1.5rem;
      flex: 1;
    }

    .download-button {
      background: $accent-primary;
      color: #161616;
      padding: 0.9rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      transition: background-color 0.2s;

      .file-size {
        font-size: 0.875rem;
        opacity: 0.8;
        font-weight: 400;
      }
    }

    &:hover .download-button {
      background: $accent-hover;
    }
  }

  .platform-note {
    max-width: 680px;
    margin: 0 auto 2rem;
    padding: 1.25rem 1.5rem;
    border-radius: 10px;
    background: rgba(69, 137, 255, 0.08);
    border: 1px solid rgba(69, 137, 255, 0.3);

    h3 {
      font-size: 1.1rem;
      margin: 0 0 0.5rem;
    }

    p {
      color: $text-secondary;
      line-height: 1.6;
      margin: 0;
    }

    .platform-command {
      display: block;
      margin-top: 0.75rem;
      padding: 0.6rem 0.9rem;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.35);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.95rem;
      user-select: all;
    }
  }

  .other-os {
    text-align: center;
    margin-bottom: 1rem;

    .other-os-toggle {
      background: none;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 999px;
      color: $text-secondary;
      padding: 0.5rem 1.25rem;
      font: inherit;
      cursor: pointer;
      margin-bottom: 1.5rem;

      &:hover {
        border-color: $accent-primary;
        color: $text-primary;
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
      gap: 0.75rem 2rem;
      flex-wrap: wrap;

      a {
        color: $accent-primary;
        text-decoration: none;
        font-weight: 500;

        &:hover {
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

      &:hover {
        color: $accent-primary;
      }
    }
  }
}

.features-section {
  padding: 4rem 0;

  .features-group {
    text-align: center;
    margin: 3.5rem auto 0.5rem;
    max-width: 760px;

    &:first-of-type {
      margin-top: 1.5rem;
    }
  }

  .features-group-title {
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: $text-tertiary;
    margin: 0 0 0.75rem;
  }

  .features-group-intro {
    font-size: 1.125rem;
    line-height: 1.7;
    color: $text-secondary;
    margin: 0;
  }

  :deep(code) {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.9em;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.25rem;
    margin-top: 3rem;
  }

  .feature-card {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1.25rem 1.5rem;

    .material-symbols-outlined {
      font-size: 2rem;
      color: $accent-primary;
    }

    h3 {
      font-size: 1.1rem;
      margin: 0 0 0.25rem;
    }

    p {
      color: $text-tertiary;
      margin: 0;
      line-height: 1.5;
    }
  }
}

.supported-section {
  padding: 4rem 0;
  background: rgba(255, 255, 255, 0.02);

  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.5rem;
  }

  .app-card {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 1.5rem;
    border-left: 4px solid;

    &--blender { border-color: $app-blender; }
    &--cinema4d { border-color: $app-cinema4d; }
    &--houdini { border-color: $app-houdini; }
    &--aftereffects { border-color: $app-aftereffects; }
    &--nuke { border-color: $app-nuke; }
    &--maya { border-color: $app-maya; }

    h3 {
      font-size: 1.25rem;
      margin: 0 0 0.25rem;
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
      font-size: 0.975rem;
      line-height: 1.55;
    }
  }
}

.contribute-section {
  padding: 4rem 0;

  h2 {
    margin-bottom: 2.5rem;
  }

  .contribute-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.5rem;
  }

  .contribute-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;

    h3 {
      margin: 0 0 0.5rem;
      font-size: 1.2rem;
    }

    p {
      color: $text-tertiary;
      margin: 0;
      line-height: 1.6;
    }
  }

  .contribute-cta {
    text-align: center;
    margin-top: 2.5rem;
  }

  .contribute-button {
    display: inline-block;
    background: $accent-primary;
    color: #161616;
    font-weight: 600;
    padding: 0.9rem 2rem;
    border-radius: 8px;
    text-decoration: none;

    &:hover {
      background: $accent-hover;
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

@media (prefers-reduced-motion: reduce) {
  .download-card,
  :deep(.feature-image) {
    transition: none !important;
    transform: none !important;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  h2 {
    font-size: 2rem;
  }

  .site-header {
    .logo-section {
      flex-direction: column;
      gap: 1rem;
    }

    .title-section {
      text-align: center;
    }

    h1 {
      font-size: 2.75rem;
    }

    .tagline {
      font-size: 1.2rem;
    }
  }

  .download-section .download-card {
    flex-basis: 100%;
  }

  .supported-section .apps-grid,
  .features-section .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>
