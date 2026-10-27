"""アイランドの効果音をコードで作る（BGM は mycryptoheroes のリポジトリの曲を使う）。

  python3 scripts/island/sfx.py   → public/island/sfx/*.mp3

どれも短い合成音（正弦波・三角波・ノイズに音量の山をかけたもの）。音の高さと長さはここで決める。
ブラウザの側は src/island/p1/sfx.ts（Web Audio で先に読み込み、遅れなく鳴らす）。
"""

import os
import subprocess
import tempfile
import wave

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'island', 'sfx')


def t_(sec):
    return np.arange(int(RATE * sec)) / RATE


def env(n, attack=0.004, decay=0.12, total=None):
    """立ち上がり attack 秒、そのあと decay 秒の時定数で減る"""
    t = np.arange(n) / RATE
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(t - attack, 0) / decay)
    e = a * d
    # 最後の 5 ms はゼロへ（プチッと鳴らない）
    tail = min(n, int(RATE * 0.005))
    if tail:
        e[-tail:] *= np.linspace(1, 0, tail)
    return e


def tone(freq, sec, kind='sine', attack=0.004, decay=0.12, slide=1.0, vib=0.0):
    """freq から freq*slide へ滑る音"""
    t = t_(sec)
    f = freq * (slide ** (t / sec))
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 6 * t))
    ph = 2 * np.pi * np.cumsum(f) / RATE
    if kind == 'sine':
        w = np.sin(ph)
    elif kind == 'tri':
        w = 2 / np.pi * np.arcsin(np.sin(ph))
    elif kind == 'square':
        w = np.sign(np.sin(ph)) * 0.5
    else:
        raise ValueError(kind)
    return w * env(len(t), attack, decay)


def bell(freq, sec, decay=0.25):
    """金属っぽい鈴（倍音を少しずらして重ねる）"""
    return tone(freq, sec, decay=decay) + 0.45 * tone(freq * 2.01, sec, decay=decay * 0.6) + 0.2 * tone(freq * 3.03, sec, decay=decay * 0.4)


def noise(sec, decay=0.05, lp=0.5):
    """ざっという音（簡単なローパス：lp が小さいほどこもる）"""
    n = int(RATE * sec)
    w = np.random.default_rng(7).uniform(-1, 1, n)
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        acc += lp * (w[i] - acc)
        y[i] = acc
    return y * env(n, 0.001, decay)


def seq(parts):
    """(開始秒, 音) を重ねる"""
    end = max(s + len(x) / RATE for s, x in parts)
    out = np.zeros(int(RATE * end) + 1)
    for s, x in parts:
        i = int(RATE * s)
        out[i:i + len(x)] += x
    return out


def mix(*xs):
    """長さのちがう音を、頭をそろえて重ねる"""
    return seq([(0, x) for x in xs])


def norm(x, peak=0.85):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def note(n):
    """A4=440 を 0 とした半音の数 → 周波数"""
    return 440.0 * 2 ** (n / 12)


C5, D5, E5, F5, G5, A5, B5 = (note(k) for k in (3, 5, 7, 8, 10, 12, 14))
C6, E6, G6, C7 = note(15), note(19), note(22), note(27)

SOUNDS = {
    # ボタン・タブを押した：短く軽いクリック
    'tap': lambda: norm(mix(tone(1800, 0.04, 'tri', 0.001, 0.012), 0.4 * noise(0.03, 0.008, 0.6)), 0.5),
    # 会話の次へ：やわらかいポン
    'page': lambda: norm(tone(880, 0.09, 'sine', 0.002, 0.04, slide=1.25), 0.5),
    # 置く建物がマスを移る：コトッ
    'move': lambda: norm(mix(tone(320, 0.07, 'tri', 0.001, 0.025, slide=0.8), 0.5 * noise(0.05, 0.015, 0.25)), 0.6),
    # 建て始め：トントン（槌を 2 回）
    'place': lambda: norm(seq([(0, mix(tone(220, 0.1, 'tri', 0.001, 0.035, 0.7), 0.6 * noise(0.08, 0.02, 0.3))), (0.11, mix(tone(260, 0.12, 'tri', 0.001, 0.04, 0.7), 0.6 * noise(0.1, 0.025, 0.3)))]), 0.75),
    # お金が減る：チャリッと下がる
    'spend': lambda: norm(seq([(0, bell(G6, 0.18, 0.06)), (0.06, bell(D5 * 2, 0.22, 0.08))]), 0.55),
    # 置けない：低いブブッ
    'error': lambda: norm(seq([(0, tone(150, 0.09, 'square', 0.002, 0.05)), (0.1, tone(130, 0.12, 'square', 0.002, 0.06))]), 0.45),
    # 建物の完成：キラキラ上がる
    'done': lambda: norm(seq([(i * 0.07, bell(f, 0.5, 0.18)) for i, f in enumerate([C6, E6, G6, C7])]), 0.7),
    # 商品ができた：ポンと明るく
    'craft': lambda: norm(seq([(0, bell(E5 * 2, 0.25, 0.08)), (0.07, bell(A5 * 2, 0.3, 0.1))]), 0.55),
    # 売れた：コインのチャリン
    'sale': lambda: norm(seq([(0, bell(B5 * 2, 0.2, 0.05)), (0.05, bell(E6 * 1.5, 0.35, 0.12))]), 0.5),
    # スキル・ランクが上がった：上がる 3 音
    'levelup': lambda: norm(seq([(i * 0.09, tone(f, 0.25, 'tri', 0.003, 0.12)) for i, f in enumerate([C5 * 2, E5 * 2, G5 * 2])]), 0.6),
    # 依頼の達成：短いファンファーレ
    'mission': lambda: norm(seq([(0, tone(G5, 0.14, 'tri', 0.003, 0.08)), (0.13, tone(C6, 0.14, 'tri', 0.003, 0.08)), (0.26, tone(E6, 0.45, 'tri', 0.003, 0.25, vib=0.006))]), 0.65),
    # ミッションの小さなチェック：短く明るいピッ
    'check': lambda: norm(seq([(0, bell(A5 * 2, 0.16, 0.05)), (0.05, bell(E6, 0.2, 0.07))]), 0.5),
    # ミッションのクリア：はずむ 3 音とキラッ
    'clear': lambda: norm(seq([(0, tone(E5 * 2, 0.16, 'tri', 0.002, 0.07)), (0.09, tone(G5 * 2, 0.16, 'tri', 0.002, 0.07)), (0.18, tone(C7, 0.5, 'tri', 0.002, 0.22, vib=0.006)), (0.2, 0.5 * bell(C7 * 1.5, 0.45, 0.15))]), 0.7),
    # 月の売上報告：落ち着いた 4 音
    'report': lambda: norm(seq([(i * 0.16, tone(f, 0.6, 'tri', 0.004, 0.3)) for i, f in enumerate([C5, E5, G5, C6])]), 0.6),
    # エリア 1 位の月：はなやかなファンファーレ
    'win': lambda: norm(seq([(0, tone(C6, 0.14, 'tri', 0.003, 0.08)), (0.12, tone(C6, 0.14, 'tri', 0.003, 0.08)), (0.24, tone(C6, 0.14, 'tri', 0.003, 0.08)), (0.38, tone(G6, 0.8, 'tri', 0.003, 0.45, vib=0.008) + 0.5 * tone(E6, 0.8, 'tri', 0.003, 0.45))]), 0.7),
}


def write_mp3(name, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, f'{name}.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-codec:a', 'libmp3lame', '-b:a', '64k', out], check=True)
    os.remove(path)
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, make in SOUNDS.items():
        p = write_mp3(name, make())
        print(name, os.path.getsize(p), 'bytes')
