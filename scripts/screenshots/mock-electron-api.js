// Mock of the Electron preload API (window.electronAPI) for running the RenderQ UI in a plain
// browser, e.g. to take screenshots for the docs site. Nothing here is loaded by the app itself.
//
// Usage: start `npm run dev`, then inject this file before the page's own scripts, for example
//   - Chrome DevTools MCP: navigate_page({ url: 'http://localhost:3000', initScript: <this file> })
//   - Playwright: page.addInitScript({ path: 'scripts/screenshots/mock-electron-api.js' })
// It provides a sample queue (one job per application), live system stats and a procedural
// "render" for the preview. window.__renderqMock exposes the event callbacks the app registers.
(() => {
  const GB = 1024 ** 3;
  const listeners = {};

  // A procedural landscape that stands in for a rendered frame
  function renderFrame(frame = 0, w = 1920, h = 1080) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const t = frame / 120;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b1e3f');
    sky.addColorStop(0.55, '#e0743a');
    sky.addColorStop(1, '#f6c27a');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const sunY = h * (0.62 - 0.08 * t);
    const sun = g.createRadialGradient(w * 0.62, sunY, 0, w * 0.62, sunY, h * 0.5);
    sun.addColorStop(0, 'rgba(255,240,200,1)');
    sun.addColorStop(0.12, 'rgba(255,214,150,0.9)');
    sun.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    const ridges = [['#5b2d4f', 0.62, 0.9], ['#3a1f3d', 0.7, 1.4], ['#1d1229', 0.8, 2.1]];
    for (const [color, base, freq] of ridges) {
      g.fillStyle = color;
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = h * base - Math.sin(x / w * Math.PI * freq * 2 + freq) * h * 0.06
          - Math.sin(x / w * Math.PI * freq * 5) * h * 0.025;
        g.lineTo(x, y);
      }
      g.lineTo(w, h); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `${Math.round(h * 0.022)}px "IBM Plex Mono", monospace`;
    g.fillText(`shot_010  f${String(1001 + frame).padStart(4, '0')}`, w * 0.03, h * 0.95);
    return c.toDataURL('image/jpeg', 0.9);
  }

  let tick = 0;
  function systemInfo() {
    tick++;
    const wave = (base, amp, speed, phase = 0) => Math.max(0, Math.min(100, base + amp * Math.sin(tick / speed + phase) + (Math.random() - 0.5) * amp * 0.4));
    const vram = wave(71, 3, 9, 1);
    return {
      cpu: { usage: wave(38, 10, 5), cores: 16, model: 'AMD Ryzen 9 7950X', speed: 4.5, physicalCores: 16, threads: 32 },
      memory: { used: 41.3 * GB, total: 64 * GB, percentage: wave(64, 2, 11), speed: 6000, type: 'DDR5', slots: 2, totalSlots: 4 },
      gpu: { name: 'NVIDIA GeForce RTX 4090', usage: wave(96, 3, 3), vram: { used: 24564 * vram / 100, total: 24564, percentage: vram } },
    };
  }

  const frames = (dir, name, ext, from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) => `${dir}\\${name}${String(from + i).padStart(4, '0')}.${ext}`);
  const base = {
    useCustomFrameRange: false, resolution: { x: 1920, y: 1080, percentage: 100 }, fps: 24,
    progress: 0, currentFrame: 0, totalFrames: 0, currentSample: 0, totalSamples: 0, elapsedTime: 0,
    estimatedTimeRemaining: 0, lastRenderedFrame: null, error: null, renderStartTime: null, frameTimes: [],
    isVideoOutput: false, renderedFramePaths: [], exrLayers: [],
  };
  const rendered = frames('D:\\Projects\\Sunset\\renders\\shot_010', 'shot_010_', 'png', 1001, 1048);
  const queue = [
    {
      ...base, id: 'job-1', applicationType: 'blender', status: 'rendering',
      filePath: 'D:\\Projects\\Sunset\\shot_010_lighting.blend', fileName: 'shot_010_lighting.blend',
      originalFrameStart: 1001, originalFrameEnd: 1120, frameRanges: '1001-1120',
      outputDir: 'D:\\Projects\\Sunset\\renders\\shot_010', outputPath: 'D:\\Projects\\Sunset\\renders\\shot_010\\shot_010_####.png',
      renderEngine: 'CYCLES', format: 'PNG', progress: 40, currentFrame: 48, totalFrames: 120, currentFrameNumber: 1049,
      currentSample: 312, totalSamples: 512, estimatedTimeRemaining: 52 * 60 * 1000, renderPhase: 'render',
      renderedFramePaths: rendered, lastRenderedFrame: rendered[rendered.length - 1],
      viewLayers: [{ name: 'Beauty', use: true }, { name: 'Characters', use: true }, { name: 'Background', use: true }],
      appSettings: { cyclesDevice: 'OPTIX' },
    },
    {
      ...base, id: 'job-2', applicationType: 'nuke', status: 'complete', progress: 100,
      filePath: 'D:\\Projects\\Sunset\\comp\\shot_005_comp_v012.nk', fileName: 'shot_005_comp_v012.nk',
      originalFrameStart: 1001, originalFrameEnd: 1096, frameRanges: '1001-1096', currentFrame: 96, totalFrames: 96,
      outputDir: 'D:\\Projects\\Sunset\\comp\\out', outputPath: 'D:\\Projects\\Sunset\\comp\\out\\shot_005_comp_####.exr',
      renderEngine: 'Nuke', format: 'OPEN_EXR', nukeVersion: 'Nuke 15.1v3', nukeLicense: 'nukex',
      writeNodes: [
        { name: 'Write_EXR', class: 'Write', file: 'D:/Projects/Sunset/comp/out/shot_005_comp_####.exr', fileType: 'exr', disabled: false, connected: true, movie: false, hasFrameNumber: true, useLimit: false, first: null, last: null },
        { name: 'Write_Review', class: 'Write', file: 'D:/Projects/Sunset/comp/review/shot_005_v012.mov', fileType: 'mov', disabled: false, connected: true, movie: true, hasFrameNumber: false, useLimit: false, first: null, last: null },
      ],
    },
    {
      ...base, id: 'job-3', applicationType: 'houdini', status: 'idle',
      filePath: 'D:\\Projects\\Sunset\\fx\\ocean_sim_v004.hip', fileName: 'ocean_sim_v004.hip',
      originalFrameStart: 1, originalFrameEnd: 240, frameRanges: '1-240',
      outputDir: 'D:\\Projects\\Sunset\\fx\\render', outputPath: 'D:\\Projects\\Sunset\\fx\\render\\ocean.$F4.exr',
      renderEngine: 'Karma', format: 'EXR', renderNode: '/out/karma1',
    },
    {
      ...base, id: 'job-4', applicationType: 'cinema4d', status: 'idle',
      filePath: 'D:\\Projects\\Sunset\\mograph\\title_card.c4d', fileName: 'title_card.c4d',
      originalFrameStart: 0, originalFrameEnd: 150, frameRanges: '0-150',
      outputDir: 'D:\\Projects\\Sunset\\mograph\\out', outputPath: 'D:\\Projects\\Sunset\\mograph\\out\\title_card_####.png',
      renderEngine: 'Redshift', format: 'PNG', resolution: { x: 3840, y: 2160, percentage: 100 }, fps: 25,
    },
    {
      ...base, id: 'job-5', applicationType: 'aftereffects', status: 'idle',
      filePath: 'D:\\Projects\\Sunset\\edit\\sunset_trailer.aep', fileName: 'sunset_trailer.aep',
      originalFrameStart: 0, originalFrameEnd: 1439, frameRanges: '0-1439',
      outputDir: 'D:\\Projects\\Sunset\\edit\\exports', outputPath: 'D:\\Projects\\Sunset\\edit\\exports\\sunset_trailer.mp4',
      renderEngine: 'AE Render', format: 'H.264', isVideoOutput: true, composition: 'Trailer_Main',
    },
    {
      ...base, id: 'job-6', applicationType: 'maya', status: 'idle',
      filePath: 'D:\\Projects\\Sunset\\anim\\hero_turntable.ma', fileName: 'hero_turntable.ma',
      originalFrameStart: 1, originalFrameEnd: 100, frameRanges: '1-100',
      outputDir: 'D:\\Projects\\Sunset\\anim\\images', outputPath: 'D:\\Projects\\Sunset\\anim\\images\\hero_turntable.####.exr',
      renderEngine: 'arnold', format: 'EXR',
    },
  ];

  const install = (version, path) => [{ version, path, commandLinePath: path, folder: path }];
  const installs = {
    blender: install('4.2.3', 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe'),
    cinema4d: install('2025.1', 'C:\\Program Files\\Maxon Cinema 4D 2025\\Commandline.exe'),
    houdini: install('20.5.410', 'C:\\Program Files\\Side Effects Software\\Houdini 20.5.410\\bin\\hython.exe'),
    aftereffects: install('2025', 'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\aerender.exe'),
    nuke: install('15.1v3', 'C:\\Program Files\\Nuke15.1v3\\Nuke15.1.exe'),
    maya: install('2025', 'C:\\Program Files\\Autodesk\\Maya2025\\bin\\Render.exe'),
  };
  const appPaths = Object.fromEntries(Object.entries(installs).map(([k, v]) => [k, v[0].path]));

  const startedAt = Date.now() - 41 * 60 * 1000;
  const processes = [
    { id: 'p1', pid: 18244, name: 'blender', status: 'running', startedAt, lastUpdate: Date.now(),
      commandLine: '"blender.exe" -b "D:\\Projects\\Sunset\\shot_010_lighting.blend" -E CYCLES -o //renders/shot_010/shot_010_#### -s 1001 -e 1120 -a -- --cycles-device OPTIX' },
    { id: 'p2', pid: 9120, name: 'nuke', status: 'exited', exitCode: 0, startedAt: startedAt - 30 * 60 * 1000, endedAt: startedAt,
      commandLine: '"Nuke15.1.exe" -x -i -F 1001-1096 "D:\\Projects\\Sunset\\comp\\shot_005_comp_v012.nk"' },
  ];
  const blenderLog = Array.from({ length: 14 }, (_, i) =>
    `Fra:${1035 + i} Mem:6812.4M (Peak 7120.9M) | Time:00:${String(48 + (i * 7) % 11).padStart(2, '0')}.${String(10 + i * 3).slice(-2)} | Sample 512/512\nSaved: 'D:\\Projects\\Sunset\\renders\\shot_010\\shot_010_${1035 + i}.png'`).join('\n')
    + '\nFra:1049 Mem:6814.0M (Peak 7120.9M) | Time:00:31.07 | Remaining:00:20.41 | Sample 312/512';
  const appLog = [
    '[12:01:07] RenderQ 2.5.0 started',
    '[12:01:08] Found Blender 4.2.3, Cinema 4D 2025.1, Houdini 20.5.410, After Effects 2025, Nuke 15.1v3, Maya 2025',
    '[12:01:09] Restored auto-saved queue (6 jobs)',
    '[12:02:15] Starting job: shot_005_comp_v012.nk (Nuke, frames 1001-1096)',
    '[12:31:52] Finished job: shot_005_comp_v012.nk in 29m 37s',
    '[12:31:53] Starting job: shot_010_lighting.blend (Blender, frames 1001-1120, OptiX)',
    '[12:31:58] Skipping 0 frames that are already rendered',
  ];

  const ok = (extra = {}) => Promise.resolve({ success: true, ...extra });
  const api = {
    getAppVersion: () => Promise.resolve('2.5.0'),
    getSettings: () => Promise.resolve({ applicationPaths: appPaths, autoSave: true, notifications: true }),
    saveSettings: () => ok(),
    loadAutoSavedQueue: () => ok({ queue: JSON.parse(JSON.stringify(queue)) }),
    autoSaveQueue: () => ok(),
    getSystemInfo: () => Promise.resolve(systemInfo()),
    getGpuCapabilities: () => Promise.resolve({
      hasGpu: true, devices: [{ name: 'NVIDIA GeForce RTX 4090', vendor: 'NVIDIA' }],
      supportedBackends: ['CPU', 'CUDA', 'OPTIX'],
    }),
    findBlenderInstallations: () => Promise.resolve(installs.blender),
    findCinema4DInstallations: () => Promise.resolve(installs.cinema4d),
    findHoudiniInstallations: () => Promise.resolve(installs.houdini),
    findAfterEffectsInstallations: () => Promise.resolve(installs.aftereffects),
    findNukeInstallations: () => Promise.resolve(installs.nuke),
    findMayaInstallations: () => Promise.resolve(installs.maya),
    findAllAppInstallations: () => Promise.resolve(installs),
    detectNukeLicenses: () => Promise.resolve([]),
    pathExists: () => Promise.resolve(true),
    readImage: (p) => {
      const m = /(\d{4})\.\w+$/.exec(p || '');
      return ok({ data: renderFrame(m ? Math.max(0, parseInt(m[1], 10) - 1001) : 47) });
    },
    readExrLayer: () => ok({ data: renderFrame(47) }),
    getExrLayers: () => ok({ layers: ['Combined', 'Diffuse', 'Specular', 'Emission', 'Depth'] }),
    getSpawnedProcesses: () => ok({ processes }),
    getSpawnedProcessLog: (id) => ok({ log: id === 'p1' ? blenderLog : 'Nuke 15.1v3 render finished: 96 frames' }),
    getAppLog: () => ok({ lines: appLog }),
    setWindowTitle: (t) => { document.title = t; },
  };

  // Once the app has mounted: hide the dev overlays, put the queue in a "rendering" state
  // and give the system monitor some history, ready for screenshots.
  async function stage() {
    const style = document.createElement('style');
    style.textContent = '#nuxt-devtools-container, #vue-inspector-container { display: none !important; }';
    document.head.appendChild(style);
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia;
    const q = pinia._s.get('renderQueue');
    const monitor = pinia._s.get('systemMonitor');
    q.currentJobIndex = q.jobs.findIndex((j) => j.status === 'rendering');
    q.isRendering = true;
    q.totalProgress = 37;
    q.totalEstimatedTime = (2 * 60 + 14) * 60 * 1000;
    const series = (base, amp, speed, phase) => Array.from({ length: 600 }, (_, i) =>
      Math.max(0, Math.min(100, base + amp * Math.sin(i / speed + phase) + amp * 0.35 * Math.sin(i / (speed / 3.7)))));
    monitor.history.cpu = series(38, 12, 9, 0);
    monitor.history.memory = series(64, 2, 40, 1);
    monitor.history.gpu = series(94, 4, 5, 2);
    monitor.history.gpuVram = series(71, 3, 25, 3);
    monitor.history.timestamps = Array.from({ length: 600 }, (_, i) => Date.now() - (600 - i) * 1000);
    return { pinia, q, monitor };
  }

  window.__renderqMock = { listeners, renderFrame, queue, stage };
  window.electronAPI = new Proxy(api, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (cb) => { listeners[prop] = cb; };
      }
      // Anything else (dialogs, render control, shell actions) is a harmless no-op
      return () => ok();
    },
  });
})();
