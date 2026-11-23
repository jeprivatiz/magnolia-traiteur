# Outil temporaire : télécharge en grand (vignette officielle 960 px) les photos libres Wikimedia retenues pour la carte chinoise,
# les recadre si besoin (pour couper une inscription en bordure) et les enregistre en webp. Retiré avant la fusion.
import io, json, os, time, urllib.parse, urllib.request
from PIL import Image
UA = {'User-Agent': 'MagnoliaTraiteurSite/1.0 (https://github.com/jeprivatiz/magnolia-traiteur; photos libres) python-urllib'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
os.makedirs('public/site/c/africain-boutique', exist_ok=True)
for c in json.load(open('.github/apercu/choix.json', encoding='utf-8')):
    time.sleep(6)
    try:
        t = urllib.parse.unquote(c['titreCommons'])
        r = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': t, 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': 960})))
        u = list(r['query']['pages'].values())[0]['imageinfo'][0]['thumburl']
        time.sleep(2)
        im = Image.open(io.BytesIO(get(u))).convert('RGB')
        if c.get('crop'):
            l, tp, rr, b = c['crop']; W, H = im.size; im = im.crop((int(l * W), int(tp * H), int(rr * W), int(b * H)))
        im.save('public/site/c/africain-boutique/' + c['fichier'].replace('.jpg', '.webp'), 'WEBP', quality=80)
        print('ok', c['id'], im.size)
    except Exception as e: print('ÉCHEC', c['id'], e)
