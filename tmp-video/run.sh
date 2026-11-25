#!/bin/bash
set -u
cd "$(dirname "$0")"; mkdir -p src out
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"; F=0.8
for id in 5929447 5617252 14058816 7608907; do
  curl -fsSL -A "$UA" -o src/$id.mp4 "https://www.pexels.com/download/video/$id/" || { echo "$id echec"; continue; }
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 src/$id.mp4); echo "$id $d" >> out/infos.txt
  T=$(awk "BEGIN{t=$d-0.5; print (t>14?14:t)}")
  ffmpeg -nostdin -v error -y -ss 0.3 -t $T -i src/$id.mp4 -an -vf "fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p" -c:v libx264 -crf 14 -preset fast src/c$id.mp4
  off=$(awk "BEGIN{print $T-2*$F}")
  ffmpeg -nostdin -v error -y -i src/c$id.mp4 -an -filter_complex "[0:v]split[a][b];[a]trim=$F:$T,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2200k -bufsize 4400k -movflags +faststart out/$id.mp4
  ffmpeg -nostdin -v error -y -ss 3 -i out/$id.mp4 -frames:v 1 -q:v 3 out/$id.jpg
  ffmpeg -nostdin -v error -y -i out/$id.mp4 -vf "fps=1/1.2,scale=320:-2,tile=4x3" -frames:v 1 out/planche-$id.jpg
done
ls -la out
