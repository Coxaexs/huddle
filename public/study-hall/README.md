# Study Hall audio

The music and rain Study Hall plays (`app/components/study-hall-activity.tsx`).
Everything here is in the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), so it
can be shipped, streamed and modified without asking anyone.

## Music

26 tracks by **HoliznaCC0**, from Free Music Archive
(https://freemusicarchive.org/music/holiznacc0/), each published there as
CC0 1.0:

| Album | Tracks |
| --- | --- |
| Public Domain Lofi | Still Life, Birds, Calm Currents, Bubbles, Tranquil Mindscape, Lucid, Moon Unit, Tokyo Sunset, Reminders, Shimmer, Warm Fuzz, Walking Away, Color Of A Soul, When I Was Human, Complicated Feelings, Tetrapod, Dreamy Reverie, Ease into Night, Transient |
| Winter Lofi | Fire Place, First Snow |
| Summer Air (Lo-fi) | The Last Long Day |
| Ocean Memory (Lo-fi Chill) | Ocean Memory, Cold (Salt) Water |
| Spring at last (LOFI TAPE) | Spring At Last |
| Spring Woke Me Up | Hope On Repeat |

The originals are 320 kbps MP3. These copies are 160 kbps MP3 (48 kHz stereo),
turned down to a common loudness of about -16.5 LUFS so no track jumps out,
with silence trimmed from the ends.

## Rain

`rain.mp3` is 48 seconds of "RAIN on glass window" by nicoproson
(https://freesound.org/people/nicoproson/sounds/648529/, CC0 1.0), made louder.
The player loops it by fading each pass into the next.

## Adding a track

1. Check the licence on the track's own page. Only CC0 or public domain goes here.
2. Encode it like the others, for example:
   `ffmpeg -i in.mp3 -map 0:a:0 -map_metadata -1 -af volume=-3dB -c:a libmp3lame -b:a 160k -ar 48000 out.mp3`
   (pick the volume that brings it to about -16.5 LUFS; `ffmpeg -i in.mp3 -af ebur128 -f null -` prints the loudness).
3. Add it to `lib/study-hall-tracks.ts` with its exact length in milliseconds
   (`ffprobe -show_entries format=duration out.mp3`). Every browser works out
   what the room is playing from those lengths, so they have to match the files.
