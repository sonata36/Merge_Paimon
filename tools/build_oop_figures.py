"""Generate the three print-ready OOP diagrams used by the project report."""

from __future__ import annotations

from math import atan2, cos, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "C:/Windows/Fonts/Deng.ttf"
BOLD = "C:/Windows/Fonts/Dengb.ttf"
INK = "#315e4d"
MUTED = "#587468"
GOLD = "#c29441"
PALE = "#f7f5e9"
GREEN = "#e5eee2"
EDGE = "#aec9b0"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def label(draw, xy, value, size=30, fill=INK, bold=False, anchor="mm"):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def line(draw, a, b, fill=MUTED, width=4, arrow=True, dash=False):
    if dash:
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = (dx * dx + dy * dy) ** .5
        for start in range(0, int(length), 21):
            end = min(start + 11, length)
            p = (a[0] + dx * start / length, a[1] + dy * start / length)
            q = (a[0] + dx * end / length, a[1] + dy * end / length)
            draw.line((p, q), fill=fill, width=width)
    else:
        draw.line((a, b), fill=fill, width=width)
    if arrow:
        theta = atan2(b[1] - a[1], b[0] - a[0])
        spread = .55
        r = 16
        left = (b[0] - r * cos(theta - spread), b[1] - r * sin(theta - spread))
        right = (b[0] - r * cos(theta + spread), b[1] - r * sin(theta + spread))
        draw.polygon([b, left, right], fill=fill)


def canvas(width, height, title):
    image = Image.new("RGB", (width, height), "#fffef9")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((16, 16, width - 16, height - 16), radius=28, outline=EDGE, width=4)
    label(draw, (width // 2, 62), title, 38, INK, True)
    draw.line((45, 102, width - 45, 102), fill=GOLD, width=3)
    return image, draw


def oval(draw, center, rx, ry, value, fill=GREEN):
    x, y = center
    draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=fill, outline=EDGE, width=3)
    label(draw, center, value, 29, INK, True)


def box(draw, rect, value, fill=GREEN, size=30):
    draw.rounded_rectangle(rect, radius=18, fill=fill, outline=EDGE, width=3)
    label(draw, ((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2), value, size, INK, True)


def use_cases():
    image, draw = canvas(1500, 900, "玩家用况图")
    draw.rounded_rectangle((318, 120, 1460, 855), radius=24, outline=GOLD, width=4)
    label(draw, (890, 147), "《合成大派蒙》游戏系统", 30, MUTED, True)
    # Actor
    draw.ellipse((110, 345, 165, 400), outline=INK, width=5)
    draw.line((137, 400, 137, 495), fill=INK, width=5)
    draw.line((90, 440, 185, 440), fill=INK, width=5)
    draw.line((137, 495, 95, 550), fill=INK, width=5)
    draw.line((137, 495, 180, 550), fill=INK, width=5)
    label(draw, (137, 595), "玩家", 32, INK, True)
    actions = [
        (215, "开始游戏"), (300, "调整位置并投放"),
        (385, "暂存或交换预备位"), (470, "选择角色并轻推"),
        (555, "查看分数和图鉴"), (640, "查看策略说明"),
        (725, "切换静音"), (810, "重新开始"),
    ]
    for y, name in actions:
        line(draw, (190, 445), (455, y), arrow=False, fill="#a6b9aa", width=3)
        oval(draw, (620, y), 165, 34, name)
    oval(draw, (1175, 365), 225, 39, "同级碰撞后合成并计分", PALE)
    oval(draw, (1175, 600), 225, 39, "持续越线后结束本局", PALE)
    line(draw, (785, 300), (950, 365), GOLD, 4, dash=True)
    line(draw, (785, 470), (950, 385), GOLD, 4, dash=True)
    line(draw, (785, 310), (950, 585), GOLD, 4, dash=True)
    label(draw, (1050, 467), "虚线：满足条件后自动发生", 22, MUTED)
    image.save(OUT / "oop-usecase.png")


def sequence():
    image, draw = canvas(1600, 1110, "同级合成与计分时序图")
    names = ["玩家", "DropController", "GameScene", "Matter世界", "MergeResolver", "GameSession", "页面/音效"]
    xs = [120, 345, 570, 795, 1020, 1245, 1470]
    for x, name in zip(xs, names):
        draw.rounded_rectangle((x - 103, 135, x + 103, 196), radius=12, fill=GREEN, outline=EDGE, width=3)
        label(draw, (x, 166), name, 26, INK, True)
        line(draw, (x, 200), (x, 1040), fill="#b9caba", width=2, arrow=False, dash=True)

    events = [
        (260, 0, 1, "鼠标松开"),
        (345, 1, 2, "onDrop(位置, 等级)"),
        (430, 2, 3, "创建角色和复合刚体"),
        (515, 3, 2, "collisionstart"),
        (600, 2, 4, "queue(接触双方)"),
        (685, 4, 2, "返回唯一结算计划"),
        (770, 2, 3, "移旧建新角色"),
        (855, 2, 5, "awardMerge(L)"),
        (940, 5, 2, "总分增加2^L"),
        (1025, 2, 6, "更新分数、音效及首次8级庆祝"),
    ]
    for y, start, end, message in events:
        a, b = xs[start], xs[end]
        line(draw, (a + (10 if a < b else -10), y), (b - (12 if a < b else -12), y),
             GOLD if y in (685, 940) else MUTED, width=3)
        label(draw, ((a + b) / 2, y - 20), message, 25, INK)
    image.save(OUT / "oop-sequence.png")


def states():
    image, draw = canvas(1500, 1020, "游戏生命周期与单枚角色越线监测")
    label(draw, (750, 155), "整局状态", 30, INK, True)
    box(draw, (125, 200, 365, 280), "待开始")
    box(draw, (625, 200, 865, 280), "进行中")
    box(draw, (1125, 200, 1365, 280), "已结束")
    line(draw, (365, 240), (625, 240))
    label(draw, (495, 210), "点击开始", 22, MUTED)
    line(draw, (865, 240), (1125, 240))
    label(draw, (995, 210), "满足失败条件", 22, MUTED)
    line(draw, (1245, 300), (745, 345), GOLD)
    line(draw, (745, 345), (745, 280), GOLD)
    label(draw, (975, 345), "点击重开：清空本局状态", 22, MUTED)
    draw.line((55, 390, 1445, 390), fill=EDGE, width=3)
    label(draw, (750, 435), "每枚角色独立计时（任一角色满足条件即结束本局）", 28, INK, True)
    box(draw, (105, 540, 375, 625), "线下")
    box(draw, (520, 540, 800, 625), "新投放宽限")
    box(draw, (945, 540, 1245, 625), "持续越线计时")
    box(draw, (945, 805, 1245, 890), "达到失败条件", PALE)
    line(draw, (375, 580), (520, 580))
    label(draw, (448, 545), "新投放越线", 20, MUTED)
    line(draw, (800, 580), (945, 580))
    label(draw, (873, 545), "满2秒仍越线", 20, MUTED)
    line(draw, (1095, 625), (1095, 805), GOLD)
    label(draw, (1260, 715), "连续越线满3秒", 21, MUTED, anchor="lm")
    line(draw, (945, 685), (375, 685), fill="#839e8c")
    line(draw, (375, 685), (375, 625), fill="#839e8c")
    label(draw, (670, 710), "完全回到线下：计时清零", 21, MUTED)
    label(draw, (750, 951), "合成产生的角色没有新投放宽限；8级仍参与越线判定", 24, MUTED)
    image.save(OUT / "oop-state.png")


if __name__ == "__main__":
    use_cases()
    sequence()
    states()
    print(OUT)
