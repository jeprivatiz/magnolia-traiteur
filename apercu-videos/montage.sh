#!/bin/bash
# TEMPORAIRE. Fiche Stand à burgers : burgers coiffés de leur pain sur la plaque (Pexels 37284846), puis le chef pose
# le steak au cheddar sur le pain (Pexels 32092904). Fondu, boucle. 800x600 comme les autres animations.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/animations; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/a.mp4 https://videos.pexels.com/video-files/37284846/15795061_1920_1080_60fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/b.mp4 "$(cat lien-b.txt)"
VF="fps=25,scale=800:600:force_original_aspect_ratio=increase,crop=800:600,setsar=1,format=yuv420p"
ffmpeg -nostdin -v error -y -ss 0 -t 4 -i tmpf/a.mp4 -ss 0.2 -t 6.5 -i tmpf/b.mp4 -an -filter_complex \
 "[0:v]$VF[a];[1:v]$VF[b];[a][b]xfade=transition=fade:duration=0.8:offset=3.2,split[x][y];[x]trim=0.8:9.7,setpts=PTS-STARTPTS[m];[y]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=8.1,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 28 -maxrate 1500k -bufsize 3000k -movflags +faststart "$OUT/burgers-2.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/burgers-2.mp4" -frames:v 1 -q:v 4 "$OUT/burgers-2.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/burgers-2.mp4" -vf "fps=8/8.9,scale=320:-2,tile=4x2" -frames:v 1 planche.jpg
rm -rf tmpf
