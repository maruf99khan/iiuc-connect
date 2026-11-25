"""SUS and task summary for the UAT results sheet.

    python docs/uat/sus_score.py docs/uat/results.csv
    python docs/uat/sus_score.py --selftest

T1..T3 are the role-specific tasks (students S1..S3, alumni A1..A3).
Blank rows (no SUS answers) are skipped.
"""
import csv
import statistics
import sys


def sus(answers):
    """answers: ten ints 1..5. Odd items score-1, even items 5-score, sum*2.5."""
    if len(answers) != 10 or any(a not in (1, 2, 3, 4, 5) for a in answers):
        raise ValueError(f"need ten answers from 1 to 5, got {answers}")
    return 2.5 * sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))


def selftest():
    assert sus([5, 1] * 5) == 100
    assert sus([1, 5] * 5) == 0
    assert sus([3] * 10) == 50
    assert sus([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]) == 75
    for bad in ([3] * 9, [3] * 9 + [6], [3] * 9 + [0]):
        try:
            sus(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")
    print("selftest ok")


def num(row, key):
    v = (row.get(key) or "").strip()
    return float(v) if v else None


def report(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("sus1") or "").strip()]
    if not rows:
        sys.exit("no rows with SUS answers")
    scores = [sus([int(r[f"sus{i}"]) for i in range(1, 11)]) for r in rows]
    roles = [r["role"] for r in rows]
    print(f"n = {len(rows)} ({roles.count('student')} students, {roles.count('alumni')} alumni)")
    print(f"SUS mean {statistics.mean(scores):.1f}, median {statistics.median(scores):.1f}, "
          f"range {min(scores):.1f} to {max(scores):.1f}")
    print("\ntask   n  done alone  done with hint  failed  median seconds")
    for t in ("V", "D", "P", "T1", "T2", "T3"):
        sc = [s for s in (num(r, f"{t}_score") for r in rows) if s is not None]
        secs = [s for s in (num(r, f"{t}_sec") for r in rows) if s is not None]
        if not sc:
            continue
        med = f"{statistics.median(secs):.0f}" if secs else "-"
        print(f"{t:<5}{len(sc):>3}{sc.count(2):>11}{sc.count(1):>16}{sc.count(0):>8}{med:>13}")
    typo = [r["D_typo"].strip().upper() for r in rows if (r.get("D_typo") or "").strip()]
    if typo:
        print(f"\nsearch typed with a typo: {typo.count('Y')} of {len(typo)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
    elif len(sys.argv) == 2:
        report(sys.argv[1])
    else:
        sys.exit(__doc__)
