#!/bin/bash
# Vidéos des fiches animations : 800x600 (4:3), H.264 sans son, boucle sans saut (fondu de la fin vers le début),
# + image d'attente .jpg. Résultat dans public/site/v/animations. Ligne : nom url debut duree cx cy zoom
set -u
cd "$(dirname "$0")"
OUT=../public/site/v/animations; mkdir -p "$OUT" tmpf
F=0.8
grep -v '^#' finales.txt | while read -r nom url deb dur cx cy z; do
  [ -z "$nom" ] && continue
  cx=${cx:-0.5}; cy=${cy:-0.5}; z=${z:-1}; W=$(awk "BEGIN{print int(800*$z/2)*2}"); H=$(awk "BEGIN{print int(600*$z/2)*2}")
  src=tmpf/$nom.src.mp4
  curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o "$src" "$url" || { echo "échec $nom"; continue; }
  tot=$(awk "BEGIN{print $dur+$F}"); off=$(awk "BEGIN{print $dur-$F}")
  VF="fps=25,scale=$W:$H:force_original_aspect_ratio=increase,crop=800:600:(iw-800)*$cx:(ih-600)*$cy,setsar=1,format=yuv420p"
  ffmpeg -nostdin -v error -y -ss "$deb" -t "$tot" -i "$src" -an -filter_complex \
    "[0:v]$VF,split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 28 -maxrate 1500k -bufsize 3000k -movflags +faststart "$OUT/$nom.mp4" || { echo "ffmpeg $nom"; continue; }
  ffmpeg -nostdin -v error -y -i "$OUT/$nom.mp4" -frames:v 1 -q:v 4 "$OUT/$nom.jpg"
  ls -la "$OUT/$nom.mp4" "$OUT/$nom.jpg"
done
rm -rf tmpf
