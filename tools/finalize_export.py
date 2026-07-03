#!/usr/bin/env python3
"""Turn a REAPER snapshot plus rendered WAV index into a manifest v2 package."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import wave
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_SPEC = importlib.util.spec_from_file_location(
    "validate_export", ROOT / "tools" / "validate_export.py"
)
validate_export = importlib.util.module_from_spec(VALIDATOR_SPEC)
assert VALIDATOR_SPEC.loader is not None
VALIDATOR_SPEC.loader.exec_module(validate_export)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def wav_record(path: Path, package_dir: Path, render_mode: str | None = None) -> dict[str, Any]:
    with wave.open(str(path), "rb") as wav:
        record: dict[str, Any] = {
            "path": path.resolve().relative_to(package_dir.resolve()).as_posix(),
            "checksum": sha256_file(path),
            "sampleRate": wav.getframerate(),
            "channels": wav.getnchannels(),
            "durationSec": wav.getnframes() / wav.getframerate(),
        }
    if render_mode:
        record["renderMode"] = render_mode
    return record


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def finalize(snapshot_path: Path, render_index_path: Path) -> Path:
    snapshot_path = snapshot_path.resolve()
    package_dir = snapshot_path.parent
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    render_index = json.loads(render_index_path.read_text(encoding="utf-8"))
    by_id = {track["id"]: track for track in snapshot["tracks"]}

    rendered_tracks: list[dict[str, Any]] = []
    included: list[dict[str, Any]] = []
    for rendered in render_index["tracks"]:
        track_id = rendered["id"]
        if track_id not in by_id:
            raise ValueError(f"Rendered track is absent from snapshot: {track_id}")
        source = by_id[track_id]
        audio_path = Path(rendered["path"]).resolve()
        if not audio_path.is_file():
            raise FileNotFoundError(audio_path)
        role = rendered.get("role") or source.get("role") or "other"
        record = {
            "index": source["index"],
            "id": source["id"],
            "name": source["name"],
            "color": source.get("color"),
            "kind": source["kind"],
            "folderPath": source.get("folderPath", []),
            "role": role,
            "stem": wav_record(
                audio_path,
                package_dir,
                source["stemPlan"]["renderMode"],
            ),
            "midi": source.get("midi"),
            "automation": source.get("automation", []),
        }
        rendered_tracks.append(record)
        included.append({"id": track_id, "name": source["name"], "role": role})

    if not rendered_tracks:
        raise ValueError("No tracks were rendered; refusing to create a manifest")
    rendered_tracks.sort(key=lambda track: track["index"])

    master_path = Path(render_index["master"]).resolve()
    if not master_path.is_file():
        raise FileNotFoundError(master_path)
    master = wav_record(master_path, package_dir)

    project_source = snapshot["project"]
    content_fingerprint = {
        "snapshotHash": project_source["snapshotHash"],
        "master": master["checksum"],
        "stems": sorted(track["stem"]["checksum"] for track in rendered_tracks),
    }
    content_hash = "sha256:" + hashlib.sha256(
        json.dumps(content_fingerprint, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    project = {
        "name": project_source["name"],
        "guid": project_source["guid"],
        "snapshotHash": project_source["snapshotHash"],
        "contentHash": content_hash,
        "sampleRate": project_source["sampleRate"],
        "contentDurationSec": project_source["contentDurationSec"],
        "audioDurationSec": master["durationSec"],
        "exportRange": project_source["exportRange"],
    }
    expected_audio = project["contentDurationSec"] + project["exportRange"]["tailSec"]
    one_sample = 1.0 / project["sampleRate"]
    if abs(project["audioDurationSec"] - expected_audio) > one_sample:
        raise ValueError(
            f"Master duration {project['audioDurationSec']:.6f}s does not match expected "
            f"{expected_audio:.6f}s"
        )

    excluded = [
        {"id": track["id"], "name": track["name"], "reason": "not selected in export plan"}
        for track in snapshot["tracks"]
        if track["id"] not in {entry["id"] for entry in rendered_tracks}
    ]
    report = {
        "reportVersion": 1,
        "valid": False,
        "mode": "complete-package",
        "extractorVersion": render_index.get("extractorVersion", "0.1.0"),
        "reaperVersion": snapshot["extractor"]["reaperVersion"],
        "snapshotHash": project["snapshotHash"],
        "contentHash": content_hash,
        "includedTracks": included,
        "excludedTracks": excluded,
        "warnings": snapshot.get("warnings", []),
        "stateRestored": bool(render_index.get("stateRestored")),
        "renderTargets": [master["path"]] + [track["stem"]["path"] for track in rendered_tracks],
    }
    if not report["stateRestored"]:
        raise ValueError("REAPER render state restoration was not confirmed")

    manifest = {
        "schemaVersion": 2,
        "extractor": {
            "name": "reaper-viz-extractor",
            "version": render_index.get("extractorVersion", "0.1.0"),
            "reaperVersion": snapshot["extractor"]["reaperVersion"],
        },
        "project": project,
        "tempo": snapshot["tempo"],
        "regions": snapshot["regions"],
        "markers": snapshot["markers"],
        "tracks": rendered_tracks,
        "master": master,
        "reportPath": "export-report.json",
    }

    report_path = package_dir / "export-report.json"
    manifest_path = package_dir / "manifest.json"
    atomic_json(report_path, report)
    atomic_json(manifest_path, manifest)
    try:
        validate_export.validate_manifest(manifest_path)
    except Exception:
        manifest_path.unlink(missing_ok=True)
        raise
    report["valid"] = True
    atomic_json(report_path, report)
    return manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--render-index", required=True, type=Path)
    args = parser.parse_args()
    try:
        path = finalize(args.snapshot, args.render_index)
    except Exception as exc:
        print(f"FINALIZE FAILED: {exc}", file=sys.stderr)
        return 1
    print(f"FINALIZED: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
