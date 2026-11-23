# Outil temporaire (accord de Jean-Luc, 2026-11-23) : cherche des photos libres (Wikimedia Commons, Openverse) pour chaque plat,
# télécharge de petites vignettes pour que Claude les regarde. Retiré avant la fusion.
import json, os, sys, time, urllib.parse, urllib.request
UA = {'User-Agent': 'MagnoliaTraiteurSite/1.0 (https://github.com/jeprivatiz/magnolia-traiteur; photos libres) python-urllib'}
def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: d = r.read()
    return d if raw else json.loads(d)
os.makedirs('apercu-photos/mat3', exist_ok=True)
meta = open('apercu-photos/mat3/meta.jsonl', 'w')
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
            n += 1; f = f'apercu-photos/mat3/{pid}-c{n}.jpg'
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
                m += 1; f = f'apercu-photos/mat3/{pid}-o{m}.jpg'
                open(f, 'wb').write(get(r.get('thumbnail') or r['url'], raw=True))
                meta.write(json.dumps({'id': pid, 'f': f, 'src': 'openverse', 'titre': r.get('title'), 'page': r.get('foreign_landing_url'), 'url': r.get('url'), 'licence': (r.get('license') or '') + ' ' + (r.get('license_version') or ''), 'auteur': r.get('creator'), 'fournisseur': r.get('provider')}, ensure_ascii=False) + '\n')
            except Exception as e: m -= 1; print('dl', pid, e)
    except Exception as e: print('openverse', pid, e)
    time.sleep(3.2)
for k,v in {'chaise4': 35560665, 'rack8': 5377154, 'rack9': 6276, 'rack10': 8903288, 'mob1': 5794154, 'verre6': 18142097}.items():
    try: open(f'apercu-photos/mat3/px-{k}-{v}.jpg','wb').write(get(f'https://images.pexels.com/photos/{v}/pexels-photo-{v}.jpeg?auto=compress&cs=tinysrgb&w=600', raw=True))
    except Exception as e: print('pexels', k, e)
os.makedirs('apercu-photos/mat3/grand', exist_ok=True)
for k,v in {'chauf1': 8425027, 'chaf2': 2291367, 'deco2': 2306281, 'set3': 17057034, 'set1': 291767, 'dess1': 1414234, 'eco3': 4857600, 'nappe2': 4639508, 'nappe3': 8112784, 'verre1': 29157921, 'set2': 735869, 'rack6': 18977894, 'samoussas': 4449068}.items():
    try: open(f'apercu-photos/mat3/grand/{k}.jpg','wb').write(get(f'https://images.pexels.com/photos/{v}/pexels-photo-{v}.jpeg?auto=compress&cs=tinysrgb&w=1400', raw=True))
    except Exception as e: print('grand', k, e)
for n,t in enumerate(['File:Marquee_tent_for_a_holiday_resort.jpg', 'File:Olympic-Sculpture-Pizza-2935.jpg', 'File:GD_廣東_ZS_中山市_東區_Dong_District_興文路_XingWen_Road_帝景東方_Dijing_Oriental_潮小得餐廳_ChaoXiaoDe_Restaurant_rice_cooker_August_2024_R12S.jpg']):
    try:
        time.sleep(5)
        r = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','titles':t,'prop':'imageinfo','iiprop':'url','iiurlwidth':1280}))
        u = list(r['query']['pages'].values())[0]['imageinfo'][0]['thumburl']; time.sleep(2)
        open(f'apercu-photos/mat3/grand/commons{n}.jpg','wb').write(get(u, raw=True))
    except Exception as e: print('commons grand', t, e)
for u,nm in [('https://live.staticflickr.com/65535/49340231898_b5028d4ffa_b.jpg','table-o4'),('https://live.staticflickr.com/65535/49340682411_8349e24ce3_b.jpg','table-o2')]:
    try: open(f'apercu-photos/mat3/grand/{nm}.jpg','wb').write(get(u, raw=True))
    except Exception as e: print('flickr', nm, e)
meta.close()
