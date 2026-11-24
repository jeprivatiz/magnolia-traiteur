#!/bin/bash
# TEMPORAIRE. Vidéos des grands bandeaux : 1280x720, H.264 sans son, boucle en fondu, + image .jpg (1re image).
# Ligne de bandeaux.txt : nom url debut duree cx cy zoom
set -u
cd "$(dirname "$0")"
OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf
F=0.8
grep -v '^#' bandeaux.txt | while read -r nom url deb dur cx cy z; do
  [ -z "$nom" ] && continue
  W=$(awk "BEGIN{print int(1280*$z/2)*2}"); H=$(awk "BEGIN{print int(720*$z/2)*2}")
  src=tmpf/$nom.src.mp4
  curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o "$src" "$url" || { echo "échec $nom"; continue; }
  tot=$(awk "BEGIN{print $dur+$F}"); off=$(awk "BEGIN{print $dur-$F}")
  VF="fps=25,scale=$W:$H:force_original_aspect_ratio=increase,crop=1280:720:(iw-1280)*$cx:(ih-720)*$cy,setsar=1,format=yuv420p"
  ffmpeg -nostdin -v error -y -ss "$deb" -t "$tot" -i "$src" -an -filter_complex \
    "[0:v]$VF,split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2500k -bufsize 5000k -movflags +faststart "$OUT/$nom.mp4" || { echo "ffmpeg $nom"; continue; }
  ffmpeg -nostdin -v error -y -i "$OUT/$nom.mp4" -frames:v 1 -q:v 4 "$OUT/$nom.jpg"
  # planche de contrôle (6 images)
  ffmpeg -nostdin -v error -y -i "$OUT/$nom.mp4" -vf "fps=6/$dur,scale=426:-2,tile=3x2" -frames:v 1 "planche-$nom.jpg"
  ls -la "$OUT/$nom.mp4" "$OUT/$nom.jpg"
done
rm -rf tmpf
