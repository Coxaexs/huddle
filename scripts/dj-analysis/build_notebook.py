"""Generates hoffle_dj_brain.ipynb (the Colab notebook) from the cells below.

Run:  python3 build_notebook.py
Each cell is plain source so it can be read and tested here before it reaches Colab.
"""
import json
import os

cells = []


def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)})


def code(text):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
                  "source": text.strip("\n").splitlines(True)})


md("""
# Hoffle DJ brain

Runtime → **T4 GPU**, then Runtime → **Run all**. Everything is cached in `Drive/Hoffle/out`, so if Colab disconnects
just Run all again and it continues where it stopped.

| stage | model | gives |
|---|---|---|
| A | CLAP (`laion/larger_clap_music_and_speech`) | genre / mood / sound tags + a "sound fingerprint" per song |
| A2 | Whisper (small) | which language is sung (finds the Turkish songs) |
| B | Beat This! (ISMIR 2024) + librosa | beats, downbeats, bpm, key, bar-by-bar energy, sections, mix-in / mix-out points |
| C | — | `dj_brain.json`: everything the local DJ needs, so the bot never runs a model |
| D | — | 10 playlists (3 Turkish), written ONCE to `dj_playlists_frozen.json` and never regenerated |
""")

code("""
!pip -q install beat-this librosa soundfile transformers scikit-learn rotary-embedding-torch einops soxr
""")

code("""
import os, re, json, glob, time, math, numpy as np, torch
from concurrent.futures import ThreadPoolExecutor
from google.colab import drive
drive.mount('/content/drive')

H = '/content/drive/MyDrive/Hoffle'
OUT = H + '/out'
os.makedirs(OUT, exist_ok=True)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
print('device:', dev)


def load_json(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


def save_json(path, obj):
    tmp = path + '.tmp'
    json.dump(obj, open(tmp, 'w'), ensure_ascii=False)
    os.replace(tmp, path)


manifest = load_json(H + '/manifest.json', {})      # id -> {file, duration}
print(len(manifest), 'songs in manifest')
""")

md("## Stage A — CLAP tags and fingerprints (30 s clips)")

code("""
os.makedirs('/content/clips', exist_ok=True)
if os.path.exists(H + '/clips.zip'):
    os.system(f'unzip -q -n "{H}/clips.zip" -d /content/clips')
for f in glob.glob(H + '/new/*.mp3'):
    os.system(f'cp -n "{f}" /content/clips/')
print(len(glob.glob('/content/clips/*.mp3')), 'clips available')
""")

code("""
import librosa
from transformers import ClapModel, ClapProcessor

# NOTE: laion/larger_clap_music has an UNTRAINED text<->audio head (logit scale 1.0, every score ~ chance).
# larger_clap_music_and_speech was checked on known songs (505 -> indie rock 0.94) and works.
CLAP = 'laion/larger_clap_music_and_speech'
ALGO = 'clap-mas-v2'
clap = ClapModel.from_pretrained(CLAP).to(dev).eval()
cproc = ClapProcessor.from_pretrained(CLAP)
scale = float(clap.logit_scale_a.detach().exp())
print('logit scale', round(scale, 1))
assert scale > 5, 'CLAP head is untrained, tags would be noise'

LABELS = {
 'genre': ['indie rock','alternative rock','garage rock','punk rock','pop punk','emo','hard rock','classic rock','heavy metal','nu metal','post-hardcore','grunge','indie pop','dream pop','synth pop','electropop','dance pop','pop','house music','techno','drum and bass','hip hop','trap','r&b','soul','funk','disco','reggae','latin pop','k-pop','jazz','lofi','acoustic singer-songwriter','folk','country','classical music','piano ballad','film score','ambient','middle eastern pop'],
 'mood': ['energetic and aggressive','upbeat and happy','chill and relaxed','sad and melancholic','romantic','dark and moody','dreamy','nostalgic','epic and anthemic','party music','angry','hopeful'],
 'vocal': ['male vocals','female vocals','rap vocals','instrumental with no vocals','group vocals'],
 'sound': ['distorted electric guitars','clean guitar','piano driven','synthesizers','heavy bass','acoustic guitar','orchestral strings','electronic drums','live drums'],
}
PROMPTS, SPANS = [], {}
for k, labs in LABELS.items():
    SPANS[k] = (len(PROMPTS), len(PROMPTS) + len(labs))
    PROMPTS += [f'This is a sound of {l}.' for l in labs]
tin = cproc(text=PROMPTS, return_tensors='pt', padding=True)
tin = {k: v.to(dev) for k, v in tin.items() if k in ('input_ids', 'attention_mask')}


def clap_run(y):
    \"\"\"One forward pass: (audio fingerprint, logits against every prompt). Same call works on old and new transformers.\"\"\"
    try:
        ai = cproc(audio=y, sampling_rate=48000, return_tensors='pt')
    except (TypeError, ValueError):
        ai = cproc(audios=y, sampling_rate=48000, return_tensors='pt')
    with torch.no_grad():
        out = clap(input_ids=tin['input_ids'], attention_mask=tin['attention_mask'],
                   input_features=ai['input_features'].to(dev),
                   is_longer=ai['is_longer'].to(dev) if 'is_longer' in ai else None)
    return out.audio_embeds[0].float().cpu().numpy(), out.logits_per_audio[0].float()


prev = load_json(OUT + '/song_tags.json', {})
if prev.get('algo') != ALGO or not os.path.exists(OUT + '/clap_logits.npy'):     # results from the broken checkpoint are thrown away
    print('discarding old tags (algo =', prev.get('algo'), ')')
    prev = {'ids': []}
old_ids = prev['ids']
old_embs = np.load(OUT + '/embeddings.npy') if old_ids else None
old_logits = np.load(OUT + '/clap_logits.npy') if old_ids else None
todo = sorted(f[:-4] for f in os.listdir('/content/clips') if f.endswith('.mp3') and f[:-4] not in set(old_ids))
print(len(todo), 'to tag,', len(old_ids), 'already done')
new_embs, new_logits = [], []
for i, vid in enumerate(todo):
    y, _ = librosa.load(f'/content/clips/{vid}.mp3', sr=48000, mono=True)
    emb, logits = clap_run(y)
    if i == 0:
        assert float(logits.max() - logits.min()) > 2, 'scores are flat, tags would be noise'
    new_embs.append(emb)
    new_logits.append(logits.cpu().numpy())
    if i % 100 == 0:
        print(i, len(todo), vid)
ids = old_ids + todo
if new_embs:
    embs = np.stack(new_embs) if old_embs is None else np.concatenate([old_embs, np.stack(new_embs)])
    L = np.stack(new_logits) if old_logits is None else np.concatenate([old_logits, np.stack(new_logits)])
    np.save(OUT + '/embeddings.npy', embs)
    np.save(OUT + '/clap_logits.npy', L)
else:
    embs, L = old_embs, old_logits

# Zero-shot scores carry a per-label bias (everything leans "indie pop", vocals read as "instrumental").
# Subtract each label's average over the library, then softmax inside each category.
Ladj = L - L.mean(axis=0, keepdims=True)
tags = {}
for r, vid in enumerate(ids):
    entry = {}
    for k, (lo, hi) in SPANS.items():
        z = Ladj[r, lo:hi]
        pr = np.exp(z - z.max()); pr /= pr.sum()
        top = np.argsort(-pr)[:3]
        entry[k] = [[LABELS[k][j], round(float(pr[j]), 3)] for j in top]
    tags[vid] = entry
if len(ids):
    save_json(OUT + '/song_tags.json', {'algo': ALGO, 'ids': ids, 'tags': tags})
print('stage A done:', len(ids))
""")

md("## Stage A2 — who is singing in what language (Whisper)")

code("""
from transformers import WhisperProcessor, WhisperForConditionalGeneration

wproc = WhisperProcessor.from_pretrained('openai/whisper-small')
wmodel = WhisperForConditionalGeneration.from_pretrained('openai/whisper-small', dtype=torch.float16 if dev == 'cuda' else torch.float32).to(dev).eval()
tok = wproc.tokenizer
lang_tokens = sorted(t for t in tok.get_vocab() if re.fullmatch(r'<\\|[a-z]{2,3}\\|>', t))
lang_ids = tok.convert_tokens_to_ids(lang_tokens)
sot = tok.convert_tokens_to_ids('<|startoftranscript|>')

lang = load_json(OUT + '/song_lang.json', {})
todo = [v for v in ids if v not in lang]
print(len(todo), 'songs to language-check')
for i, vid in enumerate(todo):
    y, _ = librosa.load(f'/content/clips/{vid}.mp3', sr=16000, mono=True)
    feats = wproc.feature_extractor(y, sampling_rate=16000, return_tensors='pt').input_features.to(dev, wmodel.dtype)
    with torch.no_grad():
        logits = wmodel(input_features=feats, decoder_input_ids=torch.tensor([[sot]], device=dev)).logits[0, -1]
    p = torch.softmax(logits[lang_ids].float(), dim=-1)
    top = p.topk(2)
    lang[vid] = [[lang_tokens[j][2:-2], round(float(s), 3)] for s, j in zip(top.values, top.indices)]
    if i % 100 == 0:
        print(i, len(todo), vid, lang[vid][0])
save_json(OUT + '/song_lang.json', lang)
del wmodel
torch.cuda.empty_cache()
print('stage A2 done')
""")

md("""
## Stage B — beats, key, bar-by-bar energy and sections (whole songs)

Needs `Hoffle/full/<id>.mp3` (Claude uploads those). Beat This! tracks beats and downbeats; librosa measures each bar.
Sections are a **heuristic** on top of per-bar energy (intro / build / verse / high / break / outro), not a trained model.
""")

code("""
from beat_this.inference import Audio2Beats

a2b = Audio2Beats(checkpoint_path='final0', device=dev, dbn=False)

NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
CAM_MAJ = {'B': '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', 'F': '7B', 'C': '8B', 'G': '9B', 'D': '10B', 'A': '11B', 'E': '12B'}
CAM_MIN = {'G#': '1A', 'D#': '2A', 'A#': '3A', 'F': '4A', 'C': '5A', 'G': '6A', 'D': '7A', 'A': '8A', 'E': '9A', 'B': '10A', 'F#': '11A', 'C#': '12A'}
HOP, NFFT, PHRASE = 512, 2048, 8


def estimate_key(chroma_mean):
    best = None
    for tonic in range(12):
        for prof, mode in ((KS_MAJ, 'major'), (KS_MIN, 'minor')):
            r = np.corrcoef(np.roll(prof, tonic), chroma_mean)[0, 1]
            if best is None or r > best[0]:
                best = (r, tonic, mode)
    r, tonic, mode = best
    name = NOTES[tonic]
    return f'{name} {mode}', (CAM_MAJ if mode == 'major' else CAM_MIN)[name], float(r)


def label_phrases(E):
    \"\"\"Heuristic section labels from per-phrase energy (0..1).\"\"\"
    n = len(E)
    thr = max(0.55, 0.85 * float(np.percentile(E, 90)))
    high = E >= thr
    first_high = int(np.argmax(high)) if high.any() else n
    last_high = int(n - 1 - np.argmax(high[::-1])) if high.any() else -1
    out = []
    for i, e in enumerate(E):
        if i > last_high and last_high >= 0:
            out.append('outro')
        elif high[i]:
            out.append('high')
        elif i < first_high:
            out.append('intro' if i == 0 else ('build' if e > E[i - 1] else 'verse'))
        else:
            out.append('break' if e < 0.4 else 'verse')
    return out


def analyse(y, sr=22050):
    beats, downs = a2b(y, sr)
    beats, downs = np.asarray(beats, float), np.asarray(downs, float)
    if len(beats) < 16 or len(downs) < 6:
        return None
    bpm_raw = 60.0 / float(np.median(np.diff(beats)))
    bpm = bpm_raw
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    per_bar = int(np.clip(np.round(np.median(np.diff(np.searchsorted(beats, downs - 1e-3)))), 3, 7))

    S = np.abs(librosa.stft(y, n_fft=NFFT, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=NFFT)
    chroma = librosa.feature.chroma_stft(S=S, sr=sr)
    fb = np.round(downs * sr / HOP).astype(int)
    fb = np.append(fb, min(S.shape[1], fb[-1] + int(np.median(np.diff(fb)))))
    low, high_band = freqs < 150, freqs > 4000
    rms, lowr, brightr, chroma_bar = [], [], [], []
    for a, b in zip(fb[:-1], fb[1:]):
        seg = S[:, a:b]
        if seg.shape[1] == 0:
            continue
        tot = seg.sum() + 1e-9
        rms.append(10 * np.log10(seg.mean() + 1e-12))
        lowr.append(seg[low].sum() / tot)
        brightr.append(seg[high_band].sum() / tot)
        chroma_bar.append(chroma[:, a:b].mean(1))
    rms, lowr, brightr = np.array(rms), np.array(lowr), np.array(brightr)
    lo, hi = np.percentile(rms, [5, 95])
    e = np.clip((rms - lo) / (hi - lo + 1e-6), 0, 1)

    audible = rms > rms.max() - 40                  # real music, not digital silence; quiet intros count
    start = int(np.argmax(audible)) if audible.any() else 0
    phrases = []
    for s in range(start, len(e), PHRASE):
        t = min(s + PHRASE, len(e))
        if t - s >= PHRASE // 2:
            phrases.append((s, t))
    if len(phrases) < 2:
        return None
    pe = np.array([e[s:t].mean() for s, t in phrases])
    labels = label_phrases(pe)

    outro = [i for i, l in enumerate(labels) if l == 'outro']
    out_phrase = outro[0] if outro else max(0, len(phrases) - 2)
    first_high = next((i for i, l in enumerate(labels) if l == 'high'), None)
    key, camelot, key_conf = estimate_key(np.average(np.array(chroma_bar), axis=0, weights=e + 0.05))
    sec = lambda bar: round(float(downs[min(bar, len(downs) - 1)]), 2)
    return {
        'bpm': round(bpm, 2), 'bpm_raw': round(bpm_raw, 2), 'beats_per_bar': per_bar,
        'first_downbeat': round(float(downs[0]), 3), 'bars': len(downs),
        'key': key, 'camelot': camelot, 'key_conf': round(key_conf, 2),
        'loud_db': round(float(np.mean(rms[e >= np.median(e)])), 2),
        'low_share': round(float(lowr.mean()), 3), 'bright_share': round(float(brightr.mean()), 4),
        'phrase_bars': PHRASE,
        'sections': [{'bar': s, 'at': sec(s), 'energy': round(float(pe[i]), 2), 'label': labels[i]} for i, (s, t) in enumerate(phrases)],
        'mix_in': {'bar': phrases[0][0], 'at': sec(phrases[0][0])},
        'drop_in': ({'bar': phrases[first_high][0], 'at': sec(phrases[first_high][0])} if first_high is not None else None),
        'mix_out': {'bar': phrases[out_phrase][0], 'at': sec(phrases[out_phrase][0])},
        'downbeats': [round(float(d), 2) for d in downs[::PHRASE]],    # one per phrase, enough to re-grid
    }
""")

code("""
audio = load_json(OUT + '/song_audio.json', {})
full_ids = sorted(f[:-4] for f in os.listdir(H + '/full') if f.endswith('.mp3')) if os.path.isdir(H + '/full') else []
todo = [v for v in full_ids if v not in audio]
print(len(todo), 'songs to analyse,', len(audio), 'already done')


def read(vid):
    y, _ = librosa.load(f'{H}/full/{vid}.mp3', sr=22050, mono=True)
    return vid, y


t0 = time.time()
with ThreadPoolExecutor(4) as pool:
    for n in range(0, len(todo), 16):
        for vid, y in list(pool.map(read, todo[n:n + 16])):
            try:
                audio[vid] = analyse(y) or {'failed': True}
            except Exception as ex:
                audio[vid] = {'failed': True, 'error': str(ex)[:120]}
        save_json(OUT + '/song_audio.json', audio)
        print(min(n + 16, len(todo)), '/', len(todo), f'{time.time() - t0:.0f}s')
print('stage B done:', sum(1 for v in audio.values() if not v.get('failed')), 'ok,', sum(1 for v in audio.values() if v.get('failed')), 'failed')
""")

md("## Stage C — `dj_brain.json` (the file the local DJ reads; no model needed there)")

code("""
from sklearn.preprocessing import normalize

id_index = {v: i for i, v in enumerate(ids)}
E = normalize(embs)
rank = lambda a: (np.argsort(np.argsort(a)) / max(1, len(a) - 1))

songs = {}
for vid in ids:
    a = audio.get(vid)
    if not a or a.get('failed'):
        continue
    m = manifest.get(vid, {})
    lg = lang.get(vid, [['?', 0]])
    songs[vid] = dict(a, file=m.get('file'), duration=m.get('duration'), tags=tags[vid], lang=lg[0][0], lang_p=lg[0][1])

keys = list(songs)
loud = rank(np.array([songs[k]['loud_db'] for k in keys]))
bright = rank(np.array([songs[k]['bright_share'] for k in keys]))
tempo = rank(np.array([songs[k]['bpm'] for k in keys]))
for k, l, b, t in zip(keys, loud, bright, tempo):
    songs[k]['energy'] = round(float(0.5 * l + 0.3 * b + 0.2 * t), 3)      # library-wide 0..1

# nearest neighbours by sound, so the DJ can shortlist without a matrix
M = E[[id_index[k] for k in keys]]
sim = M @ M.T
np.fill_diagonal(sim, -1)
for r, k in enumerate(keys):
    top = np.argsort(-sim[r])[:25]
    songs[k]['similar'] = [[keys[j], round(float(sim[r, j]), 3)] for j in top]

brain = {'version': 1, 'made': time.strftime('%Y-%m-%d'), 'count': len(songs), 'songs': songs}
save_json(OUT + '/dj_brain.json', brain)
print('dj_brain.json:', len(songs), 'songs,', os.path.getsize(OUT + '/dj_brain.json') // 1024, 'KB')
""")

md("""
## Stage D — playlists, written once

10 playlists of 25–40 songs, 3 of them Turkish. Turkish = Whisper hears Turkish (p ≥ 0.5) or the title has Turkish letters.
Order inside a playlist follows the same idea as the live DJ: tempo match, harmonic key step, sound similarity and an
energy arc. **If `dj_playlists_frozen.json` already exists this cell does nothing**: playlists are never regenerated.
""")

code("""
from sklearn.cluster import KMeans

FROZEN = OUT + '/dj_playlists_frozen.json'
TR_CHARS = re.compile('[çğışöüÇĞİŞÖÜ]')
N_TR, N_OTHER, MIN_LEN, MAX_LEN = 3, 7, 25, 40


def artist_of(song):
    f = (song.get('file') or '')
    return f.split(' - ')[0].strip().lower() if ' - ' in f else ''


def title_key(song):
    return re.sub(r'[^a-z0-9ğüşıöç]+', ' ', (song.get('file') or '').lower().rsplit('[', 1)[0]).strip()


def camelot_steps(a, b):
    if not a or not b:
        return 3
    na, nb, la, lb = int(a[:-1]), int(b[:-1]), a[-1], b[-1]
    d = min((na - nb) % 12, (nb - na) % 12)
    return min(d + (0 if la == lb else 1), 3)


def transition_cost(a, b, target, sim_ab):
    ratio = b['bpm'] / a['bpm']
    gap = min(abs(math.log(ratio)), abs(math.log(ratio * 2)), abs(math.log(ratio / 2)))
    tempo = gap * 6 if gap <= 0.06 else 0.6 + gap * 8 if gap <= 0.12 else 2.5
    key = (0.0, 0.15, 0.7, 1.1)[camelot_steps(a['camelot'], b['camelot'])]
    cost = tempo + key + abs(b['energy'] - target) * 2.2 + (1 - sim_ab) * 1.2
    if artist_of(a) and artist_of(a) == artist_of(b):
        cost += 0.8
    return cost


def arc(t):
    return 0.5 + 0.32 * math.sin(math.pi * min(1.0, t * 1.6)) * (0.75 if 0.62 < t < 0.75 else 1.0)


def order_playlist(members):
    left = list(members)
    n = len(left)
    cur = min(left, key=lambda k: abs(songs[k]['energy'] - arc(0)))
    left.remove(cur)
    route = [cur]
    while left:
        t = len(route) / n
        nxt = min(left, key=lambda k: transition_cost(songs[route[-1]], songs[k], arc(t), float(E[id_index[route[-1]]] @ E[id_index[k]])))
        left.remove(nxt)
        route.append(nxt)
    return route


def top_label(group, kind):
    score = {}
    for k in group:
        for lab, p in songs[k]['tags'][kind]:
            score[lab] = score.get(lab, 0) + p
    return sorted(score, key=score.get, reverse=True)


def build_group(pool, n_lists, used):
    X = E[[id_index[k] for k in pool]]
    km = KMeans(n_clusters=n_lists, n_init=10, random_state=7).fit(X)
    dist = np.linalg.norm(X[:, None, :] - km.cluster_centers_[None], axis=2)
    picks = []
    for c in range(n_lists):
        ranked = [pool[i] for i in np.argsort(dist[:, c]) if km.labels_[i] == c]
        picks.append(ranked[:MAX_LEN])
    taken = {k for p in picks for k in p} | used
    for c in range(n_lists):                       # top up short clusters with the nearest unused songs
        if len(picks[c]) < MIN_LEN:
            extra = [pool[i] for i in np.argsort(dist[:, c]) if pool[i] not in taken]
            need = MIN_LEN + 5 - len(picks[c])
            picks[c] += extra[:need]
            taken |= set(extra[:need])
    return picks


if os.path.exists(FROZEN):
    print('FROZEN playlists already exist, not regenerating:', FROZEN)
else:
    seen_titles, usable = set(), []
    for k in keys:
        s = songs[k]
        if not (100 <= (s.get('duration') or 0) <= 480) or title_key(s) in seen_titles:
            continue
        seen_titles.add(title_key(s))
        usable.append(k)
    is_tr = lambda k: (songs[k]['lang'] == 'tr' and songs[k]['lang_p'] >= 0.5) or bool(TR_CHARS.search(songs[k].get('file') or ''))
    tr_pool = [k for k in usable if is_tr(k)]
    other_pool = [k for k in usable if not is_tr(k)]
    print(len(tr_pool), 'Turkish,', len(other_pool), 'other usable songs')
    used = set()
    lists = []
    for pool, n_lists, tr in ((tr_pool, N_TR, True), (other_pool, N_OTHER, False)):
        for members in build_group(pool, n_lists, used):
            used |= set(members)
            genres, moods = top_label(members, 'genre'), top_label(members, 'mood')
            name = ('Türkçe ' if tr else '') + f'{genres[0].replace("turkish ", "").title()} · {moods[0].split(" and ")[0].title()}'
            route = order_playlist(members)
            bpms = [songs[k]['bpm'] for k in route]
            tracks = []
            for i, k in enumerate(route):
                s = songs[k]
                nxt = songs[route[i + 1]] if i + 1 < len(route) else None
                tr_info = None
                if nxt:
                    steps = camelot_steps(s['camelot'], nxt['camelot'])
                    ratio = nxt['bpm'] / s['bpm']
                    gap = min(abs(math.log(ratio)), abs(math.log(ratio * 2)), abs(math.log(ratio / 2)))
                    tr_info = {'key_steps': steps, 'bpm_gap': round(gap, 3),
                               'hint': 'smooth' if steps <= 1 and gap <= 0.05 else 'tempo_ride' if gap > 0.08 else 'cut'}
                tracks.append({'id': k, 'file': s['file'], 'bpm': s['bpm'], 'camelot': s['camelot'], 'energy': s['energy'],
                               'mix_in': s['mix_in']['at'], 'mix_out': s['mix_out']['at'], 'next': tr_info})
            lists.append({'name': name, 'turkish': tr, 'rules': {
                'bpm_range': [round(min(bpms)), round(max(bpms))], 'median_bpm': round(float(np.median(bpms))),
                'genres': genres[:3], 'moods': moods[:2], 'key_flow': 'camelot steps <= 1 where possible',
                'arc': 'warm up -> peak -> breather -> peak (same shape as realdj.energy_target)'}, 'tracks': tracks})
    seen = {}
    for pl in lists:                                # unique names
        seen[pl['name']] = seen.get(pl['name'], 0) + 1
        if seen[pl['name']] > 1:
            pl['name'] += f' {seen[pl["name"]]}'
    save_json(FROZEN, {'frozen': True, 'made': time.strftime('%Y-%m-%d'), 'playlists': lists})
    for pl in lists:
        print(f"{'TR' if pl['turkish'] else '  '} {pl['name']:<40} {len(pl['tracks'])} songs  {pl['rules']['bpm_range']} bpm")
""")

md("Done. Tell Claude — it pulls `Hoffle/out/` from Drive and wires it into the bot. Nothing here runs at DJ time.")

nb = {"cells": cells,
      "metadata": {"accelerator": "GPU", "colab": {"provenance": []},
                   "kernelspec": {"name": "python3", "display_name": "Python 3"}},
      "nbformat": 4, "nbformat_minor": 0}
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hoffle_dj_brain.ipynb")
with open(path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)
print("wrote", path, len(cells), "cells")
