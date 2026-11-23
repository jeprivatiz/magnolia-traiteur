# Outil temporaire (accord de Jean-Luc, 2026-11-23) : cherche des photos libres (Wikimedia Commons, Openverse) pour chaque plat,
# télécharge de petites vignettes pour que Claude les regarde. Retiré avant la fusion.
import json, os, sys, time, urllib.parse, urllib.request
UA = {'User-Agent': 'MagnoliaApercu/1.0 (photos libres; usage interne)'}
def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: d = r.read()
    return d if raw else json.loads(d)
os.makedirs('apercu-photos/mat2', exist_ok=True)
meta = open('apercu-photos/mat2/meta.jsonl', 'w')
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
            n += 1; f = f'apercu-photos/mat2/{pid}-c{n}.jpg'
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
                m += 1; f = f'apercu-photos/mat2/{pid}-o{m}.jpg'
                open(f, 'wb').write(get(r.get('thumbnail') or r['url'], raw=True))
                meta.write(json.dumps({'id': pid, 'f': f, 'src': 'openverse', 'titre': r.get('title'), 'page': r.get('foreign_landing_url'), 'url': r.get('url'), 'licence': (r.get('license') or '') + ' ' + (r.get('license_version') or ''), 'auteur': r.get('creator'), 'fournisseur': r.get('provider')}, ensure_ascii=False) + '\n')
            except Exception as e: m -= 1; print('dl', pid, e)
    except Exception as e: print('openverse', pid, e)
    time.sleep(3.2)
for k,v in {'chaf1': 35247186, 'chaf2': 2291367, 'chaf3': 4007053, 'piz1': 18126715, 'piz2': 11181966, 'piz3': 14978624, 'piz4': 36214726, 'piz5': 9685272, 'piz6': 3343622, 'piz7': 35386737, 'chauf1': 8425027, 'chauf2': 15774577, 'chauf3': 8425042, 'chauf4': 8425050, 'chauf5': 5647593, 'chauf6': 8425057, 'verre1': 29157921, 'verre2': 2504941, 'verre3': 6288693, 'verre4': 16408, 'verre5': 6249033, 'chaise1': 11450795, 'chaise2': 33914531, 'chaise3': 8135298, 'rack1': 5018049, 'rack2': 15040068, 'rack3': 1561597, 'rack4': 7191403, 'rack5': 18977904, 'rack6': 18977894, 'rack7': 5825374, 'deco1': 10970554, 'deco2': 2306281, 'deco3': 9876597, 'deco4': 6479604, 'deco5': 16120234, 'deco6': 24279974, 'deco7': 19351562, 'deco8': 12876404, 'set1': 291767, 'set2': 735869, 'set3': 17057034, 'set4': 114974, 'set5': 14132973, 'set6': 555766, 'set7': 5727912, 'eco1': 9475305, 'eco2': 9475718, 'eco3': 4857600, 'nappe1': 50675, 'nappe2': 4639508, 'nappe3': 8112784, 'table1': 1118760, 'tente1': 1268877, 'tente2': 872831, 'tente3': 9627719, 'dess1': 1414234, 'dess2': 162688, 'cuis1': 28704740, 'cuis2': 39556646, 'reut1': 896819}.items():
    try: open(f'apercu-photos/mat2/px-{k}-{v}.jpg','wb').write(get(f'https://images.pexels.com/photos/{v}/pexels-photo-{v}.jpeg?auto=compress&cs=tinysrgb&w=600', raw=True))
    except Exception as e: print('pexels', k, e)
    time.sleep(0.5)
meta.close()
