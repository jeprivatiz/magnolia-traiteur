# Outil temporaire : télécharge en grand les photos libres retenues pour la carte chinoise, les recadre si besoin
# (pour couper une inscription en bordure) et les enregistre en webp. Retiré avant la fusion.
import io, json, os, time, urllib.request
from PIL import Image
UA = {'User-Agent': 'MagnoliaApercu/1.0 (photos libres; usage interne)'}
os.makedirs('public/site/c/chinois-carte', exist_ok=True)
for c in json.load(open('.github/apercu/choix.json', encoding='utf-8')):
    time.sleep(2)
    try:
        try: d = urllib.request.urlopen(urllib.request.Request(c['url'], headers=UA), timeout=60).read()
        except Exception as e:
            print('thumb', c['id'], e); time.sleep(5)
            d = urllib.request.urlopen(urllib.request.Request(c.get('url2') or c['url'], headers=UA), timeout=60).read()
        im = Image.open(io.BytesIO(d)).convert('RGB')
        if c.get('crop'):
            l, t, r, b = c['crop']; W, H = im.size; im = im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
        im.thumbnail((1400, 1400))
        im.save('public/site/c/chinois-carte/' + c['fichier'].replace('.jpg', '.webp'), 'WEBP', quality=80)
        print('ok', c['id'], im.size)
    except Exception as e: print('ÉCHEC', c['id'], c['url'], e)
