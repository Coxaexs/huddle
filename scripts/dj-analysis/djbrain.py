"""Optional song knowledge for the DJ: how songs SOUND, from the offline Colab analysis.

dj_brain/ (next to this file, made by export_brain.py) holds one sound fingerprint per song (CLAP embedding), plus
language, energy and mix points. This module only answers questions about it. It is read-only, loads lazily, never
raises, and answers None whenever it has no opinion:

  * DJ_BRAIN=0 in the environment, or no dj_brain/ folder, or a damaged file  -> every call returns None
  * a song that was never analysed (not on YouTube, added after the Colab run)   -> None for that song

So the DJ behaves exactly as it did before the brain existed whenever Colab data is missing. Nothing here needs
Colab, Drive, the network or a GPU at run time.
"""

import json
import logging
import os
import threading

import numpy as np

logger = logging.getLogger("MusicBot.DJBrain")

HERE = os.path.dirname(os.path.abspath(__file__))
BRAIN_DIR = os.environ.get("DJ_BRAIN_DIR") or os.path.join(HERE, "dj_brain")

# Cosine similarity of two random songs in the library: median 0.51, top 10% above 0.74, bottom 25% below 0.38.
SIM_MEDIAN = 0.51
SIM_SPREAD = 0.15
SIM_HIGH = 0.74
SIM_LOW = 0.38

_lock = threading.Lock()
_state = {"tried": False, "songs": None, "index": None, "emb": None}


def _load():
    with _lock:
        if _state["tried"]:
            return _state["emb"] is not None
        _state["tried"] = True
        if os.environ.get("DJ_BRAIN", "1") == "0":
            return False
        try:
            with open(os.path.join(BRAIN_DIR, "songs.json"), encoding="utf-8") as f:
                songs = json.load(f)
            with open(os.path.join(BRAIN_DIR, "ids.json"), encoding="utf-8") as f:
                ids = json.load(f)
            emb = np.load(os.path.join(BRAIN_DIR, "emb.npy")).astype(np.float32)
            if emb.ndim != 2 or len(ids) != len(emb):
                raise ValueError("embedding rows do not match ids")
            _state.update(songs=songs, index={v: i for i, v in enumerate(ids)}, emb=emb)
            logger.info("DJ brain loaded: %d songs", len(ids))
            return True
        except FileNotFoundError:
            logger.info("DJ brain not installed (%s); the DJ runs without it", BRAIN_DIR)
        except Exception:
            logger.warning("DJ brain could not be read; the DJ runs without it", exc_info=True)
        return False


def reload():
    """Forget what was loaded; the next call reads the folder again (after export_brain.py)."""
    with _lock:
        _state.update(tried=False, songs=None, index=None, emb=None)


def enabled():
    return _load()


def song_id(keys):
    """The YouTube id of a track from its keys (mixer.track_key gives 'yt:<id>'), or None."""
    for key in keys or ():
        if isinstance(key, str) and key.startswith("yt:"):
            return key[3:]
    return None


def lookup(keys):
    """What the brain knows about this song (bpm, camelot, energy, lang, mix_in, mix_out, drop_in), or None."""
    try:
        if not _load():
            return None
        return _state["songs"].get(song_id(keys))
    except Exception:
        return None


def similarity(keys_a, keys_b):
    """How alike two songs sound, cosine -1..1 (random pair ~0.5, very alike > 0.74), or None if either is unknown."""
    try:
        if not _load():
            return None
        index = _state["index"]
        a, b = index.get(song_id(keys_a)), index.get(song_id(keys_b))
        if a is None or b is None:
            return None
        emb = _state["emb"]
        return float(emb[a] @ emb[b])
    except Exception:
        return None


def vibe_bonus(sim, weight=0.35):
    """Score change for a candidate next song (lower score = better): negative when it sounds like what is playing."""
    if sim is None:
        return 0.0
    return -max(-2.0, min(2.0, (sim - SIM_MEDIAN) / SIM_SPREAD)) * weight
