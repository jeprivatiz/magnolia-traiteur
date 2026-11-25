#!/bin/bash
# TEMPORAIRE. Vignette Animations salées (accueil) : viande grillée dans les flammes (Pexels 32546598). 4:5 720x900, sans son, boucle en fondu.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/accueil; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/a.mp4 https://videos.pexels.com/video-files/32546598/13879991_1920_1080_24fps.mp4
VF="fps=25,scale=-2:900,crop=720:900:(iw-720)*0.5:0,setsar=1,format=yuv420p"
ffmpeg -nostdin -v error -y -ss 2 -t 10.8 -i tmpf/a.mp4 -an -filter_complex \
 "[0:v]$VF,split[a][b];[a]trim=0.8:10.8,setpts=PTS-STARTPTS[m];[b]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=9.2,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 28 -maxrate 1500k -bufsize 3000k -movflags +faststart "$OUT/barbecue.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/barbecue.mp4" -frames:v 1 -q:v 4 "$OUT/barbecue.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/barbecue.mp4" -vf "fps=6/10,scale=240:-2,tile=6x1" -frames:v 1 planche.jpg
rm -rf tmpf
