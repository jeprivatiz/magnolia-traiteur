#!/bin/bash
# Planches de photos Pexels candidates : photos.txt = "groupe id" ; une vignette 360 px de haut avec l'id écrit.
cd apercu-videos; mkdir -p tmp planches
[ -s photos.txt ] || exit 0
for g in $(cut -d' ' -f1 photos.txt | sort -u); do
  n=0; args=""
  for id in $(awk -v g=$g '$1==g{print $2}' photos.txt); do
    curl -fsSL -A "Mozilla/5.0" -o tmp/$id.jpg "https://images.pexels.com/photos/$id/pexels-photo-$id.jpeg?auto=compress&cs=tinysrgb&h=400" || continue
    ffmpeg -nostdin -v error -y -i tmp/$id.jpg -vf "scale=-2:300,pad=iw+6:ih+30:0:30:white,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='$id':x=6:y=4:fontsize=20:fontcolor=black,scale=480:330:force_original_aspect_ratio=decrease,pad=480:330:0:0:white" tmp/v$n.jpg && { args="$args -i tmp/v$n.jpg"; n=$((n+1)); }
  done
  cols=4; rows=$(( (n+cols-1)/cols )); lay=""; for i in $(seq 0 $((n-1))); do lay="$lay$( [ -n "$lay" ] && echo '|')$(( (i%cols)*480 ))_$(( (i/cols)*330 ))"; done
  ffmpeg -nostdin -v error -y $args -filter_complex "xstack=inputs=$n:layout=$lay:fill=white" -q:v 4 planches/$g.jpg
done
rm -rf tmp; ls -la planches
