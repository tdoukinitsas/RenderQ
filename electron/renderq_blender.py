"""RenderQ Blender helper - applied inside Blender before a render (or a probe).

Usage (RenderQ builds this command line):
    blender -b scene.blend --python-exit-code 1 --python renderq_blender.py [-s S -e E -a] -- config.json

config.json keys (all optional unless noted):
    mode              'render' (default) or 'probe'
    layer             view layer this process renders (split mode), or null
    splitLayers       all layers of a split job (probe mode reports each of them)
    viewLayers        view layers to render together (non-split), or null = as saved in the file
    engine            render engine override ('' = file setting)
    cyclesDevice      '' (preferences/file), 'CPU', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI', 'METAL'
    resolution        {x, y, percentage} override
    outputPath        output path override (same meaning as blender -o)
    preRenderPython   code run after the overrides; globals: bpy, scene, layer
    skipExisting      true (default): never re-render frames whose output exists
    frames            probe mode: list of frames to check

Lines starting with 'RENDERQ' are read by RenderQ; everything else is ordinary Blender output.
"""
import json
import os
import sys

import bpy


def log(*args):
    print('RENDERQ:', *args, flush=True)


def load_config():
    argv = sys.argv
    if '--' not in argv:
        raise RuntimeError('RenderQ helper: no config file given after "--"')
    with open(argv[argv.index('--') + 1], encoding='utf-8') as f:
        return json.load(f)


CFG = load_config()
scene = bpy.context.scene
render = scene.render
FILE_OUTPUT_PATH = render.filepath   # probe mode applies several layers in one session

ENGINE_ALIASES = {
    'BLENDER_EEVEE': ['BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'],        # 4.2-4.x call it EEVEE Next
    'BLENDER_EEVEE_NEXT': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'],   # 5.x renamed it back
}


def set_engine(name):
    for candidate in ENGINE_ALIASES.get(name, [name]):
        try:
            render.engine = candidate
            return
        except TypeError:
            pass
    log('WARNING render engine not available:', name, '- keeping', render.engine)


def set_device(device):
    if not device:
        return   # keep the file's device and the user's Blender preferences
    if device == 'CPU':
        try:
            scene.cycles.device = 'CPU'
        except AttributeError:
            pass
        return
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = device
        refresh = getattr(prefs, 'refresh_devices', None) or getattr(prefs, 'get_devices')
        refresh()
        used = 0
        for d in prefs.devices:
            d.use = d.type == device
            used += d.use
        scene.cycles.device = 'GPU' if used else 'CPU'
        log(f'compute device {device}: {used} device(s)' + ('' if used else ' - none found, using CPU'))
    except Exception as e:   # noqa: BLE001 - never fail a render over device selection
        log('WARNING compute device setup failed:', e)


def compositor_tree():
    tree = getattr(scene, 'compositing_node_group', None)            # Blender 5.x
    if tree is None and getattr(scene, 'use_nodes', False):
        tree = getattr(scene, 'node_tree', None)                      # Blender 2.8-4.x
    return tree


def upstream_layers(node, seen):
    """View layers of the Render Layers nodes that feed `node` (directly or through other nodes)."""
    found = set()
    for sock in node.inputs:
        for link in sock.links:
            src = link.from_node
            key = src.as_pointer()
            if key in seen:
                continue
            seen.add(key)
            if src.bl_idname == 'CompositorNodeRLayers' and getattr(src, 'scene', None) in (None, scene):
                found.add(src.layer)
            found |= upstream_layers(src, seen)
    return found


def mute_other_layer_outputs(layers):
    """File Output nodes fed only by view layers that this process does not render would write empty images."""
    tree = compositor_tree()
    if tree is None:
        return
    for node in tree.nodes:
        if node.bl_idname != 'CompositorNodeOutputFile' or node.mute:
            continue
        feeds = upstream_layers(node, set())
        if feeds and not feeds & set(layers):
            node.mute = True
            log('muted File Output', repr(node.name), '(fed by', ', '.join(sorted(feeds)) + ')')


def with_layer_folder(filepath, layer):
    """'<dir>/<name>' -> '<dir>/<layer>/<name>' so every layer of a split job has its own frames."""
    cut = max(filepath.rfind('/'), filepath.rfind('\\'))
    return filepath[:cut + 1] + layer + '/' + filepath[cut + 1:]


def apply(layer):
    if CFG.get('engine'):
        set_engine(CFG['engine'])
    set_device(CFG.get('cyclesDevice'))
    res = CFG.get('resolution')
    if res:
        render.resolution_x = int(res['x'])
        render.resolution_y = int(res['y'])
        render.resolution_percentage = int(res.get('percentage') or 100)
    render.filepath = CFG.get('outputPath') or FILE_OUTPUT_PATH
    path_before = render.filepath

    code = CFG.get('preRenderPython')
    if code:
        exec(compile(code, 'RenderQ pre-render Python', 'exec'),
             {'bpy': bpy, 'scene': scene, 'layer': layer, '__name__': 'renderq_prerender'})

    layers = [layer] if layer else CFG.get('viewLayers')
    if layers:
        names = [vl.name for vl in scene.view_layers]
        unknown = [name for name in layers if name not in names]
        if unknown:
            log('WARNING unknown view layer(s):', ', '.join(unknown))
        for vl in scene.view_layers:
            vl.use = vl.name in layers
        mute_other_layer_outputs(layers)
    # split jobs: keep each layer's main output apart, unless the pre-render script chose a path itself
    if layer and len(CFG.get('splitLayers') or []) > 1 and render.filepath == path_before:
        render.filepath = with_layer_folder(render.filepath, layer)

    if render.is_movie_format:
        render.use_overwrite = True   # a movie is always written from its first frame
    elif CFG.get('skipExisting', True):
        render.use_overwrite = False  # Blender itself skips frames whose file exists
        render.use_placeholder = False  # an interrupted frame must not leave a file that looks finished
    else:
        render.use_overwrite = True


def frame_state(frames):
    """Frames whose output already exists; removes 0-byte placeholders left by interrupted renders."""
    done, removed = [], 0
    for f in frames:
        path = render.frame_path(frame=f)
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        if size > 0:
            done.append(f)
        elif CFG.get('skipExisting', True):
            try:
                os.remove(path)
                removed += 1
            except OSError:
                pass
    return done, removed


def probe():
    frames = CFG.get('frames') or []
    report = {'layers': {}}
    for layer in (CFG.get('splitLayers') or [None]):
        apply(layer)
        movie = bool(render.is_movie_format)
        done, removed = ([], 0) if movie else frame_state(frames)
        report['layers'][layer or ''] = {
            'done': done,
            'removedPlaceholders': removed,
            'movie': movie,
            'output': bpy.path.abspath(render.filepath),
            'engine': render.engine,
            'viewLayers': [vl.name for vl in scene.view_layers if vl.use],
        }
    print('RENDERQ_PROBE:' + json.dumps(report), flush=True)


if CFG.get('mode') == 'probe':
    probe()
else:
    apply(CFG.get('layer'))
    log('ready', json.dumps({'layer': CFG.get('layer'), 'engine': render.engine,
                             'output': bpy.path.abspath(render.filepath),
                             'viewLayers': [vl.name for vl in scene.view_layers if vl.use]}))
