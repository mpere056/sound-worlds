#!/usr/bin/env python3
"""Validate a reaper-viz manifest and its aligned audio package."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path
from typing import Any, Iterable

import jsonschema


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "manifest.v2.schema.json"


class PackageError(ValueError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _wav_metadata(path: Path) -> tuple[int, int, float]:
    try:
        with wave.open(str(path), "rb") as wav:
            rate = wav.getframerate()
            channels = wav.getnchannels()
            duration = wav.getnframes() / rate
            return rate, channels, duration
    except (wave.Error, EOFError) as exc:
        raise PackageError(f"Unreadable PCM WAV {path}: {exc}") from exc


def _audio_records(manifest: dict[str, Any]) -> Iterable[tuple[str, dict[str, Any]]]:
    yield "master", manifest["master"]
    for track in manifest["tracks"]:
        yield f"track {track['id']}", track["stem"]


def validate_manifest(manifest_path: Path, structure_only: bool = False) -> list[str]:
    manifest_path = manifest_path.resolve()
    package_dir = manifest_path.parent
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    validator_class = jsonschema.validators.validator_for(schema)
    validator_class.check_schema(schema)
    validator = validator_class(schema)
    schema_errors = sorted(validator.iter_errors(manifest), key=lambda e: list(e.path))
    if schema_errors:
        messages = []
        for error in schema_errors:
            location = ".".join(str(part) for part in error.absolute_path) or "<root>"
            messages.append(f"{location}: {error.message}")
        raise PackageError("Schema validation failed:\n  " + "\n  ".join(messages))

    errors: list[str] = []
    project = manifest["project"]
    export_range = project["exportRange"]
    content_duration = export_range["projectEndSec"] - export_range["projectStartSec"]
    expected_audio_duration = content_duration + export_range["tailSec"]
    one_sample = 1.0 / project["sampleRate"]
    if abs(project["contentDurationSec"] - content_duration) > 1e-6:
        errors.append("project.contentDurationSec does not match exportRange")
    # A render boundary is quantized to whole samples. Accept exactly that
    # unavoidable rounding while still rejecting meaningfully misaligned files.
    if abs(project["audioDurationSec"] - expected_audio_duration) > one_sample + 1e-9:
        errors.append("project.audioDurationSec does not equal content duration + tail")
    if project["audioDurationSec"] < project["contentDurationSec"]:
        errors.append("audioDurationSec is shorter than contentDurationSec")

    ids = [track["id"] for track in manifest["tracks"]]
    if len(ids) != len(set(ids)):
        errors.append("track IDs are not unique")
    indices = [track["index"] for track in manifest["tracks"]]
    if len(indices) != len(set(indices)):
        errors.append("track indices are not unique")

    tempo = manifest["tempo"]
    if abs(tempo[0]["timeSec"]) > 1e-9:
        errors.append("tempo map must contain an entry at export time 0")
    if any(a["timeSec"] > b["timeSec"] for a, b in zip(tempo, tempo[1:])):
        errors.append("tempo map is not sorted")

    for region in manifest["regions"]:
        if region["endSec"] <= region["startSec"]:
            errors.append(f"region {region['id']} has a non-positive duration")
        if region["endSec"] > project["contentDurationSec"] + 1e-6:
            errors.append(f"region {region['id']} extends beyond content end")

    for track in manifest["tracks"]:
        for note in track["midi"] or []:
            if note["startSec"] + note["durationSec"] > project["contentDurationSec"] + 1e-6:
                errors.append(f"MIDI note {note['id']} extends beyond content end")

    if not structure_only:
        tolerance = max(1.0 / project["sampleRate"], 1e-4)
        for label, record in _audio_records(manifest):
            audio_path = (package_dir / record["path"]).resolve()
            try:
                audio_path.relative_to(package_dir)
            except ValueError:
                errors.append(f"{label} path escapes the package directory")
                continue
            if not audio_path.is_file():
                errors.append(f"{label} file is missing: {record['path']}")
                continue
            try:
                rate, channels, duration = _wav_metadata(audio_path)
            except PackageError as exc:
                errors.append(str(exc))
                continue
            if rate != record["sampleRate"] or rate != project["sampleRate"]:
                errors.append(f"{label} sample rate mismatch: {rate}")
            if channels != record["channels"]:
                errors.append(f"{label} channel mismatch: {channels}")
            if abs(duration - record["durationSec"]) > tolerance:
                errors.append(f"{label} declared duration does not match WAV header")
            if abs(duration - project["audioDurationSec"]) > tolerance:
                errors.append(f"{label} is not aligned to project.audioDurationSec")
            if _sha256(audio_path) != record["checksum"]:
                errors.append(f"{label} checksum mismatch")

        report_path = package_dir / manifest["reportPath"]
        if not report_path.is_file():
            errors.append(f"export report is missing: {manifest['reportPath']}")

    if errors:
        raise PackageError("Package invariants failed:\n  " + "\n  ".join(errors))
    return [
        f"schema v{manifest['schemaVersion']}",
        f"{len(manifest['tracks'])} track(s)",
        f"{project['contentDurationSec']:.3f}s content",
        f"{project['audioDurationSec']:.3f}s audio",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument(
        "--structure-only",
        action="store_true",
        help="validate JSON and cross-field invariants without checking audio/report files",
    )
    args = parser.parse_args()
    try:
        summary = validate_manifest(args.manifest, args.structure_only)
    except (OSError, json.JSONDecodeError, PackageError) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1
    print("VALID: " + ", ".join(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
