-- @description reaper-viz: export read-only project snapshot (E1)
-- @version 0.2.2
-- @author reaper-viz
-- @about
--   Writes snapshot.json and snapshot-report.json for the currently open
--   project. This E1 action does not render audio or mutate project state.

local SCRIPT_PATH = debug.getinfo(1, "S").source:sub(2)
local SCRIPT_DIR = SCRIPT_PATH:match("^(.*)[/\\][^/\\]+$")
local REPO_ROOT = SCRIPT_PATH:match("^(.*)[/\\]extractor[/\\]reaper[/\\][^/\\]+$")
local SEP = package.config:sub(1, 1)

local function load_module(relative_path)
  return dofile(SCRIPT_DIR .. SEP .. relative_path)
end

local json = load_module("lib" .. SEP .. "rv_json.lua")
local sha256 = load_module("lib" .. SEP .. "rv_sha256.lua")
local PROJECT = 0
local VERSION = "0.2.2"
local TAIL_SEC = 2.0

local warnings = {}
local function warn(message) warnings[#warnings + 1] = message end

local function track_name(track)
  local _, name = reaper.GetSetMediaTrackInfo_String(track, "P_NAME", "", false)
  return name ~= "" and name or "Untitled Track"
end

local function guid_for(object, kind)
  local getter = kind == "item" and reaper.GetSetMediaItemInfo_String
    or reaper.GetSetMediaItemTakeInfo_String
  local ok, value = getter(object, "GUID", "", false)
  return ok and value ~= "" and value or ("{" .. kind .. "-missing-guid}")
end

local function color_hex(native)
  if not native or native == 0 then return json.null end
  local red, green, blue = reaper.ColorFromNative(native)
  return string.format("#%02x%02x%02x", red, green, blue)
end

local function slug(value)
  local result = value:lower():gsub("[^%w%-_]+", "-"):gsub("%-+", "-")
    :gsub("^%-", ""):gsub("%-$", "")
  return result ~= "" and result or "untitled-project"
end

local function detect_role(name)
  local lower = name:lower()
  local rules = {
    { { "kick", "%f[%a]bd%f[%A]" }, "kick" },
    { { "snare", "clap", "%f[%a]sd%f[%A]" }, "snare" },
    { { "hat", "hihat", "hi%-hat", "shaker", "%f[%a]hh%f[%A]" }, "hats" },
    { { "tom" }, "toms" },
    { { "perc", "conga", "bongo" }, "percussion" },
    { { "bass", "sub", "808" }, "bass" },
    { { "lead", "melody", "arp", "pluck" }, "lead" },
    { { "pad", "string", "atmos" }, "pads" },
    { { "keys", "piano", "rhodes", "organ" }, "keys" },
    { { "vocal", "vox", "voice" }, "vocals" },
    { { "riser", "sweep", "impact", "downlifter", "%f[%a]fx%f[%A]" }, "fx" },
  }
  for _, rule in ipairs(rules) do
    for _, pattern in ipairs(rule[1]) do
      if lower:find(pattern) then return rule[2] end
    end
  end
  return "other"
end

local function explicit_role(track)
  local ok, value = reaper.GetSetMediaTrackInfo_String(
    track, "P_EXT:ReaperVizRole", "", false
  )
  if ok and value ~= "" then return value end
  return nil
end

local function classify_track(track, name, folder_depth)
  local lower = name:lower()
  if lower:find("reference") or lower:find("utility") or lower:find("click") then
    return "utility"
  end
  if folder_depth > 0 then return "folder" end
  local receives = reaper.GetTrackNumSends(track, -1)
  if receives > 0 and reaper.CountTrackMediaItems(track) == 0 then return "return" end
  if receives > 0 then return "bus" end
  return "source"
end

local function project_name()
  local _, name = reaper.GetProjectName(PROJECT, "")
  name = (name or ""):gsub("%.rpp$", ""):gsub("%.RPP$", "")
  return name ~= "" and name or "Untitled Project"
end

local function project_guid()
  if reaper.GetProjectGUID then
    local value = reaper.GetProjectGUID(PROJECT)
    if value and value ~= "" then return value end
  end
  local _, path = reaper.EnumProjects(-1, "")
  path = path or ""
  local seed = path
  if seed == "" then
    local track_guids = {}
    for index = 0, reaper.CountTracks(PROJECT) - 1 do
      track_guids[#track_guids + 1] = reaper.GetTrackGUID(reaper.GetTrack(PROJECT, index))
    end
    seed = table.concat(track_guids, "|") .. "|" .. tostring(reaper.GetProjectLength(PROJECT))
  end
  warn("REAPER did not expose a project GUID; the snapshot uses a deterministic project fallback.")
  return "{FALLBACK-" .. sha256.hex(seed):sub(1, 24) .. "}"
end

local function marker_inventory()
  local regions, markers = {}, {}
  local rv_start, rv_end
  local _, marker_count, region_count = reaper.CountProjectMarkers(PROJECT)
  local total = marker_count + region_count
  for enum_index = 0, total - 1 do
    local ok, is_region, position, region_end, name, id, color =
      reaper.EnumProjectMarkers3(PROJECT, enum_index)
    if ok then
      if not is_region and name == "RV_START" then rv_start = position end
      if not is_region and name == "RV_END" then rv_end = position end
      local entry = {
        id = id,
        name = name or "",
        projectStartSec = position,
        projectEndSec = is_region and region_end or nil,
        nativeColor = color,
      }
      if is_region then regions[#regions + 1] = entry else markers[#markers + 1] = entry end
    end
  end
  return regions, markers, rv_start, rv_end
end

local function choose_range(rv_start, rv_end)
  if rv_start and rv_end and rv_end > rv_start then
    return rv_start, rv_end, "markers"
  end
  if (rv_start and not rv_end) or (rv_end and not rv_start) then
    warn("Only one of RV_START/RV_END exists; the marker range was ignored.")
  end
  local start_time, end_time = reaper.GetSet_LoopTimeRange2(
    PROJECT, false, false, 0, 0, false
  )
  if end_time > start_time then return start_time, end_time, "time-selection" end
  local length = reaper.GetProjectLength(PROJECT)
  if length <= 0 then error("The project has no positive content length.") end
  warn("No RV_START/RV_END pair or time selection; using project content bounds.")
  return 0.0, length, "content-bounds"
end

local function relative_qn(time, origin_qn)
  return reaper.TimeMap2_timeToQN(PROJECT, time) - origin_qn
end

local function tempo_map(start_time, end_time, origin_qn)
  local result = {}
  local numerator, denominator, bpm = reaper.TimeMap_GetTimeSigAtTime(PROJECT, start_time)
  result[#result + 1] = {
    id = 0, timeSec = 0.0, qn = 0.0, bpm = bpm,
    tsNum = numerator, tsDen = denominator, linearRamp = false,
  }
  local count = reaper.CountTempoTimeSigMarkers(PROJECT)
  for index = 0, count - 1 do
    local ok, position, _, _, marker_bpm, num, den, linear =
      reaper.GetTempoTimeSigMarker(PROJECT, index)
    if ok and position > start_time + 1e-9 and position < end_time - 1e-9 then
      result[#result + 1] = {
        id = index + 1,
        timeSec = position - start_time,
        qn = relative_qn(position, origin_qn),
        bpm = marker_bpm,
        tsNum = num > 0 and num or numerator,
        tsDen = den > 0 and den or denominator,
        linearRamp = linear == true,
      }
    end
  end
  table.sort(result, function(a, b) return a.timeSec < b.timeSec end)
  return result
end

local function clip_markers(raw_regions, raw_markers, start_time, end_time, origin_qn)
  local regions, markers = {}, {}
  for _, source in ipairs(raw_regions) do
    local clipped_start = math.max(source.projectStartSec, start_time)
    local clipped_end = math.min(source.projectEndSec, end_time)
    if clipped_end > clipped_start then
      if clipped_start ~= source.projectStartSec or clipped_end ~= source.projectEndSec then
        warn("Region '" .. source.name .. "' was clipped to the export range.")
      end
      regions[#regions + 1] = {
        id = source.id, name = source.name,
        startSec = clipped_start - start_time,
        endSec = clipped_end - start_time,
        startQn = relative_qn(clipped_start, origin_qn),
        endQn = relative_qn(clipped_end, origin_qn),
        color = color_hex(source.nativeColor),
      }
    end
  end
  for _, source in ipairs(raw_markers) do
    if source.projectStartSec >= start_time and source.projectStartSec <= end_time
      and source.name ~= "RV_START" and source.name ~= "RV_END" then
      markers[#markers + 1] = {
        id = source.id, name = source.name,
        timeSec = source.projectStartSec - start_time,
        qn = relative_qn(source.projectStartSec, origin_qn),
        color = color_hex(source.nativeColor),
      }
    end
  end
  if #regions == 0 then warn("No named regions intersect the export range.") end
  return regions, markers
end

local function midi_notes(track, track_id, start_time, end_time, origin_qn)
  local notes = {}
  for item_index = 0, reaper.CountTrackMediaItems(track) - 1 do
    local item = reaper.GetTrackMediaItem(track, item_index)
    local item_start = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local item_end = item_start + reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    if item_end > start_time and item_start < end_time then
      local take = reaper.GetActiveTake(item)
      if take and reaper.TakeIsMIDI(take) then
        local item_id = guid_for(item, "item")
        local take_id = guid_for(take, "take")
        local looped = reaper.GetMediaItemInfo_Value(item, "B_LOOPSRC") > 0.5
        local cycle_length, cycle_is_qn
        if looped then
          local source = reaper.GetMediaItemTake_Source(take)
          cycle_length, cycle_is_qn = reaper.GetMediaSourceLength(source)
          local play_rate = reaper.GetMediaItemTakeInfo_Value(take, "D_PLAYRATE")
          if play_rate > 0 then cycle_length = cycle_length / play_rate end
          if not cycle_length or cycle_length <= 0 then
            looped = false
            warn("Looped MIDI item on track '" .. track_name(track)
              .. "' has no usable source length; only its first cycle was exported.")
          end
        end
        local ok, note_count = reaper.MIDI_CountEvts(take)
        if ok then
          for note_index = 0, note_count - 1 do
            local note_ok, _, muted, start_ppq, end_ppq, channel, pitch, velocity =
              reaper.MIDI_GetNote(take, note_index)
            if note_ok then
              local source_start = reaper.MIDI_GetProjTimeFromPPQPos(take, start_ppq)
              local source_end = reaper.MIDI_GetProjTimeFromPPQPos(take, end_ppq)
              local repetitions = 1
              if looped then
                if cycle_is_qn then
                  local item_start_qn = reaper.TimeMap2_timeToQN(PROJECT, item_start)
                  local item_end_qn = reaper.TimeMap2_timeToQN(PROJECT, item_end)
                  repetitions = math.ceil((item_end_qn - item_start_qn) / cycle_length) + 2
                else
                  repetitions = math.ceil((item_end - item_start) / cycle_length) + 2
                end
              end
              for repeat_index = 0, repetitions - 1 do
                local repeated_start, repeated_end = source_start, source_end
                if repeat_index > 0 and cycle_is_qn then
                  local source_start_qn = reaper.TimeMap2_timeToQN(PROJECT, source_start)
                  local source_end_qn = reaper.TimeMap2_timeToQN(PROJECT, source_end)
                  repeated_start = reaper.TimeMap2_QNToTime(
                    PROJECT, source_start_qn + repeat_index * cycle_length
                  )
                  repeated_end = reaper.TimeMap2_QNToTime(
                    PROJECT, source_end_qn + repeat_index * cycle_length
                  )
                elseif repeat_index > 0 then
                  repeated_start = source_start + repeat_index * cycle_length
                  repeated_end = source_end + repeat_index * cycle_length
                end
                local audible_start = math.max(repeated_start, item_start)
                local audible_end = math.min(repeated_end, item_end)
                local clipped_start = math.max(audible_start, start_time)
                local clipped_end = math.min(audible_end, end_time)
                if clipped_end > clipped_start then
                  notes[#notes + 1] = {
                  id = take_id .. ":loop:" .. tostring(repeat_index)
                    .. ":note:" .. tostring(note_index),
                  itemId = item_id, takeId = take_id,
                  pitch = pitch, velocity = velocity / 127.0, channel = channel,
                  startSec = clipped_start - start_time,
                  durationSec = clipped_end - clipped_start,
                  startQn = relative_qn(clipped_start, origin_qn),
                  durationQn = relative_qn(clipped_end, origin_qn)
                    - relative_qn(clipped_start, origin_qn),
                  muted = muted == true,
                }
                end
              end
            end
          end
        end
      end
    end
  end
  table.sort(notes, function(a, b)
    if a.startSec == b.startSec then return a.pitch < b.pitch end
    return a.startSec < b.startSec
  end)
  return #notes > 0 and notes or json.null
end

local function semantic_automation(track, start_time, end_time, sample_rate)
  local mappings = {}
  local dt = 0.02
  local samples_requested = math.max(1, math.floor(sample_rate * dt + 0.5))
  for envelope_index = 0, reaper.CountTrackEnvelopes(track) - 1 do
    local envelope = reaper.GetTrackEnvelope(track, envelope_index)
    local ok, name = reaper.GetEnvelopeName(envelope)
    if ok then
      local key = name:lower():match("^viz:([%w%-]+)$")
        or name:lower():match("%[viz:([%w%-]+)%]")
      if key then
        local values = {}
        local count = math.floor((end_time - start_time) / dt + 0.5) + 1
        for sample_index = 0, count - 1 do
          local time = math.min(end_time, start_time + sample_index * dt)
          local _, value = reaper.Envelope_Evaluate(
            envelope, time, sample_rate, samples_requested
          )
          values[#values + 1] = math.max(0.0, math.min(1.0, value))
        end
        mappings[#mappings + 1] = {
          param = "viz:" .. key,
          source = name,
          curve = { t0 = 0.0, dt = dt, values = values },
        }
      end
    end
  end
  return mappings
end

local function track_snapshot(start_time, end_time, origin_qn)
  local tracks, folder_stack = {}, {}
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    local track = reaper.GetTrack(PROJECT, index)
    local name = track_name(track)
    local id = reaper.GetTrackGUID(track)
    local depth_delta = math.floor(reaper.GetMediaTrackInfo_Value(track, "I_FOLDERDEPTH"))
    local item_count = reaper.CountTrackMediaItems(track)
    local path = {}
    for path_index, value in ipairs(folder_stack) do path[path_index] = value end
    local role = explicit_role(track) or detect_role(name)
    local kind = classify_track(track, name, depth_delta)
    local selected_by_default = kind ~= "utility" and kind ~= "folder"
      and kind ~= "return" and (kind == "source" or item_count > 0 or role ~= "other")
    tracks[#tracks + 1] = {
      index = index, id = id, name = name,
      color = color_hex(reaper.GetTrackColor(track)),
      kind = kind,
      folderPath = path, role = role,
      mediaItemCount = item_count,
      fxCount = reaper.TrackFX_GetCount(track),
      receiveCount = reaper.GetTrackNumSends(track, -1),
      sendCount = reaper.GetTrackNumSends(track, 0),
      selectedByDefault = selected_by_default,
      midi = midi_notes(track, id, start_time, end_time, origin_qn),
      automation = semantic_automation(track, start_time, end_time,
        reaper.GetSetProjectInfo(PROJECT, "PROJECT_SRATE", 0, false) > 0
          and reaper.GetSetProjectInfo(PROJECT, "PROJECT_SRATE", 0, false)
          or 48000),
      stemPlan = {
        path = "stems/" .. slug(name) .. "--" .. sha256.hex(id):sub(1, 8) .. ".wav",
        renderMode = "post-track-fx-post-fader-pre-parent",
      },
    }
    if depth_delta > 0 then
      for _ = 1, depth_delta do folder_stack[#folder_stack + 1] = name end
    elseif depth_delta < 0 then
      for _ = 1, -depth_delta do folder_stack[#folder_stack] = nil end
    end
  end
  return tracks
end

local function write_atomic(path, contents)
  local temporary = path .. ".tmp"
  local handle, message = io.open(temporary, "wb")
  if not handle then error("Cannot write " .. temporary .. ": " .. tostring(message)) end
  handle:write(contents)
  handle:close()
  os.remove(path)
  local ok, rename_error = os.rename(temporary, path)
  if not ok then error("Cannot finalize " .. path .. ": " .. tostring(rename_error)) end
end

local function run(options)
  options = options or {}
  -- This file is also imported by the full-package action. Reset per-run state
  -- so rerunning an imported exporter never carries old warnings forward.
  warnings = {}
  local raw_regions, raw_markers, rv_start, rv_end = marker_inventory()
  local start_time, end_time, range_source = choose_range(rv_start, rv_end)
  local origin_qn = reaper.TimeMap2_timeToQN(PROJECT, start_time)
  local regions, markers = clip_markers(
    raw_regions, raw_markers, start_time, end_time, origin_qn
  )
  local sample_rate = reaper.GetSetProjectInfo(PROJECT, "PROJECT_SRATE", 0, false)
  if sample_rate <= 0 then
    sample_rate = 48000
    warn("Project sample rate is not explicitly set; snapshot assumes 48000 Hz.")
  end
  sample_rate = math.floor(sample_rate + 0.5)
  local name = project_name()
  local snapshot = {
    snapshotVersion = 1,
    extractor = {
      name = "reaper-viz-extractor", version = VERSION,
      reaperVersion = reaper.GetAppVersion(), mode = "read-only-snapshot",
    },
    project = {
      name = name, guid = project_guid(), sampleRate = sample_rate,
      contentDurationSec = end_time - start_time,
      plannedAudioDurationSec = end_time - start_time + TAIL_SEC,
      exportRange = {
        source = range_source, projectStartSec = start_time,
        projectEndSec = end_time, tailSec = TAIL_SEC,
      },
    },
    tempo = tempo_map(start_time, end_time, origin_qn),
    regions = regions, markers = markers,
    tracks = track_snapshot(start_time, end_time, origin_qn),
    warnings = warnings,
  }
  local canonical = json.encode(snapshot, false)
  snapshot.project.snapshotHash = "sha256:" .. sha256.hex(canonical)

  local output_root = REPO_ROOT and (REPO_ROOT .. SEP .. "projects")
    or (reaper.GetResourcePath() .. SEP .. "ReaperViz" .. SEP .. "projects")
  local output_slug = slug(name)
  if name == "Untitled Project" then
    output_slug = output_slug .. "-" .. sha256.hex(snapshot.project.guid):sub(1, 8)
  end
  local output_dir = output_root .. SEP .. output_slug
  reaper.RecursiveCreateDirectory(output_dir, 0)
  local report = {
    reportVersion = 1, valid = true, mode = "read-only-snapshot",
    snapshotPath = "snapshot.json", warningCount = #warnings,
    trackCount = #snapshot.tracks, regionCount = #regions,
    note = "No audio was rendered and no REAPER project state was changed.",
    warnings = warnings,
  }
  write_atomic(output_dir .. SEP .. "snapshot.json", json.encode(snapshot, true) .. "\n")
  write_atomic(output_dir .. SEP .. "snapshot-report.json", json.encode(report, true) .. "\n")

  if not options.silent then
    reaper.ShowConsoleMsg("reaper-viz: snapshot written to " .. output_dir .. "\n")
    for _, message in ipairs(warnings) do
      reaper.ShowConsoleMsg("reaper-viz warning: " .. message .. "\n")
    end
    reaper.MB(
      "Read-only snapshot complete.\n\n" .. tostring(#snapshot.tracks) .. " tracks, "
        .. tostring(#regions) .. " regions, " .. tostring(#warnings) .. " warnings.\n\n"
        .. output_dir .. "\n\nNo audio was rendered and the project was not changed.",
      "reaper-viz extractor E1", 0
    )
  end
  return snapshot, output_dir
end

if rawget(_G, "REAPER_VIZ_IMPORT_ONLY") then
  return { run = run, json = json, sha256 = sha256, version = VERSION }
else
  local ok, message = xpcall(run, debug.traceback)
  if not ok then
    reaper.ShowConsoleMsg("reaper-viz snapshot failed:\n" .. tostring(message) .. "\n")
    reaper.MB(tostring(message), "reaper-viz snapshot failed", 0)
  end
end
