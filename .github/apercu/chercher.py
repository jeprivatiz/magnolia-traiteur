# Outil temporaire (accord de Jean-Luc, 2026-11-23) : cherche des photos libres (Wikimedia Commons, Openverse) pour chaque plat,
# télécharge de petites vignettes pour que Claude les regarde. Retiré avant la fusion.
import json, os, sys, time, urllib.parse, urllib.request
UA = {'User-Agent': 'MagnoliaTraiteurSite/1.0 (https://github.com/jeprivatiz/magnolia-traiteur; photos libres) python-urllib'}
def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: d = r.read()
    return d if raw else json.loads(d)
os.makedirs('apercu-photos/mat4', exist_ok=True)
meta = open('apercu-photos/mat4/meta.jsonl', 'w')
OK = ('cc0', 'cc-zero', 'public domain', 'pd', 'cc by', 'cc-by', 'by', 'by-sa', 'cc by-sa')
for line in open('.github/apercu/requetes.tsv', encoding='utf-8'):
    pid, q = line.rstrip('\n').split('\t')
    n = 0
    try:
        s = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': q + ' filetype:bitmap', 'gsrnamespace': 6, 'gsrlimit': 14, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 400}))
        pages = sorted((s.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
        for p in pages:
            ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata', {})
            lic = (em.get('LicenseShortName', {}).get('value') or '').lower()
            if 'nc' in lic.split('-') or 'nd' in lic.split('-'): continue
            n += 1; f = f'apercu-photos/mat4/{pid}-c{n}.jpg'
            open(f, 'wb').write(get(ii['thumburl'], raw=True))
            meta.write(json.dumps({'id': pid, 'f': f, 'src': 'commons', 'titre': p.get('title'), 'page': ii.get('descriptionurl'), 'url': ii.get('url'), 'licence': em.get('LicenseShortName', {}).get('value'), 'auteur': em.get('Artist', {}).get('value', '')[:200]}, ensure_ascii=False) + '\n')
            if n >= 7: break
    except Exception as e: print('commons', pid, e)
    m = 0
    try:
        s = get('https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': q, 'license_type': 'commercial,modification', 'page_size': 14, 'mature': 'false'}))
        for r in s.get('results', []):
            if m >= 7: break
            try:
                m += 1; f = f'apercu-photos/mat4/{pid}-o{m}.jpg'
                open(f, 'wb').write(get(r.get('thumbnail') or r['url'], raw=True))
                meta.write(json.dumps({'id': pid, 'f': f, 'src': 'openverse', 'titre': r.get('title'), 'page': r.get('foreign_landing_url'), 'url': r.get('url'), 'licence': (r.get('license') or '') + ' ' + (r.get('license_version') or ''), 'auteur': r.get('creator'), 'fournisseur': r.get('provider')}, ensure_ascii=False) + '\n')
            except Exception as e: m -= 1; print('dl', pid, e)
    except Exception as e: print('openverse', pid, e)
    time.sleep(3.2)
os.makedirs('apercu-photos/mat4/grand', exist_ok=True)
for k,v in {'chef1': 36430080, 'chef2': 15671409, 'chef3': 38127716, 'chef4': 15671274, 'chef5': 2544829, 'chef6': 31657837, 'chef7': 18337050, 'chef8': 17086340, 'chef9': 39531146, 'chef10': 19553654, 'chef11': 4253312, 'plat1': 32399760, 'plat2': 38431749, 'plat3': 6880221, 'plat4': 306059, 'plat5': 8112907, 'plat6': 1327393, 'plat7': 1639563}.items():
    try: open(f'apercu-photos/mat4/grand/{k}-{v}.jpg','wb').write(get(f'https://images.pexels.com/photos/{v}/pexels-photo-{v}.jpeg?auto=compress&cs=tinysrgb&w=2400', raw=True))
    except Exception as e: print('chef', k, e)
for k,v in {'chaise4': 35560665, 'rack3': 1561597}.items():
    try: open(f'apercu-photos/mat4/grand/{k}.jpg','wb').write(get(f'https://images.pexels.com/photos/{v}/pexels-photo-{v}.jpeg?auto=compress&cs=tinysrgb&w=1400', raw=True))
    except Exception as e: print('grand', k, e)
for u,nm in [('https://live.staticflickr.com/4004/4466169977_c3026c0874_b.jpg','g1-o3'),('https://live.staticflickr.com/65535/54546620525_357a2bb520_b.jpg','g4-o3')]:
    try: open(f'apercu-photos/mat4/grand/{nm}.jpg','wb').write(get(u, raw=True))
    except Exception as e: print('flickr', nm, e)
meta.close()
