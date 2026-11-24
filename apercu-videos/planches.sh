#!/bin/bash
# TEMPORAIRE : planche des photos candidates (liste.txt : "id adresse").
cd "$(dirname "$0")"; mkdir -p tmp planches; rm -f tmp/*
while read -r id url; do [ -z "$id" ] && continue
  curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o "tmp/$id.jpg" "$url" || echo "échec $id"
done < liste.txt
montage -label '%t' tmp/*.jpg -geometry 300x300+4+4 -tile 5x -pointsize 16 planches/photos.jpg && ls -la planches
