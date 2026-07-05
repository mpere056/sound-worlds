from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from jsonschema import Draft7Validator


ROOT = Path(__file__).resolve().parents[1]
CURVE_DT = 0.02
WAVEFORM_PEAKS_PER_SEC = 20
DRUM_ROLES = {"kick", "snare", "hats", "toms", "percussion"}


class AnalysisError(RuntimeError):
    pass


@dataclass(frozen=True)
class AudioData:
    samples: np.ndarray
    sample_rate: int


def _load_validator() -> Any:
    path = ROOT / "tools" / "validate_export.py"
    spec = importlib.util.spec_from_file_location("validate_export", path)
    if spec is None or spec.loader is None:
        raise AnalysisError("Could not load the manifest validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _decode_pcm(raw: bytes, width: int) -> np.ndarray:
    if width == 1:
        return (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    if width == 2:
        return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if width == 3:
        packed = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        values = (
            packed[:, 0].astype(np.int32)
            | (packed[:, 1].astype(np.int32) << 8)
            | (packed[:, 2].astype(np.int32) << 16)
        )
        values = np.where(values & 0x800000, values - 0x1000000, values)
        return values.astype(np.float32) / 8388608.0
    if width == 4:
        return np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    raise AnalysisError(f"Unsupported PCM sample width: {width} bytes")


def read_wav(path: Path) -> AudioData:
    with wave.open(str(path), "rb") as handle:
        if handle.getcomptype() != "NONE":
            raise AnalysisError(f"Compressed WAV is unsupported: {path}")
        channels = handle.getnchannels()
        rate = handle.getframerate()
        values = _decode_pcm(handle.readframes(handle.getnframes()), handle.getsampwidth())
    if values.size % channels:
        raise AnalysisError(f"Malformed interleaved WAV data: {path}")
    mono = values.reshape(-1, channels).mean(axis=1, dtype=np.float32)
    return AudioData(samples=mono, sample_rate=rate)


def _frames(samples: np.ndarray, frame_size: int, hop: int) -> Iterable[np.ndarray]:
    count = max(1, int(math.ceil(len(samples) / hop)))
    for index in range(count):
        start = index * hop
        frame = samples[start : start + frame_size]
        if len(frame) < frame_size:
            frame = np.pad(frame, (0, frame_size - len(frame)))
        yield frame


def _normalize(values: Sequence[float]) -> List[float]:
    if not values:
        return []
    peak = max(values)
    if peak <= 1e-12:
        return [0.0 for _ in values]
    return [round(min(1.0, max(0.0, value / peak)), 6) for value in values]


def audio_curves(audio: AudioData) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, float]]:
    hop = max(1, round(audio.sample_rate * CURVE_DT))
    frame_size = max(2048, hop * 2)
    window = np.hanning(frame_size).astype(np.float32)
    frequencies = np.fft.rfftfreq(frame_size, 1.0 / audio.sample_rate)
    nyquist = audio.sample_rate / 2.0
    rms_values: List[float] = []
    centroid_values: List[float] = []
    for frame in _frames(audio.samples, frame_size, hop):
        rms_values.append(float(np.sqrt(np.mean(np.square(frame, dtype=np.float64)))))
        spectrum = np.abs(np.fft.rfft(frame * window))
        total = float(spectrum.sum())
        centroid = float(np.dot(spectrum, frequencies) / total / nyquist) if total > 1e-12 else 0.0
        centroid_values.append(round(min(1.0, max(0.0, centroid)), 6))
    peak_rms = max(rms_values) if rms_values else 0.0
    mean_rms = sum(rms_values) / len(rms_values) if rms_values else 0.0
    return (
        {"t0": 0.0, "dt": CURVE_DT, "values": _normalize(rms_values)},
        {"t0": 0.0, "dt": CURVE_DT, "values": centroid_values},
        {"peakRms": round(peak_rms, 9), "meanRms": round(mean_rms, 9)},
    )


def waveform_summary(audio: AudioData) -> Dict[str, Any]:
    hop = max(1, round(audio.sample_rate / WAVEFORM_PEAKS_PER_SEC))
    minima: List[float] = []
    maxima: List[float] = []
    for start in range(0, len(audio.samples), hop):
        chunk = audio.samples[start : start + hop]
        minima.append(round(float(chunk.min()), 6) if len(chunk) else 0.0)
        maxima.append(round(float(chunk.max()), 6) if len(chunk) else 0.0)
    return {"peaksPerSec": WAVEFORM_PEAKS_PER_SEC, "min": minima, "max": maxima}


def _sample_curve(curve: Dict[str, Any], time_sec: float) -> float:
    values = curve["values"]
    if not values:
        return 0.0
    position = max(0.0, (time_sec - curve["t0"]) / curve["dt"])
    low = min(len(values) - 1, int(position))
    high = min(len(values) - 1, low + 1)
    alpha = position - int(position)
    return float(values[low] * (1.0 - alpha) + values[high] * alpha)


def detect_onsets(audio: AudioData) -> List[Dict[str, Any]]:
    magnitude = np.abs(audio.samples.astype(np.float64))
    if len(magnitude) < 2 or float(magnitude.max()) <= 1e-9:
        return []
    peak = float(magnitude.max())
    noise_floor = float(np.median(magnitude))
    threshold = max(1e-4, noise_floor * 4.0, peak * 0.15)
    refractory = max(1, round(0.08 * audio.sample_rate))
    velocity_window = max(1, round(0.05 * audio.sample_rate))
    selected: List[Tuple[int, float]] = []
    index = 1
    while index < len(magnitude):
        if magnitude[index] >= threshold and magnitude[index - 1] < threshold:
            start = index
            end = min(len(magnitude), start + velocity_window)
            velocity = float(magnitude[start:end].max()) / peak if end > start else float(magnitude[start]) / peak
            selected.append((start, velocity))
            index = start + refractory
        else:
            index += 1
    if not selected:
        return []
    return [
        {
            "t": round(index / audio.sample_rate, 6),
            "dur": 0.0,
            "pitch": None,
            "vel": round(min(1.0, max(0.0, velocity)), 6),
            "kind": "onset",
        }
        for index, velocity in selected
    ]


def onset_spectra(audio: AudioData, events: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    edges = np.geomspace(30.0, audio.sample_rate / 2.0, 9)
    size = 2048
    window = np.hanning(size)
    frequencies = np.fft.rfftfreq(size, 1.0 / audio.sample_rate)
    result = []
    for event in events:
        center = round(event["t"] * audio.sample_rate)
        start = max(0, center - size // 4)
        frame = audio.samples[start : start + size]
        if len(frame) < size:
            frame = np.pad(frame, (0, size - len(frame)))
        spectrum = np.square(np.abs(np.fft.rfft(frame * window)))
        bands = []
        for low, high in zip(edges, edges[1:]):
            mask = (frequencies >= low) & (frequencies < high)
            bands.append(float(spectrum[mask].mean()) if mask.any() else 0.0)
        result.append({"t": event["t"], "bands": _normalize(bands)})
    return result


def _midi_events(notes: Optional[Sequence[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    return [
        {
            "t": note["startSec"],
            "dur": note["durationSec"],
            "pitch": note["pitch"],
            "vel": note["velocity"],
            "kind": "note",
        }
        for note in (notes or [])
        if not note.get("muted", False)
    ]


def _segment_qn_at_time(start: Dict[str, Any], end: Optional[Dict[str, Any]], time_sec: float) -> float:
    elapsed = time_sec - start["timeSec"]
    if end is not None and start.get("linearRamp") and end["timeSec"] > start["timeSec"]:
        slope = (end["bpm"] - start["bpm"]) / (end["timeSec"] - start["timeSec"])
        return start["qn"] + (start["bpm"] * elapsed + 0.5 * slope * elapsed * elapsed) / 60.0
    return start["qn"] + start["bpm"] * elapsed / 60.0


def qn_to_time(tempo: Sequence[Dict[str, Any]], qn: float) -> float:
    segment = tempo[0]
    following: Optional[Dict[str, Any]] = None
    for index, point in enumerate(tempo):
        if point["qn"] <= qn + 1e-9:
            segment = point
            following = tempo[index + 1] if index + 1 < len(tempo) else None
        else:
            break
    delta_qn = qn - segment["qn"]
    if following is not None and segment.get("linearRamp"):
        duration = following["timeSec"] - segment["timeSec"]
        slope = (following["bpm"] - segment["bpm"]) / duration
        if abs(slope) > 1e-12:
            discriminant = max(0.0, segment["bpm"] ** 2 + 120.0 * slope * delta_qn)
            elapsed = (-segment["bpm"] + math.sqrt(discriminant)) / slope
            return segment["timeSec"] + elapsed
    return segment["timeSec"] + 60.0 * delta_qn / segment["bpm"]


def build_grid(tempo: Sequence[Dict[str, Any]], content_end: float) -> Dict[str, Any]:
    points = sorted(tempo, key=lambda point: point["timeSec"])
    final = points[-1]
    content_end_qn = _segment_qn_at_time(final, None, content_end)
    beats: List[float] = []
    bars: List[Dict[str, Any]] = []
    downbeats: List[float] = []
    for index, point in enumerate(points):
        next_qn = points[index + 1]["qn"] if index + 1 < len(points) else content_end_qn
        segment_end_qn = min(next_qn, content_end_qn)
        beat_qn = 4.0 / point["tsDen"]
        cursor = point["qn"]
        while cursor < segment_end_qn - 1e-9:
            beat_time = qn_to_time(points, cursor)
            if not beats or abs(beat_time - beats[-1]) > 1e-6:
                beats.append(round(beat_time, 9))
            cursor += beat_qn
        if segment_end_qn >= content_end_qn - 1e-9:
            break

    signature_points: List[Dict[str, Any]] = []
    for point in points:
        if not signature_points or (
            point["tsNum"] != signature_points[-1]["tsNum"]
            or point["tsDen"] != signature_points[-1]["tsDen"]
        ):
            signature_points.append(point)
    bar_index = 0
    for index, point in enumerate(signature_points):
        next_qn = signature_points[index + 1]["qn"] if index + 1 < len(signature_points) else content_end_qn
        segment_end_qn = min(next_qn, content_end_qn)
        beat_qn = 4.0 / point["tsDen"]
        bar_qn = point["tsNum"] * beat_qn
        cursor = point["qn"]
        while cursor < segment_end_qn - 1e-9:
            end_qn = min(cursor + bar_qn, segment_end_qn, content_end_qn)
            start_time = qn_to_time(points, cursor)
            end_time = min(content_end, qn_to_time(points, end_qn))
            downbeats.append(round(start_time, 9))
            bars.append({"index": bar_index, "startSec": round(start_time, 9), "endSec": round(end_time, 9)})
            bar_index += 1
            cursor += bar_qn
    return {"beats": beats, "downbeats": downbeats, "bars": bars}


def _section_kind(name: str) -> str:
    lowered = name.lower().replace("-", " ").replace("_", " ")
    rules = (
        (("prechorus", "pre chorus", "prehook", "pre hook"), "prechorus"),
        (("intro",), "intro"), (("verse",), "verse"), (("chorus", "hook"), "chorus"),
        (("bridge", "mid8", "middle 8"), "bridge"), (("drop",), "drop"),
        (("breakdown", "break"), "breakdown"), (("solo",), "solo"), (("outro",), "outro"),
    )
    for names, kind in rules:
        if any(token in lowered for token in names):
            return kind
    return "unknown"


def _sections(regions: Sequence[Dict[str, Any]], content_end: float, energy: Dict[str, Any]) -> List[Dict[str, Any]]:
    def section_payload(name: str, start_sec: float, end_sec: float) -> Dict[str, Any]:
        kind = _section_kind(name)
        start_index = max(0, int(start_sec / energy["dt"]))
        end_index = min(len(energy["values"]), max(start_index + 1, int(math.ceil(end_sec / energy["dt"]))))
        values = energy["values"][start_index:end_index]
        mean_energy = sum(values) / len(values) if values else 0.0
        repeat_group = kind if kind != "unknown" else name.strip().lower()
        return {
            "name": name, "kind": kind,
            "startSec": round(start_sec, 9), "endSec": round(end_sec, 9),
            "repeatGroup": repeat_group or "unknown", "energy": round(mean_energy, 6),
        }

    if not regions:
        return [section_payload("Song", 0.0, content_end)]

    result = []
    cursor = 0.0
    for region in sorted(regions, key=lambda item: (item["startSec"], item["endSec"])):
        start_sec = max(0.0, min(content_end, region["startSec"]))
        end_sec = max(start_sec, min(content_end, region["endSec"]))
        if start_sec > cursor + 1e-9:
            result.append(section_payload("Unlabeled", cursor, start_sec))
        if end_sec > cursor + 1e-9:
            result.append(section_payload(region["name"], max(start_sec, cursor), end_sec))
            cursor = end_sec
        if cursor >= content_end - 1e-9:
            break
    if cursor < content_end - 1e-9:
        result.append(section_payload("Unlabeled", cursor, content_end))
    return result


def _analysis_hash(manifest: Dict[str, Any]) -> str:
    payload = f"song-v1:p0.1:{manifest['project']['contentHash']}"
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_song(package_dir: Path, manifest: Dict[str, Any]) -> Dict[str, Any]:
    project = manifest["project"]
    master_audio = read_wav(package_dir / manifest["master"]["path"])
    master_energy, _, _ = audio_curves(master_audio)
    tracks = []
    track_curves: Dict[str, Dict[str, Any]] = {}
    for source in manifest["tracks"]:
        audio = read_wav(package_dir / source["stem"]["path"])
        rms, centroid, gain = audio_curves(audio)
        role = source.get("role") or "other"
        events = _midi_events(source.get("midi"))
        if not events and role in DRUM_ROLES:
            events = detect_onsets(audio)
        spectra = onset_spectra(audio, events) if role in DRUM_ROLES and events else []
        track_curves[source["id"]] = rms
        tracks.append({
            "id": source["id"], "name": source["name"], "role": role,
            "events": sorted(events, key=lambda event: event["t"]),
            "curves": {"rms": rms, "centroid": centroid, "pitch": None},
            "gain": gain,
            "spectra": spectra,
        })
    energy_values = master_energy["values"]
    loudest_index = int(np.argmax(energy_values)) if energy_values else 0
    loudest_time = loudest_index * master_energy["dt"]
    loudest_track = max(
        manifest["tracks"],
        key=lambda source: _sample_curve(track_curves[source["id"]], loudest_time),
    )["id"]
    return {
        "schemaVersion": 1,
        "meta": {
            "name": project["name"], "seed": project["contentHash"],
            "analysisHash": _analysis_hash(manifest),
            "contentEndSec": project["contentDurationSec"],
            "durationSec": project["audioDurationSec"], "key": None,
        },
        "grid": build_grid(manifest["tempo"], project["contentDurationSec"]),
        "sections": _sections(manifest["regions"], project["contentDurationSec"], master_energy),
        "tracks": tracks,
        "master": {
            "energy": master_energy, "waveform": waveform_summary(master_audio),
            "spectrogram": None, "chords": [],
            "loudestHit": {"t": round(loudest_time, 6), "trackId": loudest_track},
        },
    }


def _validate_song(song: Dict[str, Any]) -> None:
    schema_path = ROOT / "schemas" / "song.v1.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors = sorted(Draft7Validator(schema).iter_errors(song), key=lambda error: list(error.path))
    if errors:
        details = "\n  ".join(f"{'.'.join(map(str, error.path))}: {error.message}" for error in errors)
        raise AnalysisError("song.json validation failed:\n  " + details)


def analyze_project(project_dir: Path, force: bool = False) -> Tuple[Path, Dict[str, Any], bool]:
    package_dir = project_dir.resolve()
    manifest_path = package_dir / "manifest.json"
    validator = _load_validator()
    validator.validate_manifest(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output = package_dir / "song.json"
    expected_hash = _analysis_hash(manifest)
    if output.is_file() and not force:
        existing = json.loads(output.read_text(encoding="utf-8"))
        if existing.get("meta", {}).get("analysisHash") == expected_hash:
            _validate_song(existing)
            return output, existing, False
    song = build_song(package_dir, manifest)
    _validate_song(song)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(song, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    return output, song, True
