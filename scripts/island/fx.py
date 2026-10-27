#!/usr/bin/env python3
"""
島づくりの地面と工事の演出を作る（docs/ISLAND_MVP.md）。
  python3 scripts/island/fx.py
public/island/tiles/（草地・砂浜・海 2 コマ）と public/island/fx/（更地・足場 3〜5 段・キラキラの奥と手前）を書く。
足場は 1 段ごとに「柱 → 横の管と筋交い → 足場板」の 3 コマ。キラキラは 18 コマ（70ms）。
"""
import os
import random
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.abspath(os.path.join(HERE,'..','..'))
OUT=os.path.join(ROOT,'public','island','tiles')+'/'
H=Image.open(os.path.join(HERE,'bases','house_1x1.png')).convert('RGBA')
CX,CY,HW,HH=100,114,100,55          # 敷地の上面（200×200 のキャンバス）
def dia(x,y,s=1.0):                   # ひし形の内側か（1 以下なら内側）
    return abs(x+0.5-CX)/(HW*s)+abs(y+0.5-CY)/(HH*s)

# ---------------------------------------------------------------- 更地
def empty_lot():
    src=H; im=Image.new('RGBA',src.size,(0,0,0,0)); p=im.load(); s=src.load()
    rnd=random.Random(3)
    dirt=[(156,118,78,255),(146,108,70,255),(166,128,86,255)]
    for y in range(src.height):
        for x in range(src.width):
            d=dia(x,y)
            if d<=0.9:
                c=rnd.choice(dirt) if rnd.random()<0.25 else dirt[0]
                if d>0.86: c=(118,86,56,255)            # 縁の影
                p[x,y]=c
            elif d<=1.0:                                  # 歩道：手前はそのまま、奥は手前を上下に映す
                p[x,y]=s[x,y] if y>=CY else s[x,2*CY-y]
            elif y>CY and s[x,y][3]>0 and abs(x+0.5-CX)<=HW:  # 手前の側面
                p[x,y]=s[x,y]
    # 小石
    for _ in range(14):
        x=rnd.randint(40,160); y=rnd.randint(95,135)
        if dia(x,y)<0.8: p[x,y]=(110,80,52,255); p[x+1,y]=(190,160,120,255)
    return im
LOT=empty_lot()

# ---------------------------------------------------------------- 足場
OL=(38,34,36,255)
PL,PM=(206,210,218,255),(138,142,154,255)
LL,LD=(184,188,198,255),(98,102,114,255)
BL,BM,BD=(218,172,108,255),(178,130,76,255),(96,62,38,255)
def put(im,x,y,c):
    if 0<=x<im.width and 0<=y<im.height: im.putpixel((x,y),c)
def line(im,a,b,cols):                # cols＝上から順の色（太さ）
    (x0,y0),(x1,y1)=a,b
    n=max(abs(x1-x0),abs(y1-y0),1)
    for i in range(n+1):
        x=round(x0+(x1-x0)*i/n); y=round(y0+(y1-y0)*i/n)
        for k,c in enumerate(cols): put(im,x,y+k,c)
def pole(im,base,h):
    x,y=base
    for yy in range(y-h,y+1):
        put(im,x-1,yy,OL); put(im,x,yy,PL); put(im,x+1,yy,PM); put(im,x+2,yy,OL)
    for xx in range(x-2,x+4): put(im,xx,y+1,OL)
    put(im,x,y-h-1,OL); put(im,x+1,y-h-1,OL)
def up(p,h): return (p[0],p[1]-h)

S=0.58
L=(round(CX-HW*S),CY); T=(CX,round(CY-HH*S)); R=(round(CX+HW*S),CY); B=(CX,round(CY+HH*S))
mid=lambda a,b:((a[0]+b[0])//2,(a[1]+b[1])//2)
BACK=[(L,T),(T,R)]; FRONT=[(L,B),(B,R)]
def scaffold(levels,lh,stage,pad=0):
    """stage＝何段目まで（小数：.33 は柱だけ、.66 は横の管まで、整数で板まで）。pad＝上の空き（高層用）"""
    im=Image.new('RGBA',(LOT.width,LOT.height+pad),(0,0,0,0))
    sh=lambda p:(p[0],p[1]+pad)
    L_,T_,R_,B_=sh(L),sh(T),sh(R),sh(B)
    BACK_=[(L_,T_),(T_,R_)]; FRONT_=[(L_,B_),(B_,R_)]
    full=int(stage); part=stage-full
    def ph():                                  # 柱の高さ
        k=full+(1 if part>0 else 0)
        return min(k,levels)*lh+(4 if k<levels else 8) if k>0 else 2
    def tier(edges,k,what):
        h=k*lh
        for a,b in edges:
            if 'ledger' in what: line(im,up(a,h),up(b,h),[OL,LL,LD,OL])
            if 'brace' in what: line(im,up(a,h-lh+4),up(mid(a,b),h-3),[PM,OL]); line(im,up(mid(a,b),h-lh+4),up(b,h-3),[PM,OL])
            if 'plank' in what: line(im,up(a,h-1),up(b,h-1),[OL,BL,BL,BM,BD,OL])
    def tiers(edges):
        for k in range(1,full+1): tier(edges,k,('ledger','brace','plank'))
        if part>0.5 and full<levels: tier(edges,full+1,('ledger','brace'))
    h=ph()
    tiers(BACK_)
    for p in [T_,mid(L_,T_),mid(T_,R_)]: pole(im,p,h)
    for p in [L_,R_]: pole(im,p,h)
    tiers(FRONT_)
    for p in [mid(L_,B_),mid(B_,R_),B_]: pole(im,p,h)
    return im

# ---------------------------------------------------------------- キラキラ
def edge_pts():
    c=[(CX-HW+2,CY),(CX,CY-HH+1),(CX+HW-2,CY),(CX,CY+HH-1)]
    return [(c[0],c[1],'back'),(c[1],c[2],'back'),(c[0],c[3],'front'),(c[3],c[2],'front')]
SPARK=[[(0,0)],[(0,0),(-1,0),(1,0),(0,-1),(0,1)],[(0,0),(-1,0),(1,0),(0,-1),(0,1),(-2,0),(2,0),(0,-2),(0,2)]]
SPARK.append(SPARK[2]+[(-3,0),(3,0),(0,-3),(0,3),(-1,-1),(1,-1),(-1,1),(1,1)])
SHAPE=[0,1,2,3,3,2,2,1,1,0]
def sparkles(nframes=18,seed=7):
    rnd=random.Random(seed); parts=[]
    for a,b,side in edge_pts():
        for i in range(12):
            t=(i+rnd.random())/12
            parts.append(dict(x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,start=rnd.randint(0,6),v=rnd.uniform(2.5,4.5),side=side))
    frames=[]
    for f in range(nframes):
        lay={'back':Image.new('RGBA',LOT.size,(0,0,0,0)),'front':Image.new('RGBA',LOT.size,(0,0,0,0))}
        if f<2:                                              # 縁が白く光る
            for a,b,side in edge_pts():
                line(lay[side],a,b,[(255,255,255,255)])
        for q in parts:
            age=f-q['start']
            if 0<=age<len(SHAPE):
                x=round(q['x']); y=round(q['y']-q['v']*age)
                col=(255,255,255,255) if age<7 else (214,228,255,255)
                pts=SPARK[SHAPE[age]]
                for dx,dy in pts:
                    for ex,ey in ((1,0),(-1,0),(0,1),(0,-1)):
                        if (dx+ex,dy+ey) not in pts: put(lay[q['side']],x+dx+ex,y+dy+ey,(150,186,236,255))
                for dx,dy in pts: put(lay[q['side']],x+dx,y+dy,col)
        frames.append(lay)
    return frames

def over(*layers):
    im=Image.new('RGBA',layers[0].size,(0,0,0,0))
    for l in layers: im.alpha_composite(l)
    return im

def padimg(im,pad):
    c=Image.new('RGBA',(im.width,im.height+pad),(0,0,0,0)); c.alpha_composite(im,(0,pad)); return c

def exec_tiles():
    def tdia(x,y,cy=CY): return abs(x+0.5-CX)/HW+abs(y+0.5-cy)/HH
    def land(top,dither,side_l,side_r,edge,seed):
        im=Image.new('RGBA',(200,200),(0,0,0,0)); p=im.load(); r=random.Random(seed)
        for y in range(200):
            for x in range(200):
                d=tdia(x,y)
                if d<=1:
                    c=top
                    if r.random()<0.18: c=r.choice(dither)
                    if d>0.97: c=edge
                    p[x,y]=c
                elif y>CY and abs(x+0.5-CX)<=HW:
                    # 手前の側面（厚み 6）
                    yb=CY+HH*(1-abs(x+0.5-CX)/HW)
                    if y<=yb+6: p[x,y]=side_r if x>=CX else side_l
                    if yb+6<y<=yb+7: p[x,y]=(38,34,36,255)
        return im
    G=(110,178,74,255)
    land(G,[(98,164,66,255),(122,190,84,255),(104,170,70,255)],(92,70,48,255),(118,90,60,255),(88,150,60,255),1).save(OUT+'grass.png')
    land((226,206,150,255),[(214,192,136,255),(236,218,166,255)],(170,146,100,255),(196,172,122,255),(204,182,128,255),2).save(OUT+'sand.png')
    for f in range(2):
        im=Image.new('RGBA',(200,200),(0,0,0,0)); p=im.load(); r=random.Random(10)
        waves=[(r.randint(10,190),r.randint(70,170)) for _ in range(26)]
        for y in range(200):
            for x in range(200):
                if tdia(x,y,CY+6)<=1: p[x,y]=(58,128,190,255) if (x//2+y)%9 else (64,136,198,255)
        for wx,wy in waves:
            wx2=wx+(4 if f else 0)
            for k in range(6):
                x=wx2+k; y=wy
                if 0<=x<200 and tdia(x,y,CY+6)<0.92: p[x,y]=(150,200,236,255)
        im.save(OUT+f'water{f}.png')

if __name__ == '__main__':
    FX=os.path.join(ROOT,'public','island','fx')+'/'
    os.makedirs(FX,exist_ok=True); os.makedirs(OUT,exist_ok=True)
    LOT.save(FX+'lot.png')
    for n,lh,pad in ((3,20,0),(4,22,80),(5,24,80)):
        st=[k+p for k in range(n) for p in (0.33,0.66,1.0)]
        sh=Image.new('RGBA',(200*len(st),200+pad),(0,0,0,0))
        for i,s_ in enumerate(st): sh.alpha_composite(scaffold(n,lh,s_,pad),(i*200,0))
        sh.save(FX+f'scaffold{n}.png')
    exec_tiles()
    sp=sparkles()
    for side in ('back','front'):
        sh=Image.new('RGBA',(200*len(sp),200),(0,0,0,0))
        for i,l in enumerate(sp): sh.alpha_composite(l[side],(i*200,0))
        sh.save(FX+f'sparkle_{side}.png')


# ---------------------------------------------------------------- 道路（フェーズ 1）
# 隣のマスに道路があるかの 4 ビット（1:-j 右上, 2:+i 右下, 4:+j 左下, 8:-i 左上）ごとに 1 枚。
# 舗装の上に、つながる向きへ中央の破線、つながらない辺に縁石を描く。高さは敷地と同じ（側面 6）。
def roads():
    out = os.path.join(ROOT, 'public', 'island', 'tiles') + '/'
    mids = {1: (150, 86.5), 2: (150, 141.5), 4: (50, 141.5), 8: (50, 86.5)}
    edges = {1: ((100, 59), (200, 114)), 2: ((200, 114), (100, 169)), 4: ((100, 169), (0, 114)), 8: ((0, 114), (100, 59))}
    for mask in range(16):
        im = Image.new('RGBA', (200, 200), (0, 0, 0, 0))
        p = im.load()
        r = random.Random(100 + mask)
        for y in range(200):
            for x in range(200):
                d = abs(x + 0.5 - 100) / 100 + abs(y + 0.5 - 114) / 55
                if d <= 1:
                    c = (86, 88, 98, 255) if r.random() > 0.12 else (78, 80, 90, 255)
                    p[x, y] = c
                elif y > 114 and abs(x + 0.5 - 100) <= 100:
                    yb = 114 + 55 * (1 - abs(x + 0.5 - 100) / 100)
                    if y <= yb + 6:
                        p[x, y] = (70, 72, 80, 255) if x < 100 else (96, 98, 108, 255)
                    elif y <= yb + 7:
                        p[x, y] = (38, 34, 36, 255)
        # 縁石：つながらない辺の内側に明るい帯
        for bit, (a, b) in edges.items():
            if mask & bit:
                continue
            for k in range(0, 101):
                t = k / 100
                x = a[0] + (b[0] - a[0]) * t
                y = a[1] + (b[1] - a[1]) * t
                for dd in range(1, 6):
                    # 辺から中心へ寄せる
                    xx = round(x + (100 - x) * dd / 55 * 0.55 * (100 / 100))
                    yy = round(y + (114 - y) * dd / 55)
                    if 0 <= xx < 200 and 0 <= yy < 200 and p[xx, yy][3]:
                        p[xx, yy] = (176, 176, 184, 255) if dd < 5 else (120, 120, 130, 255)
        # 中央の破線
        for bit, (mx, my) in mids.items():
            if not mask & bit:
                continue
            for k in range(0, 56):
                t = k / 55
                x = round(100 + (mx - 100) * t)
                y = round(114 + (my - 114) * t)
                if (k // 5) % 2 == 0:
                    for dx in (0, 1):
                        p[x + dx, y] = (236, 214, 120, 255)
        im.save(out + f'road{mask}.png')


# ---------------------------------------------------------------- 素材のアイコン（24×24）
def items():
    out = os.path.join(ROOT, 'public', 'island', 'items') + '/'
    os.makedirs(out, exist_ok=True)
    OL = (38, 34, 36, 255)

    def icon(name, draw):
        im = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
        draw(im.load())
        # 外周に線
        src = im.copy().load()
        for y in range(24):
            for x in range(24):
                if src[x, y][3] == 0 and any(0 <= x + dx < 24 and 0 <= y + dy < 24 and src[x + dx, y + dy][3] and src[x + dx, y + dy] != OL for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    im.putpixel((x, y), OL)
        im.save(out + name + '.png')

    def rect(p, x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                p[x, y] = c

    def iron(p):  # インゴット
        for y in range(9, 17):
            w = 4 if y < 11 else 2
            rect(p, 3 + (11 - min(y, 11)), y, 21 - (11 - min(y, 11)), y + 1, (168, 172, 184, 255) if y < 11 else (128, 132, 146, 255))
        rect(p, 5, 9, 19, 11, (204, 208, 218, 255))

    def wood(p):  # 丸太 2 本
        for cx, cy in ((8, 13), (16, 13)):
            for y in range(24):
                for x in range(24):
                    if (x - cx) ** 2 + (y - cy) ** 2 <= 20:
                        p[x, y] = (150, 98, 54, 255) if (x - cx) ** 2 + (y - cy) ** 2 > 8 else (214, 168, 108, 255)
        rect(p, 8, 7, 16, 9, (120, 76, 40, 255))

    def clay(p):
        for y in range(24):
            for x in range(24):
                if ((x - 12) / 9) ** 2 + ((y - 14) / 6) ** 2 <= 1:
                    p[x, y] = (196, 108, 70, 255) if y > 12 else (222, 140, 96, 255)

    def glass(p):
        rect(p, 6, 4, 18, 20, (150, 210, 236, 255))
        rect(p, 8, 6, 10, 12, (232, 248, 255, 255))
        rect(p, 6, 12, 18, 13, (110, 170, 200, 255))

    def cloth(p):
        rect(p, 4, 8, 20, 18, (150, 96, 190, 255))
        rect(p, 4, 8, 20, 10, (190, 140, 226, 255))
        rect(p, 4, 14, 20, 15, (120, 70, 160, 255))

    def paper(p):
        rect(p, 6, 5, 18, 19, (246, 240, 222, 255))
        for y in (8, 11, 14):
            rect(p, 8, y, 16, y + 1, (180, 170, 150, 255))

    def gem(p):
        pts = [(12, 4), (19, 10), (12, 20), (5, 10)]
        for y in range(24):
            for x in range(24):
                if abs(x - 12) / 7 + abs(y - 11) / 8 <= 1:
                    p[x, y] = (210, 40, 70, 255) if x >= 12 else (240, 90, 110, 255)
        p[10, 7] = (255, 220, 230, 255)

    for n, f in (('iron', iron), ('wood', wood), ('clay', clay), ('glass', glass), ('cloth', cloth), ('paper', paper), ('gem', gem)):
        icon(n, f)


if __name__ == '__main__' and os.environ.get('ISLAND_P1', '1') == '1':
    roads()
    items()
