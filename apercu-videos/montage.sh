#!/bin/bash
# TEMPORAIRE. Bandeau Spécialités japonaises : chef qui pose le saumon sur le maki (Pexels 8901982) puis le tranche
# (Pexels 8901980), fondu entre les deux et boucle en fondu. 1280x720, sans son.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/a.mp4 https://videos.pexels.com/video-files/8901982/8901982-hd_1920_1080_25fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/b.mp4 https://videos.pexels.com/video-files/8901980/8901980-hd_1920_1080_25fps.mp4
VF="fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p"
ffmpeg -nostdin -v error -y -ss 0.5 -t 6.5 -i tmpf/a.mp4 -ss 0.5 -t 7 -i tmpf/b.mp4 -an -filter_complex \
 "[0:v]$VF[a];[1:v]$VF[b];[a][b]xfade=transition=fade:duration=0.8:offset=5.7,split[x][y];[x]trim=0.8:12.7,setpts=PTS-STARTPTS[m];[y]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=11.1,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2500k -bufsize 5000k -movflags +faststart "$OUT/specialites-japonaises.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/specialites-japonaises.mp4" -frames:v 1 -q:v 4 "$OUT/specialites-japonaises.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/specialites-japonaises.mp4" -vf "fps=6/11.9,scale=426:-2,tile=3x2" -frames:v 1 planche.jpg
ls -la "$OUT"/specialites-japonaises.*; rm -rf tmpf
