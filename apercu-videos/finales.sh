#!/bin/bash
# TEMPORAIRE : photo -> vidéo de vignette 720x900 animée (zoom lent, léger glissement), 10 s, boucle aller-retour.
# finales.txt : "nom adresse cx cy" (cx, cy = point visé, 0..1)
set -u; cd "$(dirname "$0")"; OUT=../public/site/v/accueil; mkdir -p "$OUT" tmpf
grep -v '^#' finales.txt | while read -r nom url cx cy; do [ -z "$nom" ] && continue
  curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o "tmpf/$nom.jpg" "$url" || { echo "échec $nom"; continue; }
  # image de base 1440x1800 (4:5) recadrée autour du point visé
  ffmpeg -nostdin -v error -y -i "tmpf/$nom.jpg" -vf "scale=1440:1800:force_original_aspect_ratio=increase,crop=1440:1800:(iw-1440)*$cx:(ih-1800)*$cy" "tmpf/$nom-b.png"
  # 5 s de zoom avant 1.00 -> 1.12 en douceur, puis la même chose à l'envers : boucle sans saut
  ffmpeg -nostdin -v error -y -i "tmpf/$nom-b.png" -filter_complex \
    "[0:v]zoompan=z='1+0.12*(0.5-0.5*cos(PI*on/124))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=720x900:fps=25,format=yuv420p,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" \
    -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 24 -maxrate 1800k -bufsize 3600k -movflags +faststart -an "$OUT/$nom.mp4" || { echo "ffmpeg $nom"; continue; }
  ffmpeg -nostdin -v error -y -i "$OUT/$nom.mp4" -frames:v 1 -q:v 3 "$OUT/$nom.jpg"; ls -la "$OUT/$nom.mp4"
done; rm -rf tmpf
