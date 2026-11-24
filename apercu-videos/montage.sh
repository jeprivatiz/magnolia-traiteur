#!/bin/bash
# TEMPORAIRE. Bandeau Cocktails & buffets : petits fours pris sur le buffet (Pexels 6760602), invités en tenue avec
# un verre devant le buffet (Pexels 6761146), cocktail du soir en smoking (Pexels 12350362). Fondus, boucle. 1280x720.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/a.mp4 https://videos.pexels.com/video-files/6760602/6760602-hd_1920_1080_25fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/b.mp4 https://videos.pexels.com/video-files/6761146/6761146-hd_1920_1080_25fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/c.mp4 https://videos.pexels.com/video-files/12350362/12350362-hd_1920_1080_24fps.mp4
VF="fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p"
ffmpeg -nostdin -v error -y -ss 1 -t 5 -i tmpf/a.mp4 -ss 0.5 -t 5 -i tmpf/b.mp4 -ss 0 -t 5.5 -i tmpf/c.mp4 -an -filter_complex \
 "[0:v]$VF[a];[1:v]$VF[b];[2:v]$VF[c];[a][b]xfade=transition=fade:duration=0.8:offset=4.2[ab];[ab][c]xfade=transition=fade:duration=0.8:offset=8.4,split[x][y];[x]trim=0.8:13.9,setpts=PTS-STARTPTS[m];[y]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=12.3,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2500k -bufsize 5000k -movflags +faststart "$OUT/cocktails-buffets.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/cocktails-buffets.mp4" -frames:v 1 -q:v 4 "$OUT/cocktails-buffets.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/cocktails-buffets.mp4" -vf "fps=6/13.1,scale=426:-2,tile=3x2" -frames:v 1 planche.jpg
ls -la "$OUT"/cocktails-buffets.*; rm -rf tmpf
