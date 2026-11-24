#!/bin/bash
# Pour chaque vidéo de liste.txt : trouve le fichier (adresse donnée, ou devinée), en tire 5 images, fait une bande.
cd apercu-videos
mkdir -p tmp bandes planches
UA="Mozilla/5.0 (magnolia-apercu)"
essaie() { curl -fsIL -A "$UA" -o /dev/null "$1" 2>/dev/null; }
trouve() { # $1 id  $2 L|V
  local id=$1 o=$2 tailles
  if [ "$o" = V ]; then tailles="sd_360_640 sd_338_640 sd_540_960 sd_506_960 hd_720_1280 sd_240_426"; else tailles="sd_640_360 sd_640_338 sd_960_540 sd_960_506 hd_1280_720 sd_426_240"; fi
  for t in $tailles; do for f in 25 30 24 60 50 29 23; do
    u="https://videos.pexels.com/video-files/$id/$id-${t}_${f}fps.mp4"; if essaie "$u"; then echo "$u"; return; fi
  done; done
}
: > adresses.txt
while read -r theme src id url; do
  [ -z "$id" ] && continue
  case "$url" in
    M) url="https://assets.mixkit.co/videos/$id/$id-360.mp4";;
    L|V) url=$(trouve "$id" "$url");;
  esac
  if [ -z "$url" ]; then echo "$theme $src $id INTROUVABLE" | tee -a adresses.txt; continue; fi
  echo "$theme $src $id $url" | tee -a adresses.txt
  f=tmp/$src$id.mp4
  curl -fsSL -A "$UA" -o "$f" "$url" || { echo "échec $url"; continue; }
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"); d=${d%.*}; [ -z "$d" ] && d=5
  i=0; for p in 5 25 45 65 85; do
    t=$(awk "BEGIN{print $d*$p/100}")
    ffmpeg -v error -y -ss "$t" -i "$f" -frames:v 1 -vf "scale=-2:200" tmp/i$i.jpg; i=$((i+1))
  done
  ffmpeg -v error -y -i tmp/i0.jpg -i tmp/i1.jpg -i tmp/i2.jpg -i tmp/i3.jpg -i tmp/i4.jpg -filter_complex "[0][1][2][3][4]hstack=5,pad=iw:ih+28:0:28:color=white,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='$src$id  ${d}s':x=8:y=4:fontsize=20:fontcolor=black" "bandes/$theme-$src$id.jpg"
done < liste.txt
for th in $(cut -d' ' -f1 liste.txt | sort -u); do
  ls bandes/$th-*.jpg >/dev/null 2>&1 || continue
  # même largeur pour empiler
  n=0; args=""; for b in bandes/$th-*.jpg; do ffmpeg -v error -y -i "$b" -vf "scale=1400:-2,pad=1400:ih+6:0:0:white" tmp/s$n.jpg; args="$args -i tmp/s$n.jpg"; n=$((n+1)); done
  if [ $n -gt 1 ]; then ffmpeg -v error -y $args -filter_complex "vstack=$n" -q:v 4 planches/$th.jpg; else cp tmp/s0.jpg planches/$th.jpg; fi
done
rm -rf tmp bandes
ls -la planches
