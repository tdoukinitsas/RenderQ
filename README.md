# RenderQ

A desktop application for managing render queues across multiple 3D and compositing applications, built with Nuxt 3, Vue 3, and Electron.

![RenderQ](public/renderq-screenshot.jpg)

## Supported Applications

| Application | Extensions | Platforms |
|------------|-----------|-----------|
| **Blender** | `.blend` | Windows, macOS, Linux |
| **Cinema 4D** | `.c4d` | Windows, macOS |
| **Houdini** | `.hip`, `.hiplc`, `.hipnc` | Windows, macOS, Linux |
| **After Effects** | `.aep`, `.aepx` | Windows, macOS |
| **Nuke** | `.nk`, `.nknc` | Windows, macOS, Linux |

## Features

- **Multi-Application Support**: Render Blender, Cinema 4D, Houdini, After Effects, and Nuke files from a single queue
- **Batch Rendering**: Add multiple scene files to a render queue
- **Custom Frame Ranges**: Set optional frame ranges for each file (supports multiple ranges like "1-10, 50-60, 100")
- **Overwrite Protection**: Warns when rendering would overwrite existing frames with options to skip or adjust
- **Progress Tracking**: 
  - Per-file progress bars with percentage
  - Estimated time remaining for current file and entire queue
  - Color-coded status (blue=pending, yellow=rendering, green=complete, red=error)
  - Application-type badges with color coding
- **Live Preview**: Shows the latest rendered frame as soon as it's available
- **System Monitoring**: Real-time CPU, RAM, GPU, and VRAM usage
- **Pause/Resume**: Stop rendering mid-queue and resume later
- **Queue Persistence**: 
  - Auto-saves queue to recover from crashes
  - Save/load queue to JSON files
- **Desktop Notifications**: Alerts when renders complete or encounter errors
- **Application Auto-Detection**: Finds installed applications automatically

## Requirements

- Windows 10/11, macOS 10.15+, or Linux
- Node.js 18+ 
- One or more supported applications installed:
  - Blender 2.80+ (tested with 3.x and 4.x)
  - Cinema 4D R21+
  - Houdini 18+
  - After Effects CC 2020+
  - Nuke 12+
- NVIDIA GPU (optional, for GPU usage monitoring via nvidia-smi)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/blender-render-queue.git
cd blender-render-queue
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run electron:dev
```

4. Build for production:
```bash
npm run electron:build
```

## Usage

### Adding Files
1. Click "Add Files" to select scene files from any supported application
2. You can also drag & drop files directly into the queue
3. The application will automatically detect the file type and read settings where possible
4. Supported extensions: `.blend`, `.c4d`, `.hip`, `.hiplc`, `.hipnc`, `.aep`, `.aepx`, `.nk`, `.nknc`

### Setting Frame Ranges
- By default, the frame range from the scene file is used (when available)
- Check "Custom Frame Range" to specify your own range
- Supports multiple ranges: `1-100, 150-200, 250-300`
- Supports individual frames: `1, 5, 10, 15`

### Application Configuration
Each application has its own settings tab:
- **Blender**: Render engine, device (CPU/GPU), samples
- **Cinema 4D**: Take name, thread count
- **Houdini**: Render node path (e.g., `/out/mantra1`)
- **After Effects**: Composition name, multi-frame rendering
- **Nuke**: Write node, continue on error

### Rendering
1. Click "Start Rendering" to begin
2. Use "Pause" to temporarily stop rendering
3. Use "Stop" to cancel the current render
4. Jobs with missing applications are automatically skipped with an error

### Overwrite Warning
When frames already exist in the output directory:
- **Overwrite**: Delete existing frames and render everything
- **Adjust Range**: Render only missing frames

### Queue Management
- **Save Queue**: Export the current queue to a JSON file
- **Load Queue**: Import a previously saved queue
- Auto-saves continuously to prevent data loss

## Configuration

### Application Paths
The application automatically detects installations in common locations:

**Windows:**
- Blender: `C:\Program Files\Blender Foundation\`
- Cinema 4D: `C:\Program Files\Maxon\`, `C:\Program Files\Maxon Cinema 4D\`
- Houdini: `C:\Program Files\Side Effects Software\`
- After Effects: `C:\Program Files\Adobe\`
- Nuke: `C:\Program Files\Nuke*\`, `C:\Program Files\The Foundry\`

**macOS:**
- Blender: `/Applications/Blender*/`
- Cinema 4D: `/Applications/Maxon Cinema 4D*/`
- Houdini: `/Applications/Houdini/`
- After Effects: `/Applications/Adobe After Effects*/`
- Nuke: `/Applications/Nuke*/`

**Linux:**
- Blender: `/usr/bin/blender`, `/opt/blender*/`, `~/blender*/`
- Houdini: `/opt/hfs*`, `/opt/sidefx/`
- Nuke: `/usr/local/Nuke*/`, `/opt/Nuke*/`

You can also specify custom paths in Settings.

### Settings
- **Auto-save queue**: Continuously save queue state
- **Desktop notifications**: Show alerts for render events
- **Show preview**: Display latest rendered frame

## Development

### Project Structure
```
blender-render-queue/
├── assets/
│   └── scss/           # SCSS styles (IBM Carbon design)
├── components/         # Vue components
├── electron/           # Electron main process
├── pages/              # Nuxt pages
├── public/             # Static assets
└── stores/             # Pinia stores
```

### Tech Stack
- **Frontend**: Nuxt 3, Vue 3, Pinia
- **Desktop**: Electron
- **Styling**: SCSS with IBM Carbon design language
- **System Info**: systeminformation package

### Available Scripts
- `npm run dev` - Start Nuxt dev server
- `npm run electron:dev` - Start Nuxt + Electron in dev mode
- `npm run electron:build` - Build production executable
- `npm run electron:preview` - Preview production build

## Command Line Reference

The application uses each software's command line interface for rendering:

### Blender
```bash
blender -b file.blend -f 10           # Render single frame
blender -b file.blend -s 1 -e 100 -a  # Render animation
```

### Cinema 4D
```bash
Commandline.exe -nogui -render file.c4d -frame 1 100 1
Commandline.exe -render file.c4d -take "Main Take"
```

### Houdini
```bash
hbatch -c "render -f 1 100 /out/mantra1" file.hip
hython -c "hou.node('/out/mantra1').render()"
```

### After Effects
```bash
aerender -project file.aep -s 1 -e 100 -comp "Main Comp"
aerender -project file.aep -RStemplate "Best Settings" -OMtemplate "Lossless"
```

### Nuke
```bash
nuke -F 1-100 -x script.nk       # Render frame range
nuke -F 1-100 -X Write1 script.nk  # Specific write node
```

## Troubleshooting

### Application not detected
1. Ensure the application is installed in a standard location
2. Or specify a custom path in Settings → [Application Name] tab

### GPU monitoring not working
- NVIDIA: Requires nvidia-smi in PATH
- AMD/Intel: GPU usage monitoring may be limited

### Preview not showing
- Ensure the output format is a supported image type (PNG, JPEG, EXR, TIFF)
- Check that the output directory is accessible

### "Missing App" status on jobs
- The required application for that file type is not configured
- Go to Settings and set the path for the application

### Render not starting
- Check that the scene file exists and is readable
- Verify the application path is correct in Settings
- Check the application's license status (some require valid licenses for command-line rendering)

## License

GNU AFFERO GENERAL PUBLIC LICENSE v3 - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request
