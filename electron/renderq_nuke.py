"""RenderQ helper, run inside Nuke's terminal mode:  Nuke -t renderq_nuke.py config.json

Works with every Nuke licence (Nuke, NukeX, Indie, Non-commercial) and Python 2 or 3. Everything goes
through Nuke's TCL layer: Indie allows only 10 Python Node objects per session, TCL has no such limit.

config.json:
    script          the .nk / .nkind / .nknc comp
    mode            "probe" (describe the comp, report finished frames) or "render"
    frames          frame numbers to probe / render
    writes          Write node names to render ([] = the Write nodes enabled in the comp)
    skipExisting    don't render frames whose output file exists (image sequences only)
    ignoreLoadErrors  keep going when loading the comp reports errors (like the GUI does)
    preview         {"dir": folder, "width": px} - also write a small JPEG of every finished frame
    preRenderPython code run after the comp is loaded (nuke, tcl available)

Protocol (stdout): RENDERQ_LOAD_ERROR <msg> | RENDERQ_PROBE:<json> | RENDERQ: ready | RENDERQ_FRAME <f> |
RENDERQ_SKIP <f> | RENDERQ_DONE:<json> | RENDERQ_ERROR <msg>
"""
import json
import os
import re
import sys
import time

import nuke

WRITE_CLASSES = ("Write", "DeepWrite", "WriteGeo", "GenerateLUT")
MOVIE_TYPES = ("mov", "mov32", "mov64", "ffmpeg", "mxf", "mp4", "avi", "mkv", "webm")


def say(*parts):
    sys.stdout.write(" ".join(str(p) for p in parts) + "\n")
    sys.stdout.flush()


def tcl(cmd):
    return nuke.tcl(cmd)


def knob(node, name):
    try:
        return tcl("value %s.%s" % (node, name))
    except Exception:
        return ""


def frame_path(pattern, frame):
    """A ####, %04d or $F4 file pattern -> the file for `frame`."""
    p = re.sub(r"%(0?)(\d*)d", lambda m: str(frame).zfill(int(m.group(2) or 1)), pattern)
    p = re.sub(r"#+", lambda m: str(frame).zfill(len(m.group(0))), p)
    return re.sub(r"\$F(\d*)", lambda m: str(frame).zfill(int(m.group(1) or 1)), p)


def has_frame_token(pattern):
    return bool(re.search(r"#|%0?\d*d|\$F|\[frame\]", pattern))


def output_path(w, frame):
    """The file a Write writes at `frame`: Nuke evaluates the file knob there (frame tokens, TCL, %V)."""
    tcl("frame %d" % frame)
    return knob(w["name"], "file").replace("\\", "/")


def describe_writes(frames):
    """All Write nodes at the comp's top level (Nuke renders only those from the command line too)."""
    out = []
    for nid in tcl("nodes").split():
        cls = tcl("class %s" % nid)
        if cls not in WRITE_CLASSES:
            continue
        name = knob(nid, "name")
        pattern = tcl("knob %s.file" % nid).replace("\\", "/")   # as typed, e.g. .../comp_####.exr
        ftype = knob(nid, "file_type") or os.path.splitext(pattern)[1].lstrip(".").lower()
        use_limit = knob(nid, "use_limit") == "true"
        w = {
            "name": name,
            "class": cls,
            "file": pattern,
            "fileType": ftype,
            "disabled": knob(nid, "disable") == "true",
            "connected": tcl("input %s 0" % nid) not in ("", "0"),
            "movie": ftype in MOVIE_TYPES,
            "hasFrameNumber": has_frame_token(pattern),
            "useLimit": use_limit,
            "first": int(float(knob(nid, "first") or 0)) if use_limit else None,
            "last": int(float(knob(nid, "last") or 0)) if use_limit else None,
            "renderOrder": int(float(knob(nid, "render_order") or 1)),
        }
        out.append(w)
    return out


def write_frames(w, frames):
    if w["useLimit"]:
        return [f for f in frames if w["first"] <= f <= w["last"]]
    return list(frames)


def done_frames(w, frames):
    """Frames of an image-sequence Write whose file exists (a 0-byte file is an interrupted write)."""
    if w["movie"] or not w["hasFrameNumber"] or w["class"] == "WriteGeo":
        return []
    done = []
    for f in write_frames(w, frames):
        p = output_path(w, f)
        try:
            if os.path.getsize(p) > 0:
                done.append(f)
        except OSError:
            pass
    return done


def open_script(cfg):
    errors = []
    try:
        nuke.scriptOpen(cfg["script"])
    except RuntimeError as e:
        errors.append(str(e))
        say("RENDERQ_LOAD_ERROR", e)
        if not cfg.get("ignoreLoadErrors", True):
            say("RENDERQ_ERROR loading the comp failed:", e)
            sys.exit(1)
    return errors


def selected_writes(cfg, writes):
    names = cfg.get("writes") or []
    if names:
        by_name = dict((w["name"], w) for w in writes)
        missing = [n for n in names if n not in by_name]
        if missing:
            say("RENDERQ_ERROR Write node(s) not found in the comp:", ", ".join(missing))
            sys.exit(1)
        chosen = [by_name[n] for n in names]
    else:
        chosen = [w for w in writes if not w["disabled"] and w["connected"]]
    if not chosen:
        say("RENDERQ_ERROR no Write node to render (none enabled, or none chosen)")
        sys.exit(1)
    for w in chosen:
        if w["disabled"]:   # ticked in RenderQ: the user wants it rendered
            tcl("knob %s.disable false" % w["name"])
    return sorted(chosen, key=lambda w: w["renderOrder"])


def paste(text):
    """Paste .nk node text with nothing selected (nodePaste inserts after a selected node, rewiring its outputs)."""
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=".nk")
    with os.fdopen(fd, "w") as f:
        f.write(text)
    try:
        nuke.selectAll()
        nuke.invertSelection()
        nuke.nodePaste(tmp)
        nuke.selectAll()
        nuke.invertSelection()
    finally:
        os.remove(tmp)


def setup_preview(cfg):
    """Reformat -> Write jpeg, hung below the first Write of each frame and executed with it: Nuke reuses
    the frame it is rendering (no extra cost measured). Reading the written file back doesn't work: Nuke
    caches what a folder contained, so frames written after the first look missing (black)."""
    prev = cfg.get("preview") or {}
    if not prev.get("dir"):
        return None
    try:
        path = os.path.join(prev["dir"], "preview_####.jpg").replace("\\", "/")
        paste(("push 0\n"
               "Reformat {\n inputs 0\n type \"to box\"\n box_width %d\n box_fixed false\n name RenderQ_PreviewScale\n}\n"
               "Write {\n file \"%s\"\n file_type jpeg\n channels rgb\n _jpeg_quality 0.85\n name RenderQ_PreviewWrite\n}\n")
              % (int(prev.get("width") or 1280), path))
        return path
    except Exception as e:
        say("RENDERQ: preview disabled:", e)
        return None


def run_pre_render_python(cfg):
    code = (cfg.get("preRenderPython") or "").strip()
    if code:
        exec(compile(code, "<RenderQ pre-render Python>", "exec"), {"nuke": nuke, "tcl": tcl, "__name__": "renderq"})


def probe(cfg):
    errors = open_script(cfg)
    frames = cfg.get("frames") or []
    fmt = knob("root", "format").split()
    writes = describe_writes(frames)
    for w in writes:
        w["done"] = done_frames(w, frames)
    report = {
        "nukeVersion": nuke.NUKE_VERSION_STRING,
        "first": int(float(knob("root", "first_frame") or 1)),
        "last": int(float(knob("root", "last_frame") or 1)),
        "fps": float(knob("root", "fps") or 24),
        "width": int(fmt[0]) if len(fmt) > 1 else 0,
        "height": int(fmt[1]) if len(fmt) > 1 else 0,
        "loadErrors": errors,
        "writes": writes,
    }
    say("RENDERQ_PROBE:" + json.dumps(report))


def render(cfg):
    open_script(cfg)
    frames = cfg.get("frames") or []
    writes = selected_writes(cfg, describe_writes(frames))
    run_pre_render_python(cfg)
    preview = setup_preview(cfg)
    skip = cfg.get("skipExisting", True)

    for w in writes:   # Nuke 12 and older have no create_directories knob
        for f in write_frames(w, frames)[:1]:
            d = os.path.dirname(output_path(w, f))
            if d and not os.path.isdir(d):
                os.makedirs(d)

    say("RENDERQ: ready", json.dumps({"writes": [w["name"] for w in writes]}))
    images = [w for w in writes if not w["movie"]]
    movies = [w for w in writes if w["movie"]]

    for f in frames:
        todo = []
        for w in images:
            if f not in write_frames(w, [f]):
                continue
            out = output_path(w, f)
            if skip and w["hasFrameNumber"]:
                try:
                    if os.path.getsize(out) > 0:
                        continue
                except OSError:
                    pass
            todo.append((w, out))
        if not todo:
            say("RENDERQ_SKIP", f)
            continue
        say("RENDERQ_FRAME", f)
        names = [w["name"] for w, _ in todo]
        src = next((w["name"] for w, _ in todo if w["class"] == "Write"), None) if preview else None
        if src:
            tcl("input RenderQ_PreviewScale 0 %s" % src)
            names.append("RenderQ_PreviewWrite")
        t = time.time()
        try:
            tcl("execute %s %d,%d" % (" ".join(names), f, f))
        except Exception as e:
            say("RENDERQ_ERROR frame %d: %s" % (f, e))
            sys.exit(1)
        outputs = dict((w["name"], out) for w, out in todo)
        say("RENDERQ_DONE:" + json.dumps({"frame": f, "outputs": outputs, "output": todo[0][1],
                                          "preview": frame_path(preview, f) if src else None,
                                          "seconds": round(time.time() - t, 2)}))

    for w in movies:   # a movie is written in one go over its frames
        fs = write_frames(w, frames)
        if not fs:
            continue
        say("RENDERQ_FRAME", fs[0])
        t = time.time()
        try:
            tcl("execute %s %d,%d" % (w["name"], fs[0], fs[-1]))
        except Exception as e:
            say("RENDERQ_ERROR %s: %s" % (w["name"], e))
            sys.exit(1)
        out = output_path(w, fs[0])
        say("RENDERQ_DONE:" + json.dumps({"frame": fs[-1], "frames": fs, "movie": True, "outputs": {w["name"]: out},
                                          "output": out, "seconds": round(time.time() - t, 2)}))


def main():
    with open(sys.argv[-1]) as f:
        cfg = json.load(f)
    if cfg.get("mode") == "probe":
        probe(cfg)
    else:
        render(cfg)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        say("RENDERQ_ERROR", e)
        sys.exit(1)
