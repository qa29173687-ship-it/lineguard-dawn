"""原創音效產生器（全部程式合成，不使用任何既有旋律或取樣）。
- 大多數音效用 numpy 直接合成（噪音＋濾波、振盪器滑音、FM 鐘聲、Karplus-Strong 撥弦）
- 號角／銅管／定音鼓類（夜晚號角、進化號角曲、首領登場）用 FluidSynth + FluidR3_GM 合成後再疊上合成音色
- 單聲道 44.1 kHz，峰值正規化（各音效有相對音量表），輸出 OGG（Vorbis q3）＋ MP3（96 kbps）到 assets/audio/sfx/
- 預覽複本：/workspace/sfx_preview/*.mp3
執行：/workspace/.artenv/bin/python tools/sfx/make_sfx.py [名稱 ...]"""
import os, sys, subprocess, json, shutil
import numpy as np
import soundfile as sf
import pretty_midi as pm
from scipy.signal import butter, sosfilt, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio', 'sfx')
PREV = '/workspace/sfx_preview'
SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
SR = 44100
rng = np.random.default_rng(11)

# ---------------- 基本元件 ----------------
def T(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.standard_normal(int(d * SR))
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [max(20, lo), min(SR / 2 - 200, hi)], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, min(SR / 2 - 200, f), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def env(d, a=0.005, decay=0.1, hold=0.0):
    t = T(d); e = np.where(t < a, t / max(a, 1e-6), np.exp(-np.maximum(0, t - a - hold) / decay))
    return e
def adsr(d, a, s_lvl, r):
    t = T(d); e = np.ones_like(t) * s_lvl
    e[t < a] = t[t < a] / a
    rel = t > d - r; e[rel] *= np.linspace(1, 0, rel.sum())
    return e
def sweep_osc(f0, f1, d, kind='sine', curve='exp', ph=0):
    t = T(d); k = t / d
    f = f0 * (f1 / f0) ** k if curve == 'exp' else f0 + (f1 - f0) * k
    p = 2 * np.pi * np.cumsum(f) / SR + ph
    if kind == 'sine': return np.sin(p)
    if kind == 'saw': return 2 * ((p / (2 * np.pi)) % 1) - 1
    if kind == 'square': return np.sign(np.sin(p))
    if kind == 'tri': return 2 * np.abs(2 * ((p / (2 * np.pi)) % 1) - 1) - 1
def osc_f(f, kind='sine'):
    p = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'saw': return 2 * ((p / (2 * np.pi)) % 1) - 1
    if kind == 'square': return np.sign(np.sin(p))
    return np.sin(p)
def bell(f, d, partials=((1, 1), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12)), decay=0.6):
    t = T(d); y = np.zeros_like(t)
    for r, a in partials: y += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay / (0.6 + r * 0.4)))
    return y * np.minimum(1, t / 0.002)
def pluck(f, d, damp=0.996, bright=0.5):
    """Karplus-Strong 撥弦"""
    N = int(SR / f); buf = rng.uniform(-1, 1, N); buf = lp(buf, 2000 + 8000 * bright)
    out = np.zeros(int(d * SR)); i = 0
    for n in range(len(out)):
        out[n] = buf[i]; nx = (i + 1) % N
        buf[i] = damp * 0.5 * (buf[i] + buf[nx]); i = nx
    return out
def place(dst, src, at, g=1.0):
    i = int(at * SR); n = min(len(src), len(dst) - i)
    if n > 0: dst[i:i + n] += src[:n] * g
    return dst
def buf(d): return np.zeros(int(d * SR))
def fade_out(x, d=0.02):
    n = min(len(x), int(d * SR)); x[-n:] *= np.linspace(1, 0, n); return x
def formant(x, fs, bw=1.0):
    y = np.zeros_like(x)
    for f, a in fs: y += a * bp(x, f / (1 + 0.15 * bw), f * (1 + 0.15 * bw))
    return y
def reverb(x, wet=0.25, size=0.5):
    """簡易殘響：幾條梳狀延遲（不用外部插件）"""
    out = x.copy(); L = len(x)
    pad = np.concatenate([x, np.zeros(int(SR * (0.4 + size)))])
    out = pad.copy()
    for dly, g in ((0.0297, 0.7), (0.0371, 0.66), (0.0411, 0.63), (0.0437, 0.6)):
        dd = int(dly * SR * (0.6 + size)); y = pad.copy()
        for k in range(1, 12):
            s = dd * k
            if s >= len(pad): break
            y[s:] += pad[:-s] * (g ** k)
        out += wet * 0.25 * lp(y, 5000)
    return out

def fluid(notes, dur, programs, drum_notes=(), gain=0.8, reverb_lvl=0.6):
    """notes: [(樂器名, 音高, 開始秒, 長度, 力度)]；programs: {樂器名: GM 音色編號}"""
    mid = pm.PrettyMIDI(initial_tempo=120)
    ins = {}
    for k, prog in programs.items():
        ins[k] = pm.Instrument(program=prog, name=k); mid.instruments.append(ins[k])
        ins[k].control_changes.append(pm.ControlChange(91, 70, 0))
    for k, p, s, d, v in notes: ins[k].notes.append(pm.Note(int(v), int(p), s, s + d))
    if drum_notes:
        dr = pm.Instrument(program=0, is_drum=True, name='drums'); mid.instruments.append(dr)
        for p, s, v in drum_notes: dr.notes.append(pm.Note(int(v), int(p), s, s + 0.2))
    mid.instruments[0].control_changes.append(pm.ControlChange(11, 127, dur))
    path = '/tmp/sfx_tmp.mid'; wav = '/tmp/sfx_tmp.wav'; mid.write(path)
    subprocess.run(['fluidsynth', '-ni', '-g', str(gain), '-r', str(SR), '-R', '1', '-C', '0',
                    '-o', f'synth.reverb.level={reverb_lvl}', '-o', 'synth.reverb.room-size=0.7', '-F', wav, SF2, path], check=True, capture_output=True)
    x, _ = sf.read(wav)
    if x.ndim > 1: x = x.mean(1)
    out = buf(dur); n = min(len(x), len(out)); out[:n] = x[:n]
    return out

# ---------------- 各音效 ----------------
S = {}
def sfx(name, gain=1.0):
    def deco(fn): S[name] = (fn, gain); return fn
    return deco

# ===== 戰鬥 =====
@sfx('arrow_shoot', 0.55)
def _():
    y = buf(0.22)
    tw = pluck(196, 0.2, damp=0.985, bright=0.8) * env(0.2, 0.001, 0.05)
    place(y, tw, 0, 0.7)
    air = hp(noise(0.18), 2500) * env(0.18, 0.01, 0.05) * np.linspace(1, 0.2, int(0.18 * SR))
    return place(y, air, 0.01, 0.35)

@sfx('arrow_hit', 0.5)
def _():
    y = buf(0.14)
    thk = lp(noise(0.08), 1400) * env(0.08, 0.001, 0.018)
    knock = sweep_osc(260, 110, 0.1) * env(0.1, 0.001, 0.03)
    return place(place(y, thk, 0, 0.8), knock, 0, 0.6)

@sfx('sword_slash', 0.6)
def _():
    d = 0.28; y = buf(d); n = noise(d); out = np.zeros_like(n); seg = 256
    for i in range(0, len(n), seg):
        k = i / len(n); fc = 900 + 4200 * np.sin(np.pi * min(1, k * 1.6)) ** 2
        out[i:i + seg] = bp(n[max(0, i - 2048):i + seg], fc * 0.7, fc * 1.4)[-len(n[i:i + seg]):]
    sw = out * np.sin(np.pi * np.clip(T(d) / (d * 0.8), 0, 1)) ** 1.6
    ring = sum(a * np.sin(2 * np.pi * f * T(0.2)) for f, a in ((2310, 1), (3720, 0.6), (5140, 0.35))) * env(0.2, 0.001, 0.05)
    return place(place(y, sw, 0, 0.9), ring, 0.08, 0.25)

@sfx('magic_cast', 0.45)
def _():
    d = 0.36; t = T(d)
    f = 420 * (1600 / 420) ** (t / d) * (1 + 0.03 * np.sin(2 * np.pi * 18 * t))
    y = (osc_f(f) * 0.6 + osc_f(f * 1.5) * 0.25) * np.sin(np.pi * t / d) ** 0.7
    for k in range(9):
        at = rng.uniform(0.03, d - 0.06); place(y, bell(rng.uniform(2500, 5000), 0.06, decay=0.05), at, 0.18)
    return y

@sfx('magic_hit', 0.5)
def _():
    d = 0.3; y = buf(d)
    place(y, sweep_osc(1300, 280, 0.22) * env(0.22, 0.001, 0.06), 0, 0.7)
    place(y, bp(noise(0.2), 2200, 6000) * env(0.2, 0.001, 0.04), 0, 0.5)
    place(y, bell(1900, 0.25, decay=0.2), 0.0, 0.25)
    return y

@sfx('cannon_fire', 0.85)
def _():
    d = 0.6; y = buf(d)
    place(y, sweep_osc(95, 38, 0.5) * env(0.5, 0.002, 0.14), 0, 1.0)
    place(y, lp(noise(0.4), 900) * env(0.4, 0.001, 0.07), 0, 0.9)
    place(y, hp(noise(0.03), 2000) * env(0.03, 0.0005, 0.006), 0, 0.6)
    return y

@sfx('explosion', 0.85)
def _():
    d = 0.9; t = T(d); n = noise(d); out = np.zeros_like(n); seg = 512
    for i in range(0, len(n), seg):
        k = i / len(n); fc = 3200 * (0.06 ** k)
        out[i:i + seg] = lp(n[max(0, i - 2048):i + seg], max(150, fc))[-len(n[i:i + seg]):]
    y = out * env(d, 0.003, 0.22)
    y += sweep_osc(70, 32, d) * env(d, 0.003, 0.25) * 0.9
    for k in range(14):
        at = rng.uniform(0.05, 0.6); place(y, hp(noise(0.01), 3000) * env(0.01, 0.0005, 0.003), at, 0.25 * (1 - at))
    return y

@sfx('enemy_hurt', 0.32)
def _():
    y = buf(0.1)
    place(y, lp(noise(0.06), 1800) * env(0.06, 0.001, 0.015), 0, 0.7)
    return place(y, sweep_osc(520, 300, 0.07, 'tri') * env(0.07, 0.001, 0.025), 0, 0.4)

@sfx('die_goblin', 0.55)
def _():
    d = 0.38; t = T(d); k = t / d
    f = 700 + 700 * np.sin(np.pi * np.clip(k * 1.6, 0, 1)) - 300 * k
    f = f * (1 + 0.06 * np.sin(2 * np.pi * 32 * t))
    src = osc_f(f, 'saw') * 0.7 + 0.08 * noise(d)
    y = formant(src, [(1100, 1.0), (2400, 0.6), (3300, 0.3)])
    return y * adsr(d, 0.01, 1, 0.12) * (1 - 0.4 * k)

@sfx('die_wolf', 0.55)
def _():
    d = 0.5; y = buf(d)
    for at, f0, f1, dd in ((0, 1250, 620, 0.18), (0.2, 1050, 420, 0.26)):
        t = T(dd); f = f0 * (f1 / f0) ** (t / dd) * (1 + 0.02 * np.sin(2 * np.pi * 25 * t))
        src = osc_f(f) * 0.8 + osc_f(f * 2) * 0.25 + osc_f(f, 'saw') * 0.15
        place(y, formant(src, [(900, 1.0), (1800, 0.6), (2800, 0.3)], 1.6) * adsr(dd, 0.01, 1, dd * 0.6), at)
    return y

@sfx('die_bat', 0.4)
def _():
    d = 0.28; y = buf(d)
    for i, at in enumerate((0, 0.07, 0.14)):
        dd = 0.08; t = T(dd)
        f = (5200 - i * 500) * (0.55 ** (t / dd)); m = osc_f(f * 0.5) * f * 0.8
        place(y, osc_f(f + m) * adsr(dd, 0.004, 1, 0.04), at, 1 - i * 0.2)
    return hp(y, 1500)

@sfx('castle_alarm', 0.75)
def _():
    d = 0.9; y = buf(d)
    clang = bell(620, 0.6, ((1, 1), (2.4, 0.7), (3.9, 0.45), (5.95, 0.3)), decay=0.5)
    place(y, clang, 0, 0.8); place(y, clang, 0.28, 0.65)
    place(y, sweep_osc(110, 60, 0.3) * env(0.3, 0.002, 0.08), 0, 0.8)
    place(y, lp(noise(0.15), 600) * env(0.15, 0.002, 0.04), 0, 0.6)
    return y

@sfx('low_food', 0.45)
def _():
    d = 0.7; y = buf(d)
    for i, (at, f) in enumerate(((0, 660), (0.22, 494), (0.44, 392))):
        tone = (sweep_osc(f, f, 0.18, 'square') * 0.3 + sweep_osc(f, f, 0.18) * 0.7)
        place(y, lp(tone, 2500) * adsr(0.18, 0.005, 1, 0.08), at)
    return y

# ===== 英雄 =====
@sfx('erin_atk', 0.5)
def _():
    y = buf(0.25)
    place(y, pluck(262, 0.22, damp=0.99, bright=0.95) * env(0.22, 0.001, 0.07), 0, 0.7)
    place(y, pluck(392, 0.2, damp=0.99, bright=0.9) * env(0.2, 0.001, 0.05), 0.003, 0.3)
    air = bp(noise(0.2), 3000, 9000) * np.sin(np.pi * np.clip(T(0.2) / 0.2, 0, 1)) ** 2
    return place(y, air, 0.02, 0.4)

@sfx('lena_atk', 0.6)
def _():
    d = 0.32; y = buf(d); n = noise(0.24); out = np.zeros_like(n); seg = 256
    for i in range(0, len(n), seg):
        k = i / len(n); fc = 500 + 2000 * np.sin(np.pi * k) ** 2
        out[i:i + seg] = bp(n[max(0, i - 2048):i + seg], fc * 0.6, fc * 1.5)[-len(n[i:i + seg]):]
    place(y, out * np.sin(np.pi * T(0.24) / 0.24) ** 1.5, 0, 0.9)
    clang = bell(880, 0.25, ((1, 1), (2.13, 0.8), (3.3, 0.6), (4.7, 0.4)), decay=0.18)
    place(y, clang, 0.12, 0.5)
    place(y, lp(noise(0.06), 900) * env(0.06, 0.001, 0.02), 0.12, 0.6)
    return y

@sfx('vera_atk', 0.45)
def _():
    d = 0.3; y = buf(d)
    for i, f in enumerate((784, 988, 1175, 1568)):
        place(y, bell(f, 0.2, ((1, 1), (2, 0.3), (3, 0.1)), decay=0.12), i * 0.035, 0.45)
    place(y, sweep_osc(300, 900, 0.2, 'tri') * np.sin(np.pi * T(0.2) / 0.2), 0, 0.3)
    return y

@sfx('skill_erin', 0.6)
def _():
    d = 1.0; y = buf(d)
    for i in range(6):
        place(y, pluck(rng.choice([196, 220, 247, 262]), 0.25, damp=0.988, bright=0.9) * env(0.25, 0.001, 0.06), i * 0.06 + rng.uniform(0, 0.02), 0.5)
    rise = bp(noise(0.6), 1500, 7000) * np.linspace(0, 1, int(0.6 * SR)) ** 2
    place(y, rise, 0.1, 0.4)
    for i, f in enumerate((1319, 1568, 1976, 2637)): place(y, bell(f, 0.4, decay=0.25), 0.55 + i * 0.05, 0.25)
    return reverb(y, 0.35)[:int(1.3 * SR)]

@sfx('skill_lena', 0.65)
def _():
    d = 1.1; t = T(d); y = buf(d)
    chord = sum(np.sin(2 * np.pi * f * t) * (1 + 0.002 * np.sin(2 * np.pi * 5 * t)) for f in (392, 494, 587, 784)) / 4
    place(y, chord * adsr(d, 0.15, 0.8, 0.5), 0, 0.5)
    n = noise(0.5); place(y, lp(n, 1200) * np.linspace(0, 1, len(n)) ** 2 * np.exp(-np.linspace(0, 0, len(n))), 0.35, 0.7)
    place(y, bell(523, 0.5, ((1, 1), (2.2, 0.8), (3.5, 0.5), (5.1, 0.3)), decay=0.35), 0.82, 0.6)
    place(y, lp(noise(0.1), 700) * env(0.1, 0.001, 0.03), 0.82, 0.8)
    return reverb(y, 0.3)[:int(1.4 * SR)]

@sfx('skill_vera', 0.7)
def _():
    d = 1.2; t = T(d); y = buf(d)
    n = noise(d); roar = lp(n, 500) * adsr(d, 0.5, 1, 0.4)
    place(y, roar, 0, 0.9)
    place(y, sweep_osc(120, 480, 0.9, 'saw') * adsr(0.9, 0.2, 0.6, 0.3), 0, 0.15)
    fizz = bp(noise(0.8), 3000, 9000) * np.linspace(0, 1, int(0.8 * SR)) ** 3
    place(y, fizz, 0.2, 0.35)
    for i, f in enumerate((587, 698, 880, 1175)): place(y, bell(f, 0.4, decay=0.3), 0.5 + i * 0.06, 0.25)
    return reverb(y, 0.25)[:int(1.5 * SR)]

@sfx('hero_down', 0.6)
def _():
    d = 1.0; y = buf(d)
    for i, (f0, f1) in enumerate(((523, 392), (392, 311), (311, 196))):
        dd = 0.3; place(y, (sweep_osc(f0, f1, dd) * 0.7 + sweep_osc(f0 * 2, f1 * 2, dd) * 0.15) * adsr(dd, 0.01, 1, 0.15), i * 0.2)
    place(y, lp(noise(0.2), 400) * env(0.2, 0.002, 0.06), 0.68, 0.9)
    return reverb(y, 0.25)[:int(1.2 * SR)]

@sfx('level_up', 0.55)
def _():
    d = 1.0; y = buf(d)
    for i, f in enumerate((784, 988, 1175, 1568, 1976)):
        place(y, bell(f, 0.6, ((1, 1), (3, 0.2), (4.1, 0.1)), decay=0.35), i * 0.06, 0.5)
    shimmer = bp(noise(0.5), 6000, 12000) * env(0.5, 0.05, 0.15)
    place(y, shimmer, 0.25, 0.15)
    return reverb(y, 0.3)[:int(1.2 * SR)]

@sfx('evolve', 0.85)
def _():
    # 號角曲（原創）：降 B 大調 I – IV – V – I 上行宣告＋定音鼓滾奏
    d = 2.8; hi = []
    mel = [(70, 0.0, 0.18), (74, 0.2, 0.18), (77, 0.4, 0.5), (75, 0.95, 0.22), (79, 1.2, 0.22), (82, 1.45, 1.2)]
    for p, s, l in mel: hi.append(('tpt', p, s, l, 110))
    for root, s, l in ((58, 0.0, 0.9), (63, 0.95, 0.5), (65, 1.45, 1.2)):
        for iv in (0, 4, 7): hi.append(('brass', root + iv - 12, s, l, 92))
    for i in range(14): hi.append(('timp', 46, 0.95 + i * 0.035, 0.05, 60 + i * 4))
    hi.append(('timp', 46, 1.45, 0.6, 120))
    y = fluid(hi, d, {'tpt': 56, 'brass': 61, 'timp': 47}, gain=0.7)
    t = T(d); sh = bp(noise(d), 5000, 12000) * np.clip((t - 1.4) / 0.2, 0, 1) * np.exp(-np.maximum(0, t - 1.6) / 0.6)
    y += sh * 0.05
    for i, f in enumerate((1175, 1397, 1760, 2349)): place(y, bell(f, 0.8, decay=0.5), 1.45 + i * 0.05, 0.06)
    return y

# ===== 建造／介面 =====
@sfx('build', 0.6)
def _():
    d = 0.55; y = buf(d)
    for i, at in enumerate((0, 0.16, 0.32)):
        knock = bp(noise(0.08), 300, 1400) * env(0.08, 0.001, 0.025) + sweep_osc(240 - i * 20, 150, 0.08) * env(0.08, 0.001, 0.03) * 0.8
        place(y, knock, at, 0.9 - i * 0.1)
    place(y, bell(1047, 0.3, ((1, 1), (2, 0.3)), decay=0.2), 0.36, 0.15)
    return y

@sfx('upgrade', 0.6)
def _():
    d = 0.8; y = buf(d)
    place(y, bp(noise(0.08), 300, 1400) * env(0.08, 0.001, 0.025), 0, 0.8)
    place(y, bell(1400, 0.2, ((1, 1), (2.7, 0.5)), decay=0.1), 0, 0.3)
    for i, f in enumerate((523, 659, 784, 1047)): place(y, bell(f, 0.45, ((1, 1), (2, 0.4), (3, 0.15)), decay=0.25), 0.12 + i * 0.07, 0.4)
    return reverb(y, 0.2)[:int(1.0 * SR)]

@sfx('sell', 0.5)
def _():
    d = 0.5; y = buf(d)
    for i in range(6):
        place(y, bell(rng.uniform(2600, 4200), 0.2, ((1, 1), (1.47, 0.6), (2.3, 0.3)), decay=0.08), i * 0.045 + rng.uniform(0, 0.015), 0.5)
    return y

@sfx('coin_tick', 0.18)
def _():
    y = buf(0.06); return place(y, bell(2900, 0.05, ((1, 1), (1.5, 0.4)), decay=0.02), 0)

@sfx('click', 0.35)
def _():
    y = buf(0.05)
    place(y, bp(noise(0.02), 1500, 5000) * env(0.02, 0.0005, 0.004), 0, 0.7)
    return place(y, np.sin(2 * np.pi * 1200 * T(0.03)) * env(0.03, 0.0005, 0.008), 0, 0.4)

@sfx('horn_night', 0.8)
def _():
    # 夜晚號角（原創）：低音號角長鳴 + 戰鼓兩下
    d = 2.6
    notes = [('horn', 50, 0.0, 0.9, 112), ('horn', 57, 0.95, 1.3, 118), ('horn', 38, 0.0, 2.2, 90), ('tbn', 45, 0.95, 1.3, 95)]
    y = fluid(notes, d, {'horn': 60, 'tbn': 57}, drum_notes=[(35, 0.0, 120), (35, 0.95, 120), (41, 0.95, 100)], gain=0.7)
    return y

@sfx('dawn', 0.55)
def _():
    d = 2.0; y = buf(d)
    for i, f in enumerate((659, 784, 988, 1319)): place(y, bell(f, 1.2, ((1, 1), (2.01, 0.3), (3.0, 0.1)), decay=0.8), i * 0.18, 0.45)
    # 鳥鳴（FM 啾啾聲）
    for at in (0.6, 0.72, 1.1, 1.18, 1.26):
        dd = 0.07; t = T(dd); f = 3200 + 1600 * np.sin(np.pi * t / dd); place(y, osc_f(f) * np.sin(np.pi * t / dd) ** 2, at, 0.18)
    return reverb(y, 0.35)[:int(2.3 * SR)]

# ===== 新塔／能力 =====
@sfx('musket', 0.7)
def _():
    y = buf(0.4)
    place(y, hp(noise(0.05), 1200) * env(0.05, 0.0005, 0.01), 0, 1.0)
    place(y, lp(noise(0.3), 1500) * env(0.3, 0.001, 0.06), 0, 0.7)
    place(y, sweep_osc(180, 60, 0.2) * env(0.2, 0.001, 0.05), 0, 0.6)
    return y

@sfx('tesla', 0.45)
def _():
    d = 0.32; t = T(d); y = buf(d)
    buzz = osc_f(110 + 30 * rng.standard_normal(len(t)).cumsum() / 300, 'square')
    crack = np.zeros(len(t))
    for k in range(10): place(crack, hp(noise(0.006), 3000) * env(0.006, 0.0002, 0.002), rng.uniform(0, d - 0.01), rng.uniform(0.4, 1))
    y = lp(buzz, 3000) * 0.25 * env(d, 0.002, 0.12) + crack
    return y

@sfx('catapult', 0.6)
def _():
    d = 0.5; y = buf(d)
    place(y, bp(noise(0.12), 150, 900) * env(0.12, 0.002, 0.04), 0, 0.9)          # 木頭撞擊
    place(y, sweep_osc(90, 70, 0.15) * env(0.15, 0.002, 0.05), 0, 0.6)
    sw = bp(noise(0.35), 400, 1500) * np.sin(np.pi * T(0.35) / 0.35) ** 2
    return place(y, sw, 0.05, 0.5)

@sfx('poison', 0.3)
def _():
    d = 0.3; y = buf(d)
    for i in range(4): place(y, sweep_osc(400 + i * 120, 900 + i * 150, 0.05) * env(0.05, 0.002, 0.02), i * 0.05 + rng.uniform(0, 0.02), 0.5)
    return lp(y, 2500)

@sfx('arcane_kill', 0.55)
def _():
    d = 0.7; y = buf(d)
    place(y, bell(330, 0.7, ((1, 1), (1.19, 0.7), (2.83, 0.3)), decay=0.4), 0, 0.7)       # 不協和鐘聲
    place(y, sweep_osc(1800, 200, 0.4) * env(0.4, 0.002, 0.12), 0, 0.25)
    return y

@sfx('bones', 0.45)
def _():
    d = 0.4; y = buf(d)
    for i in range(9): place(y, bp(noise(0.015), 1500, 4500) * env(0.015, 0.0005, 0.004), i * 0.035 + rng.uniform(0, 0.015), rng.uniform(0.5, 1))
    place(y, sweep_osc(200, 400, 0.3, 'tri') * env(0.3, 0.05, 0.1), 0.05, 0.2)
    return y

@sfx('beacon', 0.75)
def _():
    d = 1.6; y = buf(d)
    place(y, bell(98, 1.5, ((1, 1), (2.02, 0.6), (2.98, 0.45), (4.1, 0.3), (5.3, 0.2)), decay=1.0), 0, 0.8)   # 銅鑼
    n = noise(1.2); place(y, lp(n, 1400) * adsr(1.2, 0.3, 1, 0.6) * (1 + 0.3 * np.sin(2 * np.pi * 7 * T(1.2))), 0.05, 0.5)   # 火焰竄起
    return reverb(y, 0.25)[:int(1.9 * SR)]

@sfx('branch', 0.7)
def _():
    d = 1.2; y = buf(d)
    place(y, bp(noise(0.1), 200, 1200) * env(0.1, 0.001, 0.03), 0, 0.9)
    for i, f in enumerate((392, 523, 659, 784, 1047)): place(y, bell(f, 0.6, ((1, 1), (2, 0.4), (3, 0.2)), decay=0.35), 0.1 + i * 0.07, 0.4)
    place(y, sweep_osc(200, 800, 0.5, 'saw') * adsr(0.5, 0.1, 0.5, 0.3), 0.05, 0.05)
    return reverb(y, 0.3)[:int(1.4 * SR)]

# ===== 首領 =====
def growl(d, f0=70, f1=55, rough=0.6):
    t = T(d); f = f0 * (f1 / f0) ** (t / d) * (1 + 0.04 * np.sin(2 * np.pi * 6 * t))
    am = 1 + rough * np.sign(np.sin(2 * np.pi * 27 * t + 0.6 * np.sin(2 * np.pi * 3 * t)))
    src = osc_f(f, 'saw') * am + 0.5 * noise(d)
    return formant(src, [(350, 1.0), (850, 0.7), (1900, 0.35), (2800, 0.15)], 1.5)

@sfx('boss_roar', 0.9)
def _():
    d = 1.5; y = buf(d)
    r = growl(1.3, 95, 60) * adsr(1.3, 0.12, 1, 0.5)
    place(y, r / np.abs(r).max(), 0, 0.85)
    horn = fluid([('horn', 41, 0.0, 0.9, 120), ('tbn', 29, 0.0, 0.9, 110)], 1.2, {'horn': 60, 'tbn': 58}, gain=0.8)
    place(y, horn / max(1e-6, np.abs(horn).max()), 0.05, 0.5)
    return y

@sfx('boss_intro', 1.0)
def _():
    # 首領登場（約 3.8 秒，原創）：低音戰號長鳴 → 低沉戰鼓 → 野獸咆哮 → 不協和銅管漸強上行
    d = 4.2
    notes = [('horn', 38, 0.0, 1.5, 120), ('tuba', 26, 0.0, 1.6, 120), ('tbn', 38, 0.0, 1.5, 105)]
    # 不協和銅管：小二度堆疊、由 2.0 秒漸強上行
    cl = [50, 51, 56, 57]
    for i, p in enumerate(cl):
        for j in range(4): notes.append(('brass', p + j * 2, 2.0 + j * 0.38, 0.4 if j < 3 else 1.0, 70 + j * 15))
    drums = [(35, 0.0, 127), (41, 0.0, 120), (35, 1.55, 127), (41, 1.55, 110), (35, 1.95, 127), (41, 2.35, 115), (35, 2.75, 127), (41, 3.1, 120), (35, 3.1, 127), (49, 3.15, 110)]
    y = fluid(notes, d, {'horn': 60, 'tuba': 58, 'tbn': 57, 'brass': 61}, drum_notes=drums, gain=0.75, reverb_lvl=0.8)
    y = y / max(1e-6, np.abs(y).max())
    # 低沉鼓：合成大鼓加厚
    for at in (0.0, 1.55, 1.95, 2.35, 2.75, 3.1):
        place(y, sweep_osc(75, 38, 0.5) * env(0.5, 0.002, 0.15), at, 0.6)
    g = growl(1.4, 80, 55) * adsr(1.4, 0.15, 1, 0.6)
    place(y, g / np.abs(g).max(), 1.0, 0.6)
    t = T(d); rumble = lp(noise(d), 120) * np.clip(t / 3.0, 0, 1) * np.exp(-np.maximum(0, t - 3.4) / 0.3)
    y += rumble / np.abs(rumble).max() * 0.25
    return fade_out(y, 0.25)

# ---------------- 輸出 ----------------
def finalize(name, y, gain):
    y = np.asarray(y, np.float64)
    y = y - np.mean(y)
    nz = np.nonzero(np.abs(y) > 1e-4 * np.abs(y).max())[0]
    y = y[:nz[-1] + 1]
    fade_out(y, min(0.03, len(y) / SR * 0.2))
    n = min(len(y), int(0.002 * SR)); y[:n] *= np.linspace(0, 1, n)
    pk = np.abs(y).max(); y = y / pk * 10 ** (-1 / 20) * gain
    wav = f'/tmp/sfx_{name}.wav'; sf.write(wav, y.astype(np.float32), SR, subtype='FLOAT')
    ogg = os.path.join(OUT, name + '.ogg'); mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '3', ogg], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
    shutil.copy(mp3, os.path.join(PREV, name + '.mp3'))
    return {'name': name, 'sec': round(len(y) / SR, 2), 'peak_dbfs': round(20 * np.log10(np.abs(y).max()), 1),
            'ogg_kb': round(os.path.getsize(ogg) / 1024, 1), 'mp3_kb': round(os.path.getsize(mp3) / 1024, 1)}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
    only = sys.argv[1:]
    rep = []
    for name, (fn, gain) in S.items():
        if only and name not in only: continue
        info = finalize(name, fn(), gain); rep.append(info); print(json.dumps(info))
    if not only: json.dump(rep, open(os.path.join(HERE, 'sfx_report.json'), 'w'), indent=1)
    print('NAMES', json.dumps(list(S.keys())))
