#!/bin/bash
# TEMPORAIRE. Bandeau Cocktails & buffets, sans le plan des petits fours (Jean-Luc : « trop bas de gamme ») :
# invités en tenue avec un verre devant le buffet (Pexels 6761146), puis cocktail du soir en smoking (Pexels 12350362).
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/b.mp4 https://videos.pexels.com/video-files/6761146/6761146-hd_1920_1080_25fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/c.mp4 https://videos.pexels.com/video-files/12350362/12350362-hd_1920_1080_24fps.mp4
VF="fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p"
# B 6.5 s -> C 7 s, fondu 0.8 : 12.7 s ; boucle fin -> début
ffmpeg -nostdin -v error -y -ss 0.3 -t 6.5 -i tmpf/b.mp4 -ss 0 -t 7 -i tmpf/c.mp4 -an -filter_complex \
 "[0:v]$VF[b];[1:v]$VF[c];[b][c]xfade=transition=fade:duration=0.8:offset=5.7,split[x][y];[x]trim=0.8:12.7,setpts=PTS-STARTPTS[m];[y]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=11.1,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2500k -bufsize 5000k -movflags +faststart "$OUT/cocktails-buffets-2.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/cocktails-buffets-2.mp4" -frames:v 1 -q:v 4 "$OUT/cocktails-buffets-2.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/cocktails-buffets-2.mp4" -vf "fps=6/11.9,scale=426:-2,tile=3x2" -frames:v 1 planche.jpg
rm -rf tmpf
