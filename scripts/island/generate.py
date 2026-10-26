#!/usr/bin/env python3
"""
島づくりの建物の絵を PixelLab の API で作る（docs/ISLAND_MVP.md「絵の作り方」）。

  PIXELLAB_API_KEY=... python3 scripts/island/generate.py cafe,station   # 指定した建物だけ
  PIXELLAB_API_KEY=... python3 scripts/island/generate.py all            # まだ絵の無い建物すべて

1 つの建物につき、正面 1 回・背面 1 回（左右対称のものは正面だけ）。どちらも 2 案が返るので、
敷地の縁が規格に合う方を選び、ずれていれば平行移動で合わせて public/island/b/<id>/ に置く。
残りの生成回数が MIN_BAL を切ったら新しい建物は始めない。
"""
import base64, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DST = os.path.join(ROOT, 'public', 'island', 'b')
WORK = os.environ.get('ISLAND_WORK', '/tmp/island-gen')
KEY = os.environ.get('PIXELLAB_API_KEY', '')
API = 'https://api.pixellab.ai/v2'
MIN_BAL = int(os.environ.get('MIN_BAL', '60'))

END = ' Main entrance on the bottom-right side. Keep the gray stone sidewalk border, the tile shape and size unchanged. Light from the top right. No text or letters.'
TALL = ' The building rises into the empty space above.'
BACK_END = ' Keep the same size, colors, outline and lighting, and the gray stone sidewalk border unchanged.'
BASES = {
    'house': ('house_1x1.png', 200, 200),
    '1': ('empty_1x1.png', 200, 200),
    '1T': ('empty_1x1_tall.png', 200, 280),
    '2': ('empty_2x1.png', 300, 255),
    '2T': ('empty_2x1_tall.png', 300, 340),
}

# ---------------------------------------------------------------- API

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:500]}

def b64(path):
    return {'type': 'base64', 'base64': base64.b64encode(open(path, 'rb').read()).decode(), 'format': 'png'}

def images_in(o, out):
    if isinstance(o, dict):
        if o.get('type') == 'base64' and 'base64' in o:
            out.append(base64.b64decode(o['base64']))
        else:
            for v in o.values():
                images_in(v, out)
    elif isinstance(o, list):
        for v in o:
            images_in(v, out)
    return out

def edit(img, desc, prefix, w, h):
    """Edit images (Pro)。返ってきた案を prefix_0.png, prefix_1.png に保存して、そのパスを返す"""
    r = call('POST', '/edit-images-v2', {'method': 'edit_with_text', 'edit_images': [{'image': b64(img), 'width': w, 'height': h}],
                                         'image_size': {'width': w, 'height': h}, 'description': desc, 'no_background': True})
    job = r.get('background_job_id')
    if not job:
        return []
    for _ in range(150):
        res = call('GET', f'/background-jobs/{job}')
        if res.get('status') == 'completed':
            paths = []
            for k, data in enumerate(images_in(res.get('last_response', res), [])):
                p = f'{prefix}_{k}.png'
                open(p, 'wb').write(data)
                paths.append(p)
            return paths
        if res.get('status') in ('failed', 'error', 'cancelled'):
            return []
        time.sleep(4)
    return []

# ---------------------------------------------------------------- 敷地の縁の寸法

def profile(im):
    a = im.split()[3]
    return [max([y for y in range(im.height) if a.getpixel((x, y)) > 0], default=-1) for x in range(im.width)]

def align(src, base, out):
    """敷地の下の縁が土台と重なるように平行移動する。縁の形が崩れていれば False"""
    im = Image.open(src).convert('RGBA')
    q = profile(Image.open(base).convert('RGBA'))
    p = profile(im)
    w = im.width
    best = None
    for dx in range(-4, 5):
        for dy in range(-24, 25):
            bad = 0
            for x in range(4, w - 4):
                sx = x - dx
                v = p[sx] + dy if 0 <= sx < w and p[sx] >= 0 else -1
                if abs(v - q[x]) > 1:
                    bad += 1
            if best is None or (bad, abs(dx)) < best[:2]:
                best = (bad, abs(dx), dx, dy)
    if best[0] > 4:
        return False
    t = Image.new('RGBA', im.size, (0, 0, 0, 0))
    t.paste(im, (best[2], best[3]), im)
    t.save(out)
    return True

# ---------------------------------------------------------------- 1 つの建物

def prompt(it):
    b = it['base']
    if it['cat'] == '住宅' and b == '1':
        return 'house', f"Replace the house and the lawn with {it['desc']}." + END
    if b.startswith('2'):
        s = f"On this empty two-tile lot, build {it['desc']}, as one building filling the whole lot. No bare soil should remain on the lot."
    else:
        s = f"On this empty lot, build {it['desc']}. No bare soil should remain on the lot."
    return b, s + (TALL if b.endswith('T') else '') + END

def run(it):
    d = os.path.join(WORK, it['id'])
    os.makedirs(d, exist_ok=True)
    rd, lu = os.path.join(d, 'rd.png'), os.path.join(d, 'lu.png')
    key, p1 = prompt(it)
    name, w, h = BASES[key]
    base = os.path.join(HERE, 'bases', name)
    if not os.path.exists(rd):
        bal = call('GET', '/balance').get('subscription', {}).get('generations', 0)
        if bal < MIN_BAL:
            return 'stop (budget)'
        if not any(align(p, base, rd) for p in edit(base, p1, os.path.join(d, 'f'), w, h)):
            return 'front NG'
    if not os.path.exists(lu):
        if it['back']:
            p2 = f"Show the back side of the same building: {it['back']}." + BACK_END
            if not any(align(p, base, lu) for p in edit(rd, p2, os.path.join(d, 'b'), w, h)):
                return 'back NG'
        else:
            Image.open(rd).save(lu)
    os.makedirs(os.path.join(DST, it['id']), exist_ok=True)
    for k, p in (('rd', rd), ('lu', lu)):
        Image.open(p).convert('RGBA').save(os.path.join(DST, it['id'], f'{k}.png'), optimize=True)
    return 'ok'

if __name__ == '__main__':
    if not KEY:
        sys.exit('PIXELLAB_API_KEY を設定してください')
    items = json.load(open(os.path.join(HERE, 'buildings.json'), encoding='utf-8'))
    want = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if want == 'all':
        items = [x for x in items if not os.path.exists(os.path.join(DST, x['id'], 'lu.png'))]
    else:
        ids = want.split(',')
        items = [x for x in items if x['id'] in ids]
    with ThreadPoolExecutor(4) as ex:
        for it, res in zip(items, ex.map(run, items)):
            print(it['id'], res, flush=True)
