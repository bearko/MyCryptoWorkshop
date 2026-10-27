#!/usr/bin/env python3
"""
倉庫（warehouse）の絵をコードで描く（PixelLab の生成回数が尽きているときの代わり。docs/ISLAND_PHASE1.md）。

  python3 scripts/island/warehouse.py

土台は scripts/island/bases/empty_1x1.png（タイル規格 200×200・上面のひし形 200×116・基準点は下から 31px）。
煉瓦の壁・黒い切妻屋根・正面（右下の壁）に灰色のシャッター。背面（lu）はシャッターの代わりに小窓。
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'island', 'b', 'warehouse')

INK = (29, 26, 36, 255)
BRICK_L = (118, 62, 46, 255)   # 影の壁（左下を向く）
BRICK_R = (156, 84, 58, 255)   # 光の壁（右下を向く）
MORTAR_L = (88, 48, 38, 255)
MORTAR_R = (122, 66, 48, 255)
ROOF_A = (58, 52, 60, 255)
ROOF_B = (84, 76, 86, 255)
ROOF_LINE = (40, 36, 44, 255)
SHUTTER = (142, 146, 154, 255)
SHUTTER_D = (104, 108, 118, 255)
TRIM = (196, 160, 112, 255)
CRATE = (190, 140, 84, 255)
CRATE_D = (140, 98, 56, 255)

# 上面のひし形の中心と、建物の足もと（ひし形を小さくしたもの）
CX, CY = 100, 117
HW, HH = 64, 37      # 足もとの半分の幅・高さ
WALL = 50            # 壁の高さ
RIDGE = 26           # 切妻の高さ


def pt(x, y):
    return (round(x), round(y))


def shade_wall(img, poly, base_a, base_b, color, mortar, slope):
    """壁を塗って、地面と平行な目地（4px ごと）とずらした縦の目地を入れる"""
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    px = img.load()
    m = mask.load()
    (ax, ay) = base_a
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            if not m[x, y]:
                continue
            base_y = ay + (x - ax) * slope   # この列の壁の下の線
            v = base_y - y                   # 下からの高さ
            row = int(v // 4)
            c = color
            if int(v) % 4 == 0:
                c = mortar
            else:
                off = 0 if row % 2 == 0 else 4
                if (x + off) % 8 == 0:
                    c = mortar
            px[x, y] = c


def draw(back=False):
    img = Image.open(os.path.join(HERE, 'bases', 'empty_1x1.png')).convert('RGBA')
    pave(img)
    d = ImageDraw.Draw(img)
    L = (CX - HW, CY)
    B = (CX, CY + HH)
    R = (CX + HW, CY)
    T = (CX, CY - HH)
    up = lambda p, h=WALL: (p[0], p[1] - h)

    # 影（建物の右後ろに少し）
    d.polygon([pt(*B), pt(*R), pt(R[0] + 6, R[1] - 3), pt(B[0] + 6, B[1] - 3)], fill=(0, 0, 0, 40))

    # 壁：左下（影）・右下（光）
    left_wall = [pt(*L), pt(*B), pt(*up(B)), pt(*up(L))]
    right_wall = [pt(*B), pt(*R), pt(*up(R)), pt(*up(B))]
    # 右下の壁の上の切妻（三角）
    apex = ((B[0] + R[0]) / 2, (B[1] + R[1]) / 2 - WALL - RIDGE)
    gable = [pt(*up(B)), pt(*up(R)), pt(*apex)]
    shade_wall(img, left_wall, L, B, BRICK_L, MORTAR_L, (B[1] - L[1]) / (B[0] - L[0]))
    shade_wall(img, right_wall + [], B, R, BRICK_R, MORTAR_R, (R[1] - B[1]) / (R[0] - B[0]))
    shade_wall(img, gable, up(B), up(R), BRICK_R, MORTAR_R, (R[1] - B[1]) / (R[0] - B[0]))
    d = ImageDraw.Draw(img)

    # 屋根：棟は切妻の頂点から左上（L−B の向き）へ。軒を少し出す
    dx, dy = L[0] - B[0], L[1] - B[1]
    apex2 = (apex[0] + dx, apex[1] + dy)
    o = 4  # 軒の出
    ub, ur, ul, ut = up(B), up(R), up(L), up(T)
    left_roof = [pt(ub[0] - o * 0.5, ub[1] + o), pt(apex[0], apex[1] - 1), pt(apex2[0], apex2[1] - 1), pt(ul[0] - o, ul[1] + o * 0.5)]
    right_roof = [pt(apex[0], apex[1] - 1), pt(ur[0] + o, ur[1] + o * 0.5), pt(ut[0] + o * 0.5, ut[1] + o * 0.2), pt(apex2[0], apex2[1] - 1)]
    d.polygon(right_roof, fill=ROOF_B, outline=INK)
    d.polygon(left_roof, fill=ROOF_A, outline=INK)
    # 屋根の継ぎ目（棟と平行）
    for k in range(1, 5):
        f = k / 5
        a = (ub[0] - o * 0.5 + (apex[0] - ub[0] + o * 0.5) * f, ub[1] + o + (apex[1] - ub[1] - o) * f)
        d.line([pt(*a), pt(a[0] + dx, a[1] + dy)], fill=ROOF_LINE)
    for k in range(1, 4):
        f = k / 4
        a = (apex[0] + (ur[0] + o - apex[0]) * f, apex[1] + (ur[1] + o * 0.5 - apex[1]) * f)
        d.line([pt(*a), pt(a[0] + dx, a[1] + dy)], fill=(70, 64, 74, 255))
    # 棟と軒の線
    d.line([pt(apex[0], apex[1] - 1), pt(apex2[0], apex2[1] - 1)], fill=(110, 100, 112, 255), width=2)
    d.line([pt(*left_roof[0]), pt(*left_roof[3])], fill=INK)
    # 天窓
    sk = (apex[0] + dx * 0.35 - 10, apex[1] + dy * 0.35 + 12)
    d.polygon([pt(*sk), pt(sk[0] + 14, sk[1] - 8), pt(sk[0] + 24, sk[1] - 2), pt(sk[0] + 10, sk[1] + 6)], fill=(120, 150, 170, 255), outline=INK)

    # 壁の輪郭と、柱・軒の飾り
    d.line([pt(*L), pt(*B), pt(*R)], fill=INK)
    d.line([pt(*L), pt(*up(L))], fill=INK)
    d.line([pt(*R), pt(*up(R))], fill=INK)
    d.line([pt(*B), pt(*up(B))], fill=TRIM, width=2)
    d.line([pt(*up(L)), pt(*up(B)), pt(*up(R))], fill=TRIM)

    t = lambda f, h: (B[0] + (R[0] - B[0]) * f, B[1] + (R[1] - B[1]) * f - h)  # 右下の壁の上の点
    s = lambda f, h: (L[0] + (B[0] - L[0]) * f, L[1] + (B[1] - L[1]) * f - h)  # 左下の壁の上の点
    if not back:
        # 正面：シャッター
        door = [pt(*t(0.22, 0)), pt(*t(0.78, 0)), pt(*t(0.78, 34)), pt(*t(0.22, 34))]
        d.polygon(door, fill=SHUTTER, outline=INK)
        for k in range(3, 34, 4):
            d.line([pt(*t(0.23, k)), pt(*t(0.77, k))], fill=SHUTTER_D)
        d.line([pt(*t(0.2, 36)), pt(*t(0.8, 36))], fill=TRIM, width=2)
        # 看板（箱の絵）
        sg = t(0.5, 44)
        d.rectangle([sg[0] - 6, sg[1] - 6, sg[0] + 6, sg[1] + 3], fill=TRIM, outline=INK)
        d.rectangle([sg[0] - 3, sg[1] - 4, sg[0] + 3, sg[1] + 1], fill=CRATE_D)
        # 左の壁に小窓 2 つ
        for f in (0.3, 0.7):
            w = s(f, 30)
            d.polygon([pt(w[0] - 5, w[1] - 3), pt(w[0] + 5, w[1] + 3), pt(w[0] + 5, w[1] - 7), pt(w[0] - 5, w[1] - 13)], fill=(70, 96, 120, 255), outline=INK)
        # 積んだ木箱（左手前）
        for (bx, by, h) in ((L[0] + 22, L[1] + 18, 0), (L[0] + 30, L[1] + 23, 0), (L[0] + 26, L[1] + 20, 9)):
            box(d, bx, by - h)
    else:
        # 背面：小さな扉と窓
        dr = [pt(*t(0.4, 0)), pt(*t(0.6, 0)), pt(*t(0.6, 22)), pt(*t(0.4, 22))]
        d.polygon(dr, fill=(96, 64, 44, 255), outline=INK)
        for f in (0.25, 0.75):
            w = t(f, 34)
            d.polygon([pt(w[0] - 5, w[1] + 3), pt(w[0] + 5, w[1] - 3), pt(w[0] + 5, w[1] - 13), pt(w[0] - 5, w[1] - 7)], fill=(70, 96, 120, 255), outline=INK)
        for f in (0.5,):
            w = s(f, 30)
            d.polygon([pt(w[0] - 5, w[1] - 3), pt(w[0] + 5, w[1] + 3), pt(w[0] + 5, w[1] - 7), pt(w[0] - 5, w[1] - 13)], fill=(70, 96, 120, 255), outline=INK)
    return img


def pave(img):
    """土の上面を石畳に：等角の目地で区切った石を、少しずつ色を変えて敷く"""
    import random
    rnd = random.Random(7)
    k = 0.9
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon([(CX - 100 * k, CY), (CX, CY - 58 * k), (CX + 100 * k, CY), (CX, CY + 58 * k)], fill=255)
    m = mask.load()
    px = img.load()
    shades = {}
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            if not m[x, y]:
                continue
            # 等角の座標（u：右下へ、v：左下へ）。石 1 枚は 12×12
            u = (x - CX) / 100 * 58 + (y - CY)
            v = (CX - x) / 100 * 58 + (y - CY)
            iu, iv = int(u // 12), int(v // 12)
            if (iu, iv) not in shades:
                shades[(iu, iv)] = rnd.randint(-10, 10)
            g = shades[(iu, iv)]
            if u % 12 < 1.2 or v % 12 < 1.2:
                px[x, y] = (104, 100, 98, 255)
            else:
                px[x, y] = (150 + g, 146 + g, 140 + g, 255)


def box(d, x, y):
    """小さな木箱（等角）"""
    s = 6
    top = [(x, y - s), (x + s, y - s // 2 - s // 2), (x, y - s + s), (x - s, y - s // 2 - s // 2)]
    d.polygon([(x - s, y - 3), (x, y), (x, y + 6), (x - s, y + 3)], fill=CRATE_D, outline=INK)
    d.polygon([(x, y), (x + s, y - 3), (x + s, y + 3), (x, y + 6)], fill=CRATE, outline=INK)
    d.polygon([(x - s, y - 3), (x, y - 6), (x + s, y - 3), (x, y)], fill=(214, 168, 108, 255), outline=INK)
    del top


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    draw(False).save(os.path.join(OUT, 'rd.png'))
    draw(True).save(os.path.join(OUT, 'lu.png'))
    print('ok', OUT)
