"""原創配樂產生器（不使用任何既有旋律）：寫出 MIDI → FluidSynth（FluidR3_GM）合成 → 無縫循環處理 → 響度 -16 LUFS → OGG + MP3。
曲目：day（白天田園）、night（夜戰）、dusk（黃昏提示音）、victory（勝利）、defeat（失敗）。
執行：/workspace/.artenv/bin/python tools/music/compose.py   （需要 fluidsynth、ffmpeg、fluid-soundfont-gm）
可以只改這個檔案裡的旋律／和弦表後重跑；MIDI 會存在 tools/music/*.mid，也可以直接用其他編曲軟體開來改。"""
import os, random, subprocess, json
import numpy as np
import pretty_midi as pm
import soundfile as sf
import pyloudnorm as pyln
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio')
SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
SR = 44100
random.seed(7)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def n(s):
    """'F#5' → MIDI 音高；'r' = 休止"""
    if s == 'r': return None
    k = NOTE[s[0]]; i = 1
    while i < len(s) and s[i] in '#b': k += 1 if s[i] == '#' else -1; i += 1
    return 12 * (int(s[i:]) + 1) + k

CHORD = {  # 和弦（根音 + 音程）
    'G': (7, [0, 4, 7]), 'C': (0, [0, 4, 7]), 'D': (2, [0, 4, 7]), 'Em': (4, [0, 3, 7]), 'Am': (9, [0, 3, 7]),
    'Am7': (9, [0, 3, 7, 10]), 'D7': (2, [0, 4, 7, 10]), 'Dsus': (2, [0, 5, 7]),
    'Dm': (2, [0, 3, 7]), 'Bb': (10, [0, 4, 7]), 'A': (9, [0, 4, 7]), 'Gm': (7, [0, 3, 7]), 'F': (5, [0, 4, 7]),
    'Eb': (3, [0, 4, 7]), 'Cm': (0, [0, 3, 7]), 'Ab': (8, [0, 4, 7]), 'Fm': (5, [0, 3, 7]), 'Db': (1, [0, 4, 7]),
}
def tones(ch, octave):
    r, iv = CHORD[ch]; base = 12 * (octave + 1) + r
    return [base + i for i in iv]

class Song:
    def __init__(self, bpm):
        self.bpm = bpm; self.spb = 60.0 / bpm
        self.mid = pm.PrettyMIDI(initial_tempo=bpm); self.ins = {}
    def inst(self, name, program, drum=False, vol=100, pan=64, rev=60, cho=0):
        i = pm.Instrument(program=program, is_drum=drum, name=name)
        for cc, v in ((7, vol), (10, pan), (91, rev), (93, cho)): i.control_changes.append(pm.ControlChange(cc, v, 0))
        self.mid.instruments.append(i); self.ins[name] = i; return i
    def note(self, name, pitch, beat, dur, vel, human=True):
        if pitch is None: return
        j = random.uniform(-0.008, 0.008) if human else 0
        v = int(max(1, min(127, vel + (random.randint(-6, 6) if human else 0))))
        s = max(0, beat * self.spb + j); e = s + max(0.03, dur * self.spb * 0.97)
        self.ins[name].notes.append(pm.Note(v, int(pitch), s, e))
    def line(self, name, beat, seq, vel, octave_shift=0, legato=1.0):
        """seq: [(音名, 拍數), ...]；回傳結束拍"""
        for s, d in seq:
            p = n(s)
            if p is not None: self.note(name, p + 12 * octave_shift, beat, d * legato, vel)
            beat += d
        return beat
    def finish(self, total_beats, tail=5.0):
        # 在循環長度之後放一個不影響聲音的控制訊息，讓合成器把殘響尾巴算完
        self.mid.instruments[0].control_changes.append(pm.ControlChange(11, 127, total_beats * self.spb + tail))
        return total_beats * self.spb

# =====================================================================
# 白天：G 大調，88 BPM，32 小節 ≈ 87.3 秒
#   前奏 4 ｜ A 段 8（長笛）｜ B 段 8（直笛，豎琴琶音）｜ A' 段 8（長笛＋單簧管三度和聲）｜ 尾奏 4（接回前奏）
# =====================================================================
def day():
    S = Song(88)
    S.inst('guitar', 24, vol=92, pan=50, rev=55)       # 尼龍吉他（魯特琴感）
    S.inst('harp', 46, vol=78, pan=84, rev=75)
    S.inst('flute', 73, vol=96, pan=64, rev=70)
    S.inst('recorder', 74, vol=92, pan=70, rev=70)
    S.inst('clar', 71, vol=70, pan=44, rev=70)
    S.inst('strings', 48, vol=58, pan=64, rev=90)
    S.inst('bass', 32, vol=88, pan=60, rev=30)
    S.inst('perc', 0, drum=True, vol=70, pan=64, rev=40)
    intro = ['G', 'C', 'G', 'D']
    A = ['G', 'D', 'Em', 'C', 'G', 'Am', 'D7', 'G']
    B = ['C', 'G', 'Am', 'Em', 'C', 'G', ('Am7', 'D'), 'D']
    outro = ['C', 'D', 'G', 'Dsus']
    form = [('intro', intro), ('A', A), ('B', B), ('A2', A), ('outro', outro)]
    melA = [[('B4', 1), ('D5', 1), ('G5', 1.5), ('F#5', .5)], [('E5', 1), ('D5', 1), ('A4', 2)],
            [('B4', 1), ('C5', .5), ('B4', .5), ('G4', 1), ('E4', 1)], [('G4', 1.5), ('A4', .5), ('C5', 1), ('E5', 1)],
            [('D5', 1.5), ('B4', .5), ('G4', 1), ('B4', 1)], [('C5', 1), ('E5', 1), ('A5', 1), ('G5', .5), ('E5', .5)],
            [('F#5', 1), ('E5', .5), ('D5', .5), ('A4', 1), ('C5', 1)], [('B4', 3), ('r', 1)]]
    melA2_end = [('G4', 1), ('B4', 1), ('D5', 1), ('G5', 1)]
    melB = [[('E5', 1), ('G5', 1), ('C6', 1), ('B5', .5), ('A5', .5)], [('G5', 2), ('D5', 1), ('B4', 1)],
            [('C5', 1), ('A4', .5), ('C5', .5), ('E5', 1), ('A5', 1)], [('G5', 1.5), ('F#5', .5), ('E5', 2)],
            [('E5', 1), ('D5', .5), ('C5', .5), ('G4', 1), ('C5', 1)], [('D5', 1), ('B4', 1), ('G4', 1), ('B4', 1)],
            [('C5', 1), ('E5', 1), ('D5', 1), ('F#5', 1)], [('A5', 2), ('F#5', 1), ('E5', .5), ('D5', .5)]]
    scale = [n(x) for x in ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5', 'A5', 'B5', 'C6']]
    def third_below(p):
        if p in scale: i = scale.index(p); return scale[max(0, i - 2)]
        return p - 3
    bar = 0
    for sec, chords in form:
        for bi, ch in enumerate(chords):
            b0 = bar * 4
            halves = ch if isinstance(ch, tuple) else (ch, ch)
            # 吉他：8 分音符琶音（根-五-八-三-五-三-八-五）
            for h, c in enumerate(halves):
                t3, t4 = tones(c, 2), tones(c, 3)
                pat = [t3[0], t3[2], t4[0], t4[1], t4[2], t4[1], t4[0], t3[2]]
                for k in range(4):
                    e = h * 4 + k
                    S.note('guitar', pat[e], b0 + e * 0.5, 0.9, 60 + (10 if e % 4 == 0 else 0) - (8 if sec == 'intro' else 0))
            # 豎琴：前奏／B 段／尾奏 上行琶音
            if sec in ('intro', 'B', 'outro'):
                c = halves[0]; t = tones(c, 4) + tones(c, 5)
                for k, p in enumerate(t[:6]): S.note('harp', p, b0 + k * 0.5, 2.5, 52 + k * 3)
                if sec == 'outro' and bi == 3:
                    for k, p in enumerate(reversed(tones('D', 5) + [n('C6')])): S.note('harp', p, b0 + 3 + k * 0.25, 1.5, 58)
            # 弦樂鋪底（整小節和弦）
            for c_i, c in enumerate(halves if halves[0] != halves[1] else (halves[0],)):
                dur = 4 if halves[0] == halves[1] else 2
                for p in tones(c, 3): S.note('strings', p, b0 + c_i * 2, dur, 38 if sec != 'B' else 44, human=False)
            # 貝斯：根音（一拍）＋五度（三拍）
            if sec != 'intro':
                r1 = tones(halves[0], 1)[0] + 12; r2 = tones(halves[1], 1)[0] + 12
                S.note('bass', r1, b0, 1.8, 70); S.note('bass', r2 + 7 if halves[0] == halves[1] else r2, b0 + 2, 1.8, 62)
            else:
                S.note('bass', tones(halves[0], 1)[0] + 12, b0, 3.8, 50)
            # 手鼓：沙鈴 8 分（輕）、邦哥鼓、鈴鼓（B／A' 段的 2、4 拍）
            if sec != 'intro' or bi >= 2:
                for e in range(8): S.note('perc', 70, b0 + e * 0.5, 0.2, (34 if e % 2 else 44) - (10 if sec == 'intro' else 0))
            if sec in ('A', 'B', 'A2'):
                for bt, p, v in ((0, 61, 56), (1.5, 60, 44), (2, 61, 46), (3, 60, 40), (3.5, 60, 46)): S.note('perc', p, b0 + bt, 0.2, v)
            if sec in ('B', 'A2'):
                for bt in (1, 3): S.note('perc', 54, b0 + bt, 0.2, 42)
            if sec == 'outro' and bi == 3:
                S.note('perc', 81, b0, 2, 50)    # 三角鐵：回到開頭前的提示
            # 旋律
            if sec == 'A': S.line('flute', b0, melA[bi], 78)
            if sec == 'B': S.line('recorder', b0, melB[bi], 74)
            if sec == 'A2':
                m = melA[bi] if bi < 7 else melA2_end
                S.line('flute', b0, m, 82)
                if bi < 6:
                    bt = b0
                    for s, d in m:
                        p = n(s)
                        if p is not None: S.note('clar', third_below(p), bt, d, 56)
                        bt += d
            bar += 1
    return S, S.finish(bar * 4)

# =====================================================================
# 夜戰：D 小調，160 BPM，48 小節 = 72 秒
#   前奏 4（太鼓＋低音弦樂頑固音型）｜ A 8（高音弦樂旋律）｜ A2 8（法國號旋律＋銅管重音）｜ B 8（緊張推進、小鼓）
#   ｜ C 8（壓低：合唱、稀疏太鼓）｜ 爬升 8（音階上行、小鼓滾奏漸強）｜ 結尾 4（齊奏重音 → 接回前奏）
# =====================================================================
def night():
    S = Song(160)
    S.inst('ost', 48, vol=100, pan=58, rev=45)        # 弦樂頑固音型
    S.inst('cello', 42, vol=96, pan=50, rev=40)
    S.inst('vln', 48, vol=104, pan=72, rev=60)        # 高音弦樂旋律
    S.inst('horn', 60, vol=104, pan=56, rev=60)
    S.inst('brass', 61, vol=96, pan=66, rev=50)
    S.inst('choir', 52, vol=78, pan=64, rev=85)
    S.inst('taiko', 116, vol=110, pan=60, rev=55)
    S.inst('timp', 47, vol=100, pan=70, rev=55)
    S.inst('drums', 48, drum=True, vol=100, pan=64, rev=45)   # 管弦樂打擊組
    form = [('intro', ['Dm'] * 4),
            ('A', ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A']),
            ('A2', ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A']),
            ('B', ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Bb', 'A']),
            ('C', ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A']),
            ('build', ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A']),
            ('final', ['Dm', 'Dm', 'A', 'A'])]
    melA = [[('D5', 2), ('F5', 1), ('A5', 1)], [('G5', 1.5), ('F5', .5), ('E5', 1), ('D5', 1)],
            [('F5', 2), ('D5', 1), ('Bb4', 1)], [('C5', 1), ('E5', 1), ('G5', 2)],
            [('A5', 2), ('G5', 1), ('F5', 1)], [('E5', 1), ('F5', 1), ('D5', 2)],
            [('Bb5', 1.5), ('A5', .5), ('G5', 1), ('F5', 1)], [('E5', 2), ('C#5', 1), ('A4', 1)]]
    melA2_end = [[('F5', 1), ('G5', 1), ('A5', 1), ('Bb5', 1)], [('A5', 3), ('r', 1)]]
    melB = [[('D5', 1), ('G5', 1), ('Bb5', 1), ('A5', .5), ('G5', .5)], [('A5', 2), ('F5', 1), ('D5', 1)],
            [('F5', 1), ('Bb5', 1), ('D6', 1), ('C6', .5), ('Bb5', .5)], [('A5', 2), ('E5', 1), ('C#5', 1)],
            [('Bb5', 1.5), ('A5', .5), ('G5', 1), ('D5', 1)], [('F5', 1.5), ('E5', .5), ('D5', 1), ('A4', 1)],
            [('Bb4', 1), ('D5', 1), ('F5', 1), ('Bb5', 1)], [('A5', 2), ('C#6', 2)]]
    hornC = [[('D4', 4)], [('D4', 2), ('F4', 2)], [('D4', 4)], [('C#4', 4)], [('D4', 4)], [('F4', 2), ('D4', 2)], [('G4', 4)], [('E4', 4)]]
    buildTop = ['Bb4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'A5']
    finalMel = [[('D5', 2), ('A4', 2)], [('D5', 1), ('F5', 1), ('A5', 2)], [('A5', 4)], [('r', 4)]]
    bar = 0; total = sum(len(c) for _, c in form)
    for sec, chords in form:
        for bi, ch in enumerate(chords):
            b0 = bar * 4; r = tones(ch, 2)[0]
            energy = {'intro': 0.75, 'A': 0.85, 'A2': 0.95, 'B': 1.0, 'C': 0.7, 'build': 0.8 + bi * 0.03, 'final': 1.05}[sec]
            # 頑固音型（3+3+2 重音）
            pat = [0, 0, 12, 0, 7, 0, 12, 7] if sec != 'C' else [0, 0, 7, 0, 0, 7, 0, 12]
            for e, iv in enumerate(pat):
                acc = e in (0, 3, 6)
                S.note('ost', r + iv, b0 + e * 0.5, 0.42, int((70 + (18 if acc else 0)) * energy))
            # 大提琴／低音：8 分根音
            for e in range(8):
                if sec == 'C' and e % 2: continue
                S.note('cello', r - 12, b0 + e * 0.5, 0.45, int((66 + (14 if e in (0, 3, 6) else 0)) * energy))
            # 太鼓：3+3+2，每 4 小節最後一拍加 16 分滾奏
            if sec != 'C' or bi % 2 == 0:
                for e in (0, 3, 6): S.note('taiko', n('D2'), b0 + e * 0.5, 0.5, int(100 * energy))
                if bi % 4 == 3 and sec != 'C':
                    for k in range(4): S.note('taiko', n('F2'), b0 + 3 + k * 0.25, 0.25, 70 + k * 12)
            # 管弦打擊：大鼓 1、3 拍；小鼓 2、4 拍（A2／B／結尾）；銅鈸在段落開頭
            if sec not in ('C',):
                S.note('drums', 36, b0, 0.3, int(96 * energy)); S.note('drums', 36, b0 + 2, 0.3, int(84 * energy))
            if sec in ('A2', 'B', 'final'):
                S.note('drums', 38, b0 + 1, 0.2, 82); S.note('drums', 38, b0 + 3, 0.2, 86)
                if bi % 2 == 1: S.note('drums', 38, b0 + 3.5, 0.2, 66)
            if bi == 0 and sec in ('A', 'A2', 'B', 'build', 'final'): S.note('drums', 49, b0, 2, 96)
            # 小鼓滾奏：B 段尾、爬升段最後 4 小節漸強
            if (sec == 'B' and bi == 7) or (sec == 'build' and bi >= 4):
                step = 0.25 if (sec == 'B' or bi < 6) else 0.125
                k = 0; t = 0.0
                while t < 4 - 1e-6:
                    prog = ((bi - 4) * 4 + t) / 16 if sec == 'build' else t / 4
                    S.note('drums', 38, b0 + t, step, int(40 + 70 * prog), human=False); t += step; k += 1
            # 定音鼓：段落起點與屬和弦小節
            if bi == 0 or ch == 'A':
                S.note('timp', r - 12 if r - 12 >= n('D2') else r, b0, 1.5, 96)
            if sec == 'final' and bi >= 2:
                for k in range(8): S.note('timp', n('A2'), b0 + k * 0.5, 0.5, 70 + k * 6)
            # 銅管重音
            stab = tones(ch, 4)
            if sec in ('A2', 'B') and bi % 2 == 0:
                for e in (0, 3, 6):
                    for p in stab: S.note('brass', p, b0 + e * 0.5, 0.35, 92)
            if sec == 'build':
                for e in ((0,) if bi < 4 else (0, 3, 6)):
                    for p in stab: S.note('brass', p, b0 + e * 0.5, 0.35, 70 + bi * 5)
            if sec == 'final' and bi < 2:
                for e in (0, 3, 6):
                    for p in stab + [stab[0] - 12]: S.note('brass', p, b0 + e * 0.5, 0.4, 104)
            # 旋律
            if sec == 'A': S.line('vln', b0, melA[bi], 90)
            if sec == 'A2':
                m = melA[bi] if bi < 6 else melA2_end[bi - 6]
                S.line('horn', b0, m, 96, octave_shift=-1); S.line('vln', b0, m, 84, octave_shift=0)
            if sec == 'B': S.line('vln', b0, melB[bi], 96); S.line('horn', b0, melB[bi], 80, octave_shift=-1)
            if sec == 'C':
                S.line('horn', b0, hornC[bi], 78)
                for p in tones(ch, 3): S.note('choir', p, b0, 4, 62, human=False)
            if sec == 'build':
                p = n(buildTop[bi]); S.note('vln', p, b0, 4, 70 + bi * 6, human=False); S.note('vln', p - 12, b0, 4, 64 + bi * 6, human=False)
                for q in tones(ch, 3): S.note('choir', q, b0, 4, 50 + bi * 5, human=False)
            if sec == 'final':
                S.line('vln', b0, finalMel[bi], 100); S.line('horn', b0, finalMel[bi], 96, octave_shift=-1)
            bar += 1
    return S, S.finish(bar * 4)

# ---------------- 短曲 ----------------
def dusk():      # 黃昏提示（約 4 秒）：定音鼓滾奏＋法國號上行＋弦樂顫音和弦漸強
    S = Song(100)
    S.inst('horn', 60, vol=100, rev=80); S.inst('str', 44, vol=96, rev=85); S.inst('timp', 47, vol=100, rev=70)
    for k in range(20): S.note('timp', n('D2'), k * 0.25, 0.25, 40 + k * 3, human=False)
    S.line('horn', 0, [('D3', 1.5), ('A3', 1.5), ('D4', 3)], 88)
    for p in ['D3', 'A3', 'D4', 'E4', 'F4']: S.note('str', n(p), 1, 5, 80, human=False)
    return S, S.finish(6.5, tail=2.5)

def victory():   # 勝利：C 大調小號號角
    S = Song(120)
    S.inst('tpt', 56, vol=110, rev=70); S.inst('brass', 61, vol=96, rev=70); S.inst('str', 48, vol=90, rev=80)
    S.inst('timp', 47, vol=100, rev=70); S.inst('drums', 48, drum=True, vol=100, rev=60)
    t = 0
    for p, d in [('G4', 1 / 3), ('G4', 1 / 3), ('G4', 1 / 3), ('C5', 1), ('E5', .5), ('G5', 1.5)]: S.note('tpt', n(p), t, d, 104); t += d
    S.line('tpt', t, [('E5', .5), ('G5', .5), ('C6', 3)], 110)
    for p in tones('C', 4) + [n('C3')]: S.note('brass', p, 3.5, 4, 96)
    for p in tones('C', 3) + tones('C', 4): S.note('str', p, 3.5, 4, 84)
    for k in range(8): S.note('timp', n('C2'), 3.5 + k * 0.125, 0.125, 60 + k * 6)
    S.note('timp', n('G2'), 4.5, 1, 110); S.note('drums', 49, 3.5, 3, 110); S.note('drums', 57, 4.5, 3, 90)
    return S, S.finish(8, tail=2.5)

def defeat():    # 失敗：C 小調，緩慢下行
    S = Song(66)
    S.inst('oboe', 68, vol=96, rev=85); S.inst('str', 48, vol=86, rev=90); S.inst('cello', 42, vol=90, rev=85)
    S.line('oboe', 0, [('G4', 1), ('F4', .5), ('Eb4', .5), ('D4', 1), ('C4', 2.5)], 80)
    for i, (c, d) in enumerate([('Cm', 1), ('Fm', 1), ('Ab', 1), ('Cm', 2.5)]):
        st = [0, 1, 2, 3][i]
        for p in tones(c, 3): S.note('str', p, st, d, 60, human=False)
    S.line('cello', 0, [('C3', 1), ('F2', 1), ('Ab2', 1), ('C2', 2.5)], 70)
    return S, S.finish(5.5, tail=2.5)

# ---------------- 合成與處理 ----------------
def render(name, S, loop_len, loop):
    mid = os.path.join(HERE, name + '.mid'); S.mid.write(mid)
    wav = f'/tmp/music_{name}.wav'
    subprocess.run(['fluidsynth', '-ni', '-g', '0.5', '-r', str(SR), '-R', '1', '-C', '1',
                    '-o', 'synth.reverb.room-size=0.62', '-o', 'synth.reverb.damp=0.35', '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.7',
                    '-F', wav, SF2, mid], check=True, capture_output=True)
    x, sr = sf.read(wav); assert sr == SR
    if x.ndim == 1: x = np.stack([x, x], 1)
    L = int(round(loop_len * SR))
    if loop:
        y = x[:L].copy(); tail = x[L:]
        k = 0
        while k < len(tail):                     # 殘響尾巴疊回開頭（可能超過一圈就再疊）
            seg = tail[k:k + L]; y[:len(seg)] += seg; k += L
    else:
        # 短曲：保留尾巴，去掉結尾靜音、淡出最後 0.3 秒
        nz = np.nonzero(np.abs(x).max(1) > 1e-4)[0]; y = x[:nz[-1] + 1 if len(nz) else len(x)].copy()
        f = min(len(y), int(0.3 * SR)); y[-f:] *= np.linspace(1, 0, f)[:, None]
    # 響度 -16 LUFS（短曲 -17）
    meter = pyln.Meter(SR)
    target = -16.0 if loop else -17.0
    lufs = meter.integrated_loudness(np.concatenate([y, y]) if loop else y)
    y = y * 10 ** ((target - lufs) / 20)
    # 簡易前瞻限幅器：峰值壓在 -1.5 dBFS（循環曲用環狀邊界，避免接點處增益不同）
    thr = 10 ** (-1.5 / 20); a = np.abs(y).max(1)
    g = np.minimum(1.0, thr / np.maximum(a, 1e-9))
    mode = 'wrap' if loop else 'nearest'
    g = minimum_filter1d(g, int(0.006 * SR), mode=mode); g = uniform_filter1d(g, int(0.006 * SR), mode=mode)
    g = np.minimum(g, minimum_filter1d(g, 3, mode=mode))
    y = y * g[:, None]
    y = np.clip(y, -0.999, 0.999)
    out_wav = f'/tmp/music_{name}_final.wav'; sf.write(out_wav, y.astype(np.float32), SR, subtype='FLOAT')
    ogg = os.path.join(OUT, name + '.ogg'); mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out_wav, '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out_wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    # 技術檢查
    d = np.abs(np.diff(y, axis=0)).max(1)
    jump = float(np.abs(y[0] - y[-1]).max()) if loop else 0.0
    info = {'name': name, 'bpm': S.bpm, 'seconds': round(len(y) / SR, 3), 'lufs': round(meter.integrated_loudness(np.concatenate([y, y]) if loop else y), 2),
            'peak_dbfs': round(20 * np.log10(np.abs(y).max()), 2), 'clipped_samples': int((np.abs(y) >= 0.999).sum()),
            'loop_seam_jump': round(jump, 5), 'median_step': round(float(np.median(d)), 5), 'p999_step': round(float(np.percentile(d, 99.9)), 5),
            'notes': sum(len(i.notes) for i in S.mid.instruments),
            'ogg_kb': round(os.path.getsize(ogg) / 1024), 'mp3_kb': round(os.path.getsize(mp3) / 1024)}
    # 頻譜圖
    try:
        import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
        mono = y.mean(1); fig, ax = plt.subplots(figsize=(10, 3))
        ax.specgram(mono, NFFT=2048, Fs=SR, noverlap=1024, cmap='magma', vmin=-120); ax.set_ylim(0, 12000); ax.set_title(name)
        fig.tight_layout(); fig.savefig(os.path.join(HERE, f'spectrogram_{name}.png'), dpi=80); plt.close(fig)
    except Exception as e: info['spectrogram'] = str(e)
    return info

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    rep = []
    for name, fn, loop in [('day', day, True), ('night', night, True), ('dusk', dusk, False), ('victory', victory, False), ('defeat', defeat, False)]:
        S, L = fn(); info = render(name, S, L, loop); rep.append(info); print(json.dumps(info, ensure_ascii=False))
    json.dump(rep, open(os.path.join(HERE, 'render_report.json'), 'w'), indent=1, ensure_ascii=False)

# ---------------- 技能演出音效（合成）：風切聲 + 亮音 ----------------
def make_whoosh():
    rng = np.random.default_rng(3); L = int(0.75 * SR); t = np.arange(L) / SR
    noise = rng.standard_normal(L)
    from scipy.signal import butter, sosfilt
    # 帶通中心頻率 300 → 3000 → 900 Hz 掃頻（分段濾波後交叉混合）
    out = np.zeros(L); seg = 512
    for i in range(0, L, seg):
        k = i / L; fc = 300 + 2700 * np.sin(np.pi * min(1, k * 1.4)) ** 2
        sos = butter(2, [max(80, fc * 0.6), min(SR / 2 - 100, fc * 1.6)], btype='band', fs=SR, output='sos')
        out[i:i + seg] = sosfilt(sos, noise[max(0, i - 2048):i + seg])[-len(noise[i:i + seg]):]
    env = np.sin(np.pi * np.clip(t / 0.75, 0, 1)) ** 1.5
    w = out * env
    shimmer = sum(np.sin(2 * np.pi * f * t) * np.exp(-((t - 0.32) / 0.12) ** 2) for f in (1568, 2093, 3136)) * 0.08
    y = w / np.abs(w).max() * 0.6 + shimmer
    st = np.stack([y * np.linspace(1.0, 0.6, L), y * np.linspace(0.6, 1.0, L)], 1)      # 由左到右
    st = st / np.abs(st).max() * 10 ** (-3 / 20)
    wav = '/tmp/music_whoosh_final.wav'; sf.write(wav, st.astype(np.float32), SR, subtype='FLOAT')
    for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '4']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '128k'])):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, *args, os.path.join(OUT, 'whoosh.' + ext)], check=True)
    print('whoosh', round(L / SR, 2), 's')

if __name__ == '__main__':
    make_whoosh()
