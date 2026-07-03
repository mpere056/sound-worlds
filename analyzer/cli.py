from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import AnalysisError, analyze_project


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compile a validated REAPER export package into song.json."
    )
    parser.add_argument("project", type=Path, help="directory containing manifest.json")
    parser.add_argument("--force", action="store_true", help="rewrite song.json even when unchanged")
    args = parser.parse_args()
    try:
        output, song, changed = analyze_project(args.project, force=args.force)
    except (OSError, ValueError, json.JSONDecodeError, AnalysisError) as exc:
        print(f"ANALYSIS FAILED: {exc}", file=sys.stderr)
        return 1
    action = "WROTE" if changed else "CURRENT"
    print(
        f"{action}: {output} ({len(song['tracks'])} tracks, "
        f"{len(song['grid']['bars'])} bars, {song['meta']['durationSec']:.3f}s)"
    )
    return 0
