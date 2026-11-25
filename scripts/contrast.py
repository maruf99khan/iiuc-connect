"""WCAG contrast of every text/background pair in the design tokens. Exit 1 if any fails.

The hex values here are the source of truth for the tokens in app/globals.css.
"""
import sys

LIGHT = dict(bg="#ffffff", fg="#14201a", surface="#f6f8f7", surface2="#eef2f0", border="#dde5e0",
             field="#76887e", muted="#4a5a51", brand="#0f5132", brand_strong="#0b3d26",
             on_brand="#ffffff", accent="#7f0218", ink="#0f0165", danger="#b42318", warn="#8a5a00")
DARK = dict(bg="#0a0f0c", fg="#e8f0eb", surface="#111a15", surface2="#18241d", border="#25352c",
            field="#5f7669", muted="#a9b9b0", brand="#6fcf97", brand_strong="#8fdcae",
            on_brand="#0a0f0c", accent="#ff8a9b", ink="#c9c4ff", danger="#ffa198", warn="#f2c36b")

# (foreground, background, minimum ratio, what it is)
PAIRS = [
    ("fg", "bg", 4.5, "body text"), ("fg", "surface", 4.5, "text on card"),
    ("muted", "bg", 4.5, "secondary text"), ("muted", "surface", 4.5, "secondary on card"),
    ("muted", "surface2", 4.5, "secondary on inset"),
    ("brand", "bg", 4.5, "link / brand text"), ("brand", "surface", 4.5, "brand on card"),
    ("on_brand", "brand", 4.5, "primary button label"), ("on_brand", "brand_strong", 4.5, "button hover"),
    ("accent", "bg", 4.5, "accent text"), ("accent", "surface", 4.5, "accent on card"),
    ("ink", "bg", 4.5, "ink text"), ("ink", "surface", 4.5, "ink on card"),
    ("danger", "bg", 4.5, "error text"), ("danger", "surface", 4.5, "error on card"),
    ("warn", "bg", 4.5, "warning text"),
    ("field", "bg", 3.0, "field outline"), ("field", "surface", 3.0, "field outline on card"),
]


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def check():
    bad = 0
    for name, pal in (("light", LIGHT), ("dark", DARK)):
        for f, b, need, what in PAIRS:
            r = ratio(pal[f], pal[b])
            ok = r >= need
            bad += not ok
            print(f"{'ok  ' if ok else 'FAIL'} {name:5} {what:24} {pal[f]} on {pal[b]}  {r:5.2f} (need {need})")
    return bad


if __name__ == "__main__":
    assert abs(ratio("#000000", "#ffffff") - 21) < 0.01  # self-check of the formula
    sys.exit(1 if check() else 0)
