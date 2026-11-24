#!/bin/bash
# TEMPORAIRE. Bandeau Buffet antillais : accras qui dorent (Pexels 37670884) puis repas de famille (Pexels 4298650),
# fondu entre les deux et boucle en fondu. 1280x720, sans son.
set -eu
cd "$(dirname "$0")"; OUT=../public/site/v/bandeaux; mkdir -p "$OUT" tmpf
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/a.mp4 https://videos.pexels.com/video-files/37670884/15970472_1920_1080_25fps.mp4
curl -fsSL -A "Mozilla/5.0 (magnolia-apercu)" -o tmpf/b.mp4 https://videos.pexels.com/video-files/4298650/4298650-hd_1920_1080_25fps.mp4
VF="fps=25,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,format=yuv420p"
# C = A(6 s) -> B(7.5 s), fondu 0.8 s : 12.7 s ; boucle : fin -> début
ffmpeg -nostdin -v error -y -ss 1 -t 6 -i tmpf/a.mp4 -ss 1.5 -t 7.5 -i tmpf/b.mp4 -an -filter_complex \
 "[0:v]$VF[a];[1:v]$VF[b];[a][b]xfade=transition=fade:duration=0.8:offset=5.2,split[x][y];[x]trim=0.8:12.7,setpts=PTS-STARTPTS[m];[y]trim=0:0.8,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=0.8:offset=11.1,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -profile:v high -preset slow -crf 27 -maxrate 2500k -bufsize 5000k -movflags +faststart "$OUT/buffet-antillais.mp4"
ffmpeg -nostdin -v error -y -i "$OUT/buffet-antillais.mp4" -frames:v 1 -q:v 4 "$OUT/buffet-antillais.jpg"
ffmpeg -nostdin -v error -y -i "$OUT/buffet-antillais.mp4" -vf "fps=6/11.9,scale=426:-2,tile=3x2" -frames:v 1 planche-buffet-antillais.jpg
ls -la "$OUT"/buffet-antillais.*; rm -rf tmpf
