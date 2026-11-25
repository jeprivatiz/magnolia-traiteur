#!/bin/bash
# TEMPORAIRE : montage du bandeau de La cave de Magnolia (2 vidéos Pexels, fondus, boucle sans saut), 1280x720 muet + image d'attente.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf planches
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"; F=0.8
VF="fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=brightness=-0.03:saturation=0.95,setsar=1,format=yuv420p"
curl -fsSL -A "$UA" -o tmpf/a.mp4 "https://www.pexels.com/download/video/8915180/"
curl -fsSL -A "$UA" -o tmpf/b.mp4 "https://www.pexels.com/download/video/8765009/"
ffmpeg -nostdin -v error -y -ss 1.2 -t 12.5 -i tmpf/a.mp4 -an -vf "$VF" -c:v libx264 -crf 14 -preset fast tmpf/c0.mp4
ffmpeg -nostdin -v error -y -ss 0.3 -t 8.0 -i tmpf/b.mp4 -an -vf "$VF" -c:v libx264 -crf 14 -preset fast tmpf/c1.mp4
ffmpeg -nostdin -v error -y -i tmpf/c0.mp4 -i tmpf/c1.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$F:offset=11.7[v]" -map "[v]" -c:v libx264 -crf 14 -preset fast tmpf/chaine.mp4
tot=$(awk "BEGIN{print 12.5+8.0-$F}"); off=$(awk "BEGIN{print $tot-2*$F}")
ffmpeg -nostdin -v error -y -i tmpf/chaine.mp4 -an -filter_complex \
  "[0:v]split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2200k -bufsize 4400k -movflags +faststart "$OUT/cave-champagne.mp4"
ffmpeg -nostdin -v error -y -ss 4 -i "$OUT/cave-champagne.mp4" -frames:v 1 -q:v 3 "$OUT/cave-champagne.jpg"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/cave-champagne.mp4")
ffmpeg -nostdin -v error -y -i "$OUT/cave-champagne.mp4" -vf "fps=1/1.2,scale=320:-2,tile=4x4" -frames:v 1 planches/finale.jpg
ls -la "$OUT"/cave-*; echo "durée $d"
rm -rf tmpf
