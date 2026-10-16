#!/bin/bash
# Tag newly downloaded songs: cut a 30 s clip (-> Hoffle/new/) and a full mono copy (-> Hoffle/full/)
# for songs not sent yet. Then run the Colab notebook (Run all) and pull_results.sh.
set -e
OUT=/home/coxaexs/dj-analysis
rm -rf "$OUT/clips_new"
python3 /home/coxaexs/huddle/scripts/dj-analysis/make_clips.py --new
python3 /home/coxaexs/huddle/scripts/dj-analysis/make_clips.py --full
rclone copy "$OUT/clips_new" gdrive:Hoffle/new --progress
rclone copy "$OUT/full" gdrive:Hoffle/full --transfers 8 --progress
