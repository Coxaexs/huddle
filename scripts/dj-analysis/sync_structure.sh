#!/bin/bash
# Before running hoffle_structure.ipynb again: send the songs downloaded since the last run to Drive (Hoffle/full).
# Then open the notebook in Colab and Run all (it only analyses songs it hasn't done), and when it says ALL DONE:
#   sg server -c "umask 002; python3 ~/huddle/scripts/dj-analysis/export_structure.py"
# New songs also need a mood station:  sg server -c "umask 002; python3 ~/huddle/scripts/dj-analysis/classify_stations.py"
set -e
python3 /home/coxaexs/huddle/scripts/dj-analysis/make_clips.py --full
rclone copy /home/coxaexs/dj-analysis/full gdrive:Hoffle/full --transfers 8
echo "Drive has $(rclone lsf gdrive:Hoffle/full | wc -l) songs; $(rclone lsf gdrive:Hoffle/out/structure | grep -vc '^_') analysed."
