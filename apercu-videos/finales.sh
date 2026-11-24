#!/bin/bash
# Fabrique les vidéos des vignettes : 720x900 (4:5), H.264 sans son, boucle sans saut (fondu de la fin vers le début),
# + image d'attente .jpg. Résultat dans public/site/v/accueil.
set -u
cd "$(dirname "$0")"
OUT=../public/site/v/accueil; mkdir -p "$OUT" tmpf
F=0.8   # durée du fondu de bouclage
grep -v '^#' finales.txt | while read -r nom url deb dur cx; do
  [ -z "$nom" ] && continue
  src=tmpf/$nom.src.mp4
  curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o "$src" "$url" || { echo "échec $nom"; continue; }
  tot=$(awk "BEGIN{print $dur+$F}")
  main=$(awk "BEGIN{print $dur}")
  off=$(awk "BEGIN{print $dur-$F}")
  VF="fps=25,scale=720:900:force_original_aspect_ratio=increase,crop=720:900:(iw-720)*$cx:(ih-900)/2,setsar=1,format=yuv420p"
  ffmpeg -nostdin -v error -y -ss "$deb" -t "$tot" -i "$src" -an -filter_complex \
    "[0:v]$VF,split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 1800k -bufsize 3600k -movflags +faststart "$OUT/$nom.mp4" || { echo "ffmpeg $nom"; continue; }
  ffmpeg -nostdin -v error -y -i "$OUT/$nom.mp4" -frames:v 1 -q:v 4 "$OUT/$nom.jpg"
  ls -la "$OUT/$nom.mp4" "$OUT/$nom.jpg"
done
rm -rf tmpf
