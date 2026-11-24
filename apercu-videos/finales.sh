#!/bin/bash
# Bandeau Saveurs du monde : plans courts de chefs (vidéos + photos animées), fondus, boucle sans saut. 1280x720 H.264 muet + image d'attente.
# Ligne vidéo : nom url debut duree
# Ligne photo : nom url - duree img cx cy zdebut zfin mode(fill|flou)
set -eu
cd "$(dirname "$0")"
OUT=../public/site/v/monde; mkdir -p "$OUT" tmpf planches
UA="Mozilla/5.0 (magnolia-site; contact infos@magnoliatraiteur.fr)"; F=0.7
n=0; durs=()
while read -r nom url deb dur typ cx cy z0 z1 mode; do
  [ -z "$nom" ] && continue; case "$nom" in \#*) continue;; esac
  if [ "${typ:-}" = img ]; then
    curl -fsSL -A "$UA" -o tmpf/s$n.jpg "$url"
    if [ "$mode" = flou ]; then
      ffmpeg -nostdin -v error -y -i tmpf/s$n.jpg -filter_complex "[0]scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,boxblur=40:4,eq=brightness=-0.08:saturation=0.8[bg];[0]scale=-2:1440[fg];[bg][fg]overlay=(W-w)/2:0" -q:v 2 tmpf/p$n.jpg
    else
      ffmpeg -nostdin -v error -y -i tmpf/s$n.jpg -vf "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440" -q:v 2 tmpf/p$n.jpg
    fi
    fr=$(awk "BEGIN{print int($dur*25)}")
    ffmpeg -nostdin -v error -y -loop 1 -i tmpf/p$n.jpg -t "$dur" -vf "fps=25,zoompan=z='$z0+($z1-$z0)*on/$fr':x='max(0,min(iw-iw/zoom,iw*$cx-iw/zoom/2))':y='max(0,min(ih-ih/zoom,ih*$cy-ih/zoom/2))':d=1:s=1280x720:fps=25,setsar=1,format=yuv420p" -c:v libx264 -crf 14 -preset fast tmpf/c$n.mp4
  else
    curl -fsSL -A "$UA" -o tmpf/s$n.mp4 "$url"
    ffmpeg -nostdin -v error -y -ss "$deb" -t "$dur" -i tmpf/s$n.mp4 -an -vf "fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p" -c:v libx264 -crf 14 -preset fast tmpf/c$n.mp4
  fi
  durs+=("$dur"); n=$((n+1)); echo "plan $nom ok"
done < finales.txt
args=""; for i in $(seq 0 $((n-1))); do args="$args -i tmpf/c$i.mp4"; done
fc=""; prev="[0:v]"; acc=${durs[0]}
for i in $(seq 1 $((n-1))); do
  off=$(awk "BEGIN{print $acc-$F}"); fc="$fc$prev[$i:v]xfade=transition=fade:duration=$F:offset=$off[x$i];"; prev="[x$i]"; acc=$(awk "BEGIN{print $acc+${durs[$i]}-$F}")
done
ffmpeg -nostdin -v error -y $args -filter_complex "${fc%;}" -map "$prev" -c:v libx264 -crf 14 -preset fast tmpf/chaine.mp4
tot=$acc; off=$(awk "BEGIN{print $tot-2*$F}")
ffmpeg -nostdin -v error -y -i tmpf/chaine.mp4 -an -filter_complex \
  "[0:v]split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2200k -bufsize 4400k -movflags +faststart "$OUT/chefs.mp4"
ffmpeg -nostdin -v error -y -ss 1 -i "$OUT/chefs.mp4" -frames:v 1 -q:v 3 "$OUT/chefs.jpg"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/chefs.mp4")
K=16; for k in $(seq 0 $((K-1))); do t=$(awk "BEGIN{print $d*($k+0.5)/$K}"); ffmpeg -nostdin -v error -y -ss "$t" -i "$OUT/chefs.mp4" -frames:v 1 -vf scale=-2:180 tmpf/k$k.jpg; done
ffmpeg -nostdin -v error -y $(for k in $(seq 0 $((K-1))); do echo -n "-i tmpf/k$k.jpg "; done) -filter_complex "$(for k in $(seq 0 $((K-1))); do echo -n "[$k]"; done)xstack=inputs=$K:layout=$(for k in $(seq 0 $((K-1))); do echo -n "$( [ $k -gt 0 ] && echo '|')$(( (k%4)*320 ))_$(( (k/4)*180 ))"; done)" planches/finale.jpg
ls -la "$OUT"; echo "durée $d"
rm -rf tmpf
