from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_export", ROOT / "tools" / "validate_export.py")
validate_export = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(validate_export)

FINALIZER_SPEC = importlib.util.spec_from_file_location(
    "finalize_export", ROOT / "tools" / "finalize_export.py"
)
finalize_export = importlib.util.module_from_spec(FINALIZER_SPEC)
assert FINALIZER_SPEC.loader is not None
FINALIZER_SPEC.loader.exec_module(finalize_export)


def write_silent_wav(path: Path, sample_rate: int, channels: int, duration: float) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = int(round(sample_rate * duration))
    silence = b"\0\0" * channels
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        block = silence * min(frames, 4096)
        remaining = frames
        while remaining:
            count = min(remaining, 4096)
            wav.writeframesraw(block[: count * len(silence)])
            remaining -= count
        wav.writeframes(b"")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return "sha256:" + digest


class ExportValidationTests(unittest.TestCase):
    def fixture(self, name: str) -> dict:
        path = ROOT / "fixtures" / "exports" / name / "manifest.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def test_structure_fixtures_validate(self) -> None:
        for name in ("minimal", "complex"):
            path = ROOT / "fixtures" / "exports" / name / "manifest.json"
            summary = validate_export.validate_manifest(path, structure_only=True)
            self.assertIn("schema v2", summary)

    def test_duplicate_track_id_fails(self) -> None:
        manifest = self.fixture("complex")
        manifest["tracks"][1]["id"] = manifest["tracks"][0]["id"]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(validate_export.PackageError, "track IDs"):
                validate_export.validate_manifest(path, structure_only=True)

    def test_complete_audio_package_validates(self) -> None:
        manifest = copy.deepcopy(self.fixture("minimal"))
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            for record in (manifest["master"], manifest["tracks"][0]["stem"]):
                wav_path = package / record["path"]
                record["checksum"] = write_silent_wav(
                    wav_path, record["sampleRate"], record["channels"], record["durationSec"]
                )
            (package / "export-report.json").write_text('{"valid":true}', encoding="utf-8")
            manifest_path = package / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            validate_export.validate_manifest(manifest_path)

    def test_audio_checksum_mismatch_fails(self) -> None:
        manifest = copy.deepcopy(self.fixture("minimal"))
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            for record in (manifest["master"], manifest["tracks"][0]["stem"]):
                write_silent_wav(
                    package / record["path"], record["sampleRate"], record["channels"], record["durationSec"]
                )
            (package / "export-report.json").write_text('{"valid":true}', encoding="utf-8")
            path = package / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(validate_export.PackageError, "checksum mismatch"):
                validate_export.validate_manifest(path)

    def test_one_sample_render_boundary_rounding_is_valid(self) -> None:
        manifest = copy.deepcopy(self.fixture("minimal"))
        one_sample = 1.0 / manifest["project"]["sampleRate"]
        rounded_duration = manifest["project"]["audioDurationSec"] + one_sample
        manifest["project"]["audioDurationSec"] = rounded_duration
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            for record in (manifest["master"], manifest["tracks"][0]["stem"]):
                record["durationSec"] = rounded_duration
                record["checksum"] = write_silent_wav(
                    package / record["path"],
                    record["sampleRate"],
                    record["channels"],
                    rounded_duration,
                )
            (package / "export-report.json").write_text('{"valid":true}', encoding="utf-8")
            path = package / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            validate_export.validate_manifest(path)

    def test_snapshot_and_render_index_finalize_to_valid_package(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            stem = package / "stems" / "lead.wav"
            master = package / "master.wav"
            write_silent_wav(stem, 48000, 2, 5.0)
            write_silent_wav(master, 48000, 2, 5.0)
            snapshot = {
                "snapshotVersion": 1,
                "extractor": {
                    "name": "reaper-viz-extractor",
                    "version": "0.2.0",
                    "reaperVersion": "fixture",
                    "mode": "read-only-snapshot",
                },
                "project": {
                    "name": "finalizer-fixture",
                    "guid": "{FINALIZER-FIXTURE}",
                    "snapshotHash": "sha256:" + "4" * 64,
                    "sampleRate": 48000,
                    "contentDurationSec": 4.0,
                    "plannedAudioDurationSec": 5.0,
                    "exportRange": {
                        "source": "markers",
                        "projectStartSec": 0.0,
                        "projectEndSec": 4.0,
                        "tailSec": 1.0,
                    },
                },
                "tempo": [
                    {"id": 0, "timeSec": 0, "qn": 0, "bpm": 120, "tsNum": 4, "tsDen": 4, "linearRamp": False}
                ],
                "regions": [],
                "markers": [],
                "warnings": [],
                "tracks": [
                    {
                        "index": 0,
                        "id": "{LEAD}",
                        "name": "Lead",
                        "color": None,
                        "kind": "source",
                        "folderPath": [],
                        "role": "lead",
                        "midi": None,
                        "automation": [],
                        "stemPlan": {
                            "path": "stems/lead.wav",
                            "renderMode": "post-track-fx-post-fader-pre-parent",
                        },
                    }
                ],
            }
            render_index = {
                "extractorVersion": "0.2.0",
                "stateRestored": True,
                "master": str(master),
                "tracks": [{"id": "{LEAD}", "role": "lead", "path": str(stem)}],
            }
            snapshot_path = package / "snapshot.json"
            render_index_path = package / "render-index.json"
            snapshot_path.write_text(json.dumps(snapshot), encoding="utf-8")
            render_index_path.write_text(json.dumps(render_index), encoding="utf-8")
            manifest_path = finalize_export.finalize(snapshot_path, render_index_path)
            summary = validate_export.validate_manifest(manifest_path)
            self.assertIn("1 track(s)", summary)
            report = json.loads((package / "export-report.json").read_text(encoding="utf-8"))
            self.assertTrue(report["valid"])


if __name__ == "__main__":
    unittest.main()
