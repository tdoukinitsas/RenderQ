/*
  Quick EXR inspection + optional Blender conversion test.

  Usage:
    node exr-fix/inspect-exr.js exr-fix/demoexr.exr

  Optional conversion (requires Blender):
    $env:BLENDER_PATH='C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe'
    node exr-fix/inspect-exr.js exr-fix/demoexr.exr Combined

  This script is intentionally dependency-free.
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

function readNullTerminatedString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end++;
  const value = buffer.toString('utf8', offset, end);
  return { value, nextOffset: Math.min(end + 1, buffer.length) };
}

function parseExrChannelNamesFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return [];

  let offset = 8; // magic (4) + version (4)
  const channelNames = [];

  while (offset < buffer.length) {
    const nameRes = readNullTerminatedString(buffer, offset);
    const attrName = nameRes.value;
    offset = nameRes.nextOffset;
    if (!attrName) break;

    const typeRes = readNullTerminatedString(buffer, offset);
    const attrType = typeRes.value;
    offset = typeRes.nextOffset;

    if (offset + 4 > buffer.length) break;
    const attrSize = buffer.readUInt32LE(offset);
    offset += 4;

    const valueStart = offset;
    const valueEnd = Math.min(offset + attrSize, buffer.length);
    offset = valueEnd;

    if (attrName === 'channels' && attrType === 'chlist') {
      let p = valueStart;
      while (p < valueEnd) {
        const chRes = readNullTerminatedString(buffer, p);
        const chName = chRes.value;
        p = chRes.nextOffset;
        if (!chName) break;
        channelNames.push(chName);
        if (p + 16 > valueEnd) break;
        p += 16;
      }
      break;
    }
  }

  return channelNames;
}

function deriveExrLayerNamesFromChannels(channelNames) {
  const layers = new Set();

  for (const channelName of channelNames) {
    const parts = String(channelName).split('.');
    if (parts.length >= 3) {
      layers.add(parts[1]);
      continue;
    }
    if (parts.length === 2) {
      layers.add(parts[0]);
      continue;
    }
    if (['R', 'G', 'B', 'A'].includes(parts[0])) {
      layers.add('Combined');
    }
  }

  const list = Array.from(layers);
  if (list.length === 0) return ['Combined'];
  list.sort((a, b) => {
    if (a === 'Combined') return -1;
    if (b === 'Combined') return 1;
    return a.localeCompare(b);
  });
  return list;
}

async function runBlenderConvert(blenderPath, exrPath, layer, outPngPath) {
  const tempPyPath = path.join(os.tmpdir(), `renderq_exr_test_${Date.now()}_${Math.random().toString(16).slice(2)}.py`);

  const pythonScript = `
import sys
import json
import argparse

def main():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []

    parser = argparse.ArgumentParser()
    parser.add_argument('--exr', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--layer', default='Combined')
    args = parser.parse_args(argv)

    exr_path = args.exr
    out_path = args.out
    layer = args.layer

    try:
        import OpenImageIO as oiio
        try:
            from OpenImageIO import ImageBufAlgo as IBA
        except Exception:
            IBA = None

        subimage = 0
        chosen = None
        inp = oiio.ImageInput.open(exr_path)
        if not inp:
            raise RuntimeError('OpenImageIO failed to open EXR')

        while True:
            if not inp.seek_subimage(subimage, 0):
                break
            spec = inp.spec()
            channel_names = list(spec.channelnames)
            if any(('.' + layer + '.') in n for n in channel_names):
                chosen = subimage
                break
            subimage += 1
        inp.close()

        if chosen is None:
            chosen = 0

        buf = oiio.ImageBuf(exr_path, subimage=chosen, miplevel=0)
        spec = buf.spec()
        cn = list(spec.channelnames)

        def find_channel(suffix):
            suf = '.' + layer + '.' + suffix
            for n in cn:
                if n.endswith(suf):
                    return n
            return None

        r = find_channel('R')
        g = find_channel('G')
        b = find_channel('B')
        a = find_channel('A')

        if r is None and 'R' in cn: r = 'R'
        if g is None and 'G' in cn: g = 'G'
        if b is None and 'B' in cn: b = 'B'
        if a is None and 'A' in cn: a = 'A'

        if r and g and b:
            indices = [cn.index(r), cn.index(g), cn.index(b)]
            names = ['R','G','B']
            if a:
                indices.append(cn.index(a))
                names.append('A')
        else:
            n = min(3, len(cn))
            indices = list(range(n))
            names = cn[:n]

        out = None
        if IBA is not None:
            try:
                out = IBA.channels(buf, indices, names)
            except Exception:
                try:
                    out = oiio.ImageBuf()
                    IBA.channels(out, buf, indices, names)
                except Exception:
                    out = None

        if out is None:
            out = buf

        if not out.write(out_path):
            raise RuntimeError('Failed to write PNG via OpenImageIO')

        print('EXR_CONVERT_JSON:' + json.dumps({'out': out_path}))
        sys.stdout.flush()
        return 0

    except Exception:
        pass

    import bpy
    img = bpy.data.images.load(exr_path, check_existing=False)
    img.filepath_raw = out_path
    img.file_format = 'PNG'

    try:
        img.save()
    except Exception:
        img.save_render(out_path)

    print('EXR_CONVERT_JSON:' + json.dumps({'out': out_path}))
    sys.stdout.flush()
    return 0

if __name__ == '__main__':
    sys.exit(main())
`;

  fs.writeFileSync(tempPyPath, pythonScript);

  const args = ['-b', '--python-exit-code', '1', '--python', tempPyPath, '--', '--exr', exrPath, '--out', outPngPath, '--layer', layer || 'Combined'];

  await new Promise((resolve, reject) => {
    const proc = spawn(blenderPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      try { fs.unlinkSync(tempPyPath); } catch {}
      const match = stdout.match(/EXR_CONVERT_JSON:(.+)/);
      if (!match) {
        return reject(new Error(`Blender conversion failed (exit ${code}). ${stderr.split('\n').slice(-8).join('\n')}`));
      }
      resolve();
    });
    proc.on('error', (e) => {
      try { fs.unlinkSync(tempPyPath); } catch {}
      reject(e);
    });
  });
}

async function main() {
  const exrPath = process.argv[2];
  const requestedLayer = process.argv[3] || null;
  if (!exrPath) {
    console.error('Usage: node exr-fix/inspect-exr.js <path-to.exr> [LayerName]');
    process.exit(2);
  }

  const abs = path.resolve(exrPath);
  const buf = fs.readFileSync(abs);
  const channels = parseExrChannelNamesFromBuffer(buf);
  const layers = deriveExrLayerNamesFromChannels(channels);

  console.log('EXR:', abs);
  console.log('Channel count:', channels.length);
  console.log('First channels:', channels.slice(0, 20));
  console.log('Derived layers:', layers);

  if (requestedLayer) {
    const blenderPath = process.env.BLENDER_PATH;
    if (!blenderPath) {
      console.error('BLENDER_PATH env var not set; cannot run conversion test.');
      process.exit(3);
    }

    const out = path.resolve(`exr-fix/demoexr_${requestedLayer}.png`);
    await runBlenderConvert(blenderPath, abs, requestedLayer, out);
    console.log('Wrote PNG:', out);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
