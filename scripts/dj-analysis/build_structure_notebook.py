"""Generates hoffle_structure.ipynb: the Colab notebook that finds every song's structure.

Run:  python3 build_structure_notebook.py           (writes the notebook next to this file)
      python3 build_structure_notebook.py --script   (the same cells as one .py, to test here: HOFFLE_DIR=<folder>)

The notebook runs the All-In-One music structure analyser (all-in-one-infer, a maintained fork of allin1 that
needs no NATTEN build) over Drive/Hoffle/full/*.mp3 and writes, per song, its beats, downbeats and sections
(intro, verse, chorus, bridge, solo, inst, break, outro) to Drive/Hoffle/out/structure/<id>.json, then all of
them to Drive/Hoffle/out/structure.json. Each song is saved as it is done, so after a disconnect "Run all" carries
on where it stopped. export_structure.py turns structure.json into the bot's dj_brain/structure.json.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# The fork's commit tested here (2026-10-26, CPU, torch 2.14): pinned so a later change can't break the night's run.
PACKAGE = "all-in-one-infer @ git+https://github.com/openmirlab/all-in-one-infer.git@566f96c3f007c783ab5eb6db0123bf3335af8f31"

cells = []


def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)})


def code(text):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
                  "source": text.strip("\n").splitlines(True)})


md("""
# Hoffle song structure

Runtime → Change runtime type → **T4 GPU**, then Runtime → **Run all**. It goes through every song in
`Drive/Hoffle/full` and saves each one's sections (intro, verse, chorus, bridge, solo, outro…) and where its bars
start to `Drive/Hoffle/out/structure/`. If Colab disconnects, just **Run all** again: it carries on where it stopped.

When it says `ALL DONE`, the results are in `Drive/Hoffle/out/structure.json`; on the server run
`scripts/dj-analysis/export_structure.py` and the club's lights and Real DJ use them within a minute.
""")

code(f"""
!pip -q install "{PACKAGE}"
""")

code("""
import os, sys, json, glob, time, shutil, traceback
import torch
IN_COLAB = 'google.colab' in sys.modules
if IN_COLAB:
    from google.colab import drive
    drive.mount('/content/drive')
H = os.environ.get('HOFFLE_DIR') or '/content/drive/MyDrive/Hoffle'
FULL = H + '/full'
OUT = H + '/out/structure'
WORK = os.environ.get('WORK_DIR') or '/content/work'
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
print('device:', DEVICE, torch.cuda.get_device_name(0) if DEVICE == 'cuda' else '')
if DEVICE == 'cpu' and IN_COLAB:
    print('!! No GPU: Runtime -> Change runtime type -> T4 GPU, then Run all again (on CPU it takes days).')


def save_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f)
    os.replace(tmp, path)


songs = sorted(os.path.basename(p)[:-4] for p in glob.glob(FULL + '/*.mp3'))
done = {os.path.basename(p)[:-5] for p in glob.glob(OUT + '/*.json')}
failed_path = OUT + '/_failed.json'
failed = json.load(open(failed_path)) if os.path.exists(failed_path) else {}
todo = [s for s in songs if s not in done and s not in failed]
print(f'{len(songs)} songs, {len(done)} done, {len(failed)} failed before, {len(todo)} to go')
""")

md("## Analyse (each song is saved as soon as it's done)")

code("""
import allin1_infer

r2 = lambda xs: [round(float(x), 2) for x in xs]
started = time.time()
count = 0
with allin1_infer.AllInOneSession(device=DEVICE) as session:
    for vid in todo:
        local = f'{WORK}/{vid}.mp3'
        t = time.time()
        try:
            shutil.copy(f'{FULL}/{vid}.mp3', local)
            result = session.infer(local)
            result = result[0] if isinstance(result, list) else result
            save_json(f'{OUT}/{vid}.json', {
                'bpm': float(result.bpm) if result.bpm else None,
                'beats': r2(result.beats),
                'downbeats': r2(result.downbeats),
                'segments': [[round(float(s.start), 2), round(float(s.end), 2), str(s.label)] for s in result.segments],
            })
            count += 1
        except Exception as error:
            failed[vid] = repr(error)[:300]
            save_json(failed_path, failed)
            traceback.print_exc(limit=1)
        finally:
            if os.path.exists(local):
                os.remove(local)
        if count and count % 10 == 0:
            each = (time.time() - started) / count
            left = len(todo) - count - sum(1 for v in todo if v in failed)
            print(f'{count} done, {each:.1f} s a song, about {left * each / 60:.0f} min to go', flush=True)
print(f'this run: {count} songs in {(time.time() - started) / 60:.1f} min, {len(failed)} failed in all')
""")

md("## Put them together")

code("""
merged = {}
for path in sorted(glob.glob(OUT + '/*.json')):
    vid = os.path.basename(path)[:-5]
    if vid == '_failed':                 # the failure log (YouTube ids can start with "_" too)
        continue
    try:
        data = json.load(open(path))
    except Exception:
        continue
    merged[vid] = {'bpm': data.get('bpm'), 'downbeats': data.get('downbeats') or [], 'segments': data.get('segments') or []}
save_json(H + '/out/structure.json', {'version': 1, 'model': 'harmonix-all', 'made': time.strftime('%Y-%m-%d'), 'songs': merged})
left = [s for s in songs if s not in merged and s not in failed]
print(f'{len(merged)} songs in structure.json, {len(failed)} failed, {len(left)} still to do')
print('ALL DONE' if not left else 'Not finished: Run all again to carry on.')
""")


def notebook():
    return {"cells": cells, "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                                         "kernelspec": {"display_name": "Python 3", "name": "python3"}},
            "nbformat": 4, "nbformat_minor": 0}


if __name__ == "__main__":
    if "--script" in sys.argv:
        # The code cells as one script (shell lines left out), for testing here.
        body = "\n\n".join("".join(line for line in c["source"] if not line.lstrip().startswith("!"))
                           for c in cells if c["cell_type"] == "code")
        print(body)
    else:
        path = os.path.join(HERE, "hoffle_structure.ipynb")
        with open(path, "w") as f:
            json.dump(notebook(), f, indent=1)
        print("wrote", path)
