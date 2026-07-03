from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from analyzer.core import analyze_project, build_grid, read_wav


ROOT = Path(__file__).resolve().parents[1]


def write_pcm16(path: Path, rate: int, duration: float, impulses: bool = False) -> str:
    frame_count = round(rate * duration)
    samples = np.zeros(frame_count, dtype="<i2")
    if impulses:
        for time_sec in np.arange(0.25, duration, 0.5):
            start = round(time_sec * rate)
            length = min(200, frame_count - start)
            samples[start : start + length] = np.linspace(30000, 0, length).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


class AnalyzerTests(unittest.TestCase):
    def test_constant_tempo_grid_includes_partial_final_bar(self) -> None:
        tempo = [{"timeSec": 0.0, "qn": 0.0, "bpm": 120.0, "tsNum": 4, "tsDen": 4}]
        grid = build_grid(tempo, 4.25)
        self.assertEqual(grid["beats"], [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0])
        self.assertEqual(len(grid["bars"]), 3)
        self.assertEqual(grid["bars"][-1]["endSec"], 4.25)

    def test_read_wav_decodes_24_bit_pcm(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "24-bit.wav"
            values = np.array([-8388608, -4194304, 0, 4194304, 8388607], dtype=np.int32)
            unsigned = values & 0xFFFFFF
            packed = np.column_stack(
                (unsigned & 0xFF, (unsigned >> 8) & 0xFF, (unsigned >> 16) & 0xFF)
            ).astype(np.uint8)
            with wave.open(str(path), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(3)
                handle.setframerate(8000)
                handle.writeframes(packed.tobytes())
            decoded = read_wav(path).samples
            np.testing.assert_allclose(decoded[:4], [-1.0, -0.5, 0.0, 0.5], atol=1e-6)

    def test_real_package_shape_is_generated_and_cached(self) -> None:
        fixture = json.loads(
            (ROOT / "fixtures" / "exports" / "minimal" / "manifest.json").read_text(encoding="utf-8")
        )
        manifest = copy.deepcopy(fixture)
        with tempfile.TemporaryDirectory() as temp:
            package = Path(temp)
            duration = manifest["project"]["audioDurationSec"]
            master = package / manifest["master"]["path"]
            stem = package / manifest["tracks"][0]["stem"]["path"]
            manifest["master"]["channels"] = 1
            manifest["tracks"][0]["stem"]["channels"] = 1
            manifest["master"]["checksum"] = write_pcm16(master, 48000, duration, impulses=True)
            manifest["tracks"][0]["stem"]["checksum"] = write_pcm16(stem, 48000, duration, impulses=True)
            (package / "export-report.json").write_text('{"valid":true}', encoding="utf-8")
            (package / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            output, song, changed = analyze_project(package)
            self.assertTrue(changed)
            self.assertTrue(output.is_file())
            self.assertEqual(song["meta"]["seed"], manifest["project"]["contentHash"])
            self.assertEqual(song["sections"][0]["kind"], "intro")
            self.assertGreater(len(song["tracks"][0]["events"]), 0)
            self.assertEqual(song["tracks"][0]["events"][0]["kind"], "onset")
            self.assertEqual(song["master"]["energy"]["dt"], 0.02)

            _, cached, changed = analyze_project(package)
            self.assertFalse(changed)
            self.assertEqual(cached, song)


if __name__ == "__main__":
    unittest.main()
