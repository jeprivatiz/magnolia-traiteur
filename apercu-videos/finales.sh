#!/bin/bash
# Bandeau Saveurs du monde : plans courts de chefs différents, enchaînés en fondu, boucle sans saut. 1280x720 H.264 muet + image d'attente.
set -eu
cd "$(dirname "$0")"
OUT=../public/site/v/monde; mkdir -p "$OUT" tmpf
UA="Mozilla/5.0 (magnolia-apercu)"; F=0.7
n=0; ins=""; durs=()
while read -r nom url deb dur; do
  [ -z "$nom" ] && continue; case "$nom" in \#*) continue;; esac
  curl -fsSL -A "$UA" -o tmpf/s$n.mp4 "$url"
  ffmpeg -nostdin -v error -y -ss "$deb" -t "$dur" -i tmpf/s$n.mp4 -an -vf "fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p" -c:v libx264 -crf 14 -preset fast tmpf/c$n.mp4
  durs+=("$dur"); n=$((n+1))
done < finales.txt
# chaîne de fondus
args=""; for i in $(seq 0 $((n-1))); do args="$args -i tmpf/c$i.mp4"; done
fc=""; prev="[0:v]"; acc=${durs[0]}
for i in $(seq 1 $((n-1))); do
  off=$(awk "BEGIN{print $acc-$F}"); fc="$fc$prev[$i:v]xfade=transition=fade:duration=$F:offset=$off[x$i];"; prev="[x$i]"; acc=$(awk "BEGIN{print $acc+${durs[$i]}-$F}")
done
ffmpeg -nostdin -v error -y $args -filter_complex "${fc%;}" -map "$prev" -c:v libx264 -crf 14 -preset fast tmpf/chaine.mp4
# boucle : la fin se fond dans le début
tot=$acc; off=$(awk "BEGIN{print $tot-2*$F}")
ffmpeg -nostdin -v error -y -i tmpf/chaine.mp4 -an -filter_complex \
  "[0:v]split[a][b];[a]trim=$F:$tot,setpts=PTS-STARTPTS[m];[b]trim=0:$F,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$F:offset=$off,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2200k -bufsize 4400k -movflags +faststart "$OUT/chefs.mp4"
ffmpeg -nostdin -v error -y -ss 1 -i "$OUT/chefs.mp4" -frames:v 1 -q:v 3 "$OUT/chefs.jpg"
# version téléphone, plus légère (960x540)
ffmpeg -nostdin -v error -y -i "$OUT/chefs.mp4" -an -vf "scale=960:540" -c:v libx264 -profile:v high -preset slow -crf 29 -maxrate 1200k -bufsize 2400k -movflags +faststart "$OUT/chefs-m.mp4"
# planche de contrôle
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/chefs.mp4")
i=0; for p in 3 12 21 30 39 48 57 66 75 84 93; do t=$(awk "BEGIN{print $d*$p/100}"); ffmpeg -nostdin -v error -y -ss "$t" -i "$OUT/chefs.mp4" -frames:v 1 -vf scale=-2:180 tmpf/k$i.jpg; i=$((i+1)); done
ffmpeg -nostdin -v error -y $(for k in $(seq 0 10); do echo -n "-i tmpf/k$k.jpg "; done) -filter_complex "$(for k in $(seq 0 10); do echo -n "[$k]"; done)hstack=11" planches/finale.jpg
ls -la "$OUT"; echo "durée $d"
rm -rf tmpf
