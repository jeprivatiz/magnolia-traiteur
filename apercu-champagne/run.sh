#!/bin/bash
# TEMPORAIRE : télécharge les vidéos Pexels candidates et fait une planche d'images par vidéo.
set -u
cd "$(dirname "$0")"; mkdir -p src planches
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
while read -r id; do
  [ -z "$id" ] && continue; f=src/$id.mp4; ok=""
  curl -fsSL -A "$UA" -o $f "https://www.pexels.com/download/video/$id/" && file $f | grep -qi "media\|mp4\|iso" && ok=1
  if [ -z "$ok" ]; then
    for r in uhd_3840_2160 uhd_2560_1440 hd_1920_1080 hd_1280_720; do for fps in 25 24 30 50 60; do
      if curl -fsSL -A "$UA" -o $f "https://videos.pexels.com/video-files/$id/$id-${r}_${fps}fps.mp4"; then ok=1; echo "$id $r $fps" >> planches/sources.txt; break 2; fi
    done; done
  else echo "$id download" >> planches/sources.txt; fi
  [ -z "$ok" ] && { echo "$id ECHEC" >> planches/sources.txt; continue; }
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f); echo "$id durée $d $(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 $f)" >> planches/sources.txt
  ffmpeg -nostdin -v error -y -i $f -vf "fps=1/1.5,scale=320:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='%{pts\:hms}':x=5:y=5:fontcolor=white:fontsize=14:box=1:boxcolor=black,tile=4x4" -frames:v 1 planches/$id.jpg
done < liste.txt
cp src/*.mp4 . 2>/dev/null; true
