-- @description reaper-viz: export complete analyzer-ready package (E2-E4)
-- @version 0.2.3
-- @author reaper-viz
-- @about
--   Creates/loads an export plan, renders aligned WAV stems and master using
--   REAPER, restores touched state, then writes manifest.json and report.

local SCRIPT_PATH = debug.getinfo(1, "S").source:sub(2)
local SCRIPT_DIR = SCRIPT_PATH:match("^(.*)[/\\][^/\\]+$")
local REPO_ROOT = SCRIPT_PATH:match("^(.*)[/\\]extractor[/\\]reaper[/\\][^/\\]+$")
local SEP = package.config:sub(1, 1)
local PROJECT = 0
local VERSION = "0.2.3"
local RENDER_ACTION_AUTO_CLOSE = 42230

_G.REAPER_VIZ_IMPORT_ONLY = true
local snapshot_module = dofile(SCRIPT_DIR .. SEP .. "ReaperViz_Export_Snapshot.lua")
_G.REAPER_VIZ_IMPORT_ONLY = nil
local json = snapshot_module.json

local NUMERIC_RENDER_KEYS = {
  "RENDER_SETTINGS", "RENDER_BOUNDSFLAG", "RENDER_STARTPOS", "RENDER_ENDPOS",
  "RENDER_TAILFLAG", "RENDER_TAILMS", "RENDER_ADDTOPROJ", "RENDER_DITHER",
  "RENDER_NORMALIZE", "RENDER_SRATE", "RENDER_CHANNELS",
}
local STRING_RENDER_KEYS = {
  "RENDER_FILE", "RENDER_PATTERN", "RENDER_FORMAT", "RENDER_FORMAT2",
}
local VALID_ROLES = {
  kick=true, snare=true, hats=true, toms=true, percussion=true, bass=true,
  lead=true, keys=true, pads=true, fx=true, vocals=true, other=true,
}

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

local function sanitize_field(value)
  local sanitized = tostring(value or ""):gsub("[\t\r\n]", " ")
  return sanitized
end

local function create_plan(path, snapshot)
  local lines = {
    "# reaper-viz export plan v1",
    "# include<TAB>role<TAB>track-guid<TAB>track-name",
    "# include is 1 or 0; role is kick/snare/hats/toms/percussion/bass/lead/keys/pads/fx/vocals/other",
  }
  local selected = 0
  for _, track in ipairs(snapshot.tracks) do
    local include = track.selectedByDefault and "1" or "0"
    if include == "1" then selected = selected + 1 end
    lines[#lines + 1] = table.concat({
      include, sanitize_field(track.role or "other"),
      sanitize_field(track.id), sanitize_field(track.name),
    }, "\t")
  end
  write_atomic(path, table.concat(lines, "\n") .. "\n")
  return selected
end

local function parse_plan(path)
  local handle = assert(io.open(path, "rb"))
  local plan = {}
  for line in handle:lines() do
    if line:sub(1, 1) ~= "#" and line:match("%S") then
      local include, role, guid, name = line:match("^(.-)\t(.-)\t(.-)\t(.*)$")
      if not include then error("Invalid export-plan line: " .. line) end
      if include ~= "0" and include ~= "1" then error("Plan include must be 0 or 1: " .. line) end
      if not VALID_ROLES[role] then error("Unknown role '" .. role .. "' for " .. name) end
      plan[guid] = { include = include == "1", role = role, name = name }
    end
  end
  handle:close()
  return plan
end

local function find_track(guid)
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    local track = reaper.GetTrack(PROJECT, index)
    if reaper.GetTrackGUID(track) == guid then return track end
  end
  return nil
end

local function capture_state()
  local state = { numeric = {}, strings = {}, selected = {} }
  for _, key in ipairs(NUMERIC_RENDER_KEYS) do
    state.numeric[key] = reaper.GetSetProjectInfo(PROJECT, key, 0, false)
  end
  for _, key in ipairs(STRING_RENDER_KEYS) do
    local _, value = reaper.GetSetProjectInfo_String(PROJECT, key, "", false)
    state.strings[key] = value
  end
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    local track = reaper.GetTrack(PROJECT, index)
    state.selected[reaper.GetTrackGUID(track)] = reaper.IsTrackSelected(track)
  end
  return state
end

local function select_only(track)
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    reaper.SetTrackSelected(reaper.GetTrack(PROJECT, index), false)
  end
  if track then reaper.SetTrackSelected(track, true) end
end

local function restore_state(state)
  for _, key in ipairs(NUMERIC_RENDER_KEYS) do
    reaper.GetSetProjectInfo(PROJECT, key, state.numeric[key], true)
  end
  for _, key in ipairs(STRING_RENDER_KEYS) do
    reaper.GetSetProjectInfo_String(PROJECT, key, state.strings[key], true)
  end
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    local track = reaper.GetTrack(PROJECT, index)
    reaper.SetTrackSelected(track, state.selected[reaper.GetTrackGUID(track)] == true)
  end
  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()

  for _, key in ipairs(NUMERIC_RENDER_KEYS) do
    local current = reaper.GetSetProjectInfo(PROJECT, key, 0, false)
    if math.abs(current - state.numeric[key]) > 1e-9 then return false, key end
  end
  for _, key in ipairs(STRING_RENDER_KEYS) do
    local _, current = reaper.GetSetProjectInfo_String(PROJECT, key, "", false)
    if current ~= state.strings[key] then return false, key end
  end
  for index = 0, reaper.CountTracks(PROJECT) - 1 do
    local track = reaper.GetTrack(PROJECT, index)
    local guid = reaper.GetTrackGUID(track)
    if reaper.IsTrackSelected(track) ~= (state.selected[guid] == true) then
      return false, "track selection " .. guid
    end
  end
  return true
end

local function configure_common(snapshot, directory)
  local range = snapshot.project.exportRange
  reaper.GetSetProjectInfo(PROJECT, "RENDER_BOUNDSFLAG", 0, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_STARTPOS", range.projectStartSec, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_ENDPOS", range.projectEndSec, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_TAILFLAG", 1, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_TAILMS", range.tailSec * 1000, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_ADDTOPROJ", 0, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_DITHER", 16, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_NORMALIZE", 0, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_SRATE", snapshot.project.sampleRate, true)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_CHANNELS", 2, true)
  reaper.GetSetProjectInfo_String(PROJECT, "RENDER_FILE", directory, true)
  reaper.GetSetProjectInfo_String(PROJECT, "RENDER_FORMAT", "evaw", true)
  reaper.GetSetProjectInfo_String(PROJECT, "RENDER_FORMAT2", "", true)
end

local function first_render_target()
  local _, targets = reaper.GetSetProjectInfo_String(PROJECT, "RENDER_TARGETS", "", false)
  local first = targets and targets:match("^([^;]+)") or nil
  return first and first:gsub("/", SEP) or nil
end

local function is_inside(path, directory)
  local lower_path = path:lower():gsub("/", "\\")
  local lower_dir = directory:lower():gsub("/", "\\")
  if lower_dir:sub(-1) ~= "\\" then lower_dir = lower_dir .. "\\" end
  return lower_path:sub(1, #lower_dir) == lower_dir
end

local function file_exists(path)
  local handle = io.open(path, "rb")
  if not handle then return false end
  handle:close()
  return true
end

local function render_candidate_name(name, pattern)
  local lower_name = name:lower()
  local lower_pattern = pattern:lower()
  return lower_name == lower_pattern .. ".wav"
    or lower_name:match("^" .. lower_pattern:gsub("([^%w])", "%%%1") .. "[-_].*%.wav$") ~= nil
end

local function clear_render_candidates(directory, pattern)
  reaper.EnumerateFiles(directory, -1)
  local index = 0
  local paths = {}
  while true do
    local name = reaper.EnumerateFiles(directory, index)
    if not name then break end
    if render_candidate_name(name, pattern) then
      paths[#paths + 1] = directory .. SEP .. name
    end
    index = index + 1
  end
  for _, path in ipairs(paths) do os.remove(path) end
  reaper.EnumerateFiles(directory, -1)
end

local function find_rendered_target(directory, pattern)
  -- Some REAPER builds expose RENDER_TARGETS only after a render has run.
  local reported = first_render_target()
  if reported and reported ~= "" and is_inside(reported, directory) and file_exists(reported) then
    return reported
  end
  local expected = directory .. SEP .. pattern .. ".wav"
  if file_exists(expected) then return expected end
  reaper.EnumerateFiles(directory, -1)
  local index = 0
  while true do
    local name = reaper.EnumerateFiles(directory, index)
    if not name then break end
    if render_candidate_name(name, pattern) then return directory .. SEP .. name end
    index = index + 1
  end
  return nil
end

local function render_one(settings, directory, pattern, track)
  select_only(track)
  reaper.GetSetProjectInfo(PROJECT, "RENDER_SETTINGS", settings, true)
  reaper.GetSetProjectInfo_String(PROJECT, "RENDER_FILE", directory, true)
  reaper.GetSetProjectInfo_String(PROJECT, "RENDER_PATTERN", pattern, true)
  clear_render_candidates(directory, pattern)
  reaper.Main_OnCommand(RENDER_ACTION_AUTO_CLOSE, 0)
  local target = find_rendered_target(directory, pattern)
  if not target then
    error("REAPER render finished but no WAV was found for " .. pattern .. " in " .. directory)
  end
  if not is_inside(target, directory) then
    error("Refusing render target outside package: " .. target)
  end
  return target
end

local function quote_argument(value)
  return '"' .. tostring(value):gsub('"', '\\"') .. '"'
end

local function finalize(output_dir, render_index_path)
  local script = REPO_ROOT .. SEP .. "tools" .. SEP .. "finalize_export.py"
  local command = "python " .. quote_argument(script)
    .. " --snapshot " .. quote_argument(output_dir .. SEP .. "snapshot.json")
    .. " --render-index " .. quote_argument(render_index_path)
  -- REAPER's Lua API returns one string: exit code, newline, then process
  -- output. It does not return the exit code and output as separate values.
  local result = reaper.ExecProcess(command, 600000)
  if not result then error("Package finalizer could not start Python.") end
  local code_text, output = result:match("^([^\r\n]*)\r?\n?(.*)$")
  local exit_code = tonumber(code_text)
  if exit_code == nil then
    error("Package finalizer returned an unreadable result:\n" .. tostring(result))
  end
  if exit_code ~= 0 then
    error("Package finalizer failed (exit " .. tostring(exit_code) .. "):\n" .. tostring(output))
  end
  return output ~= "" and output or "Package finalized successfully."
end

local function run()
  if (reaper.GetPlayState() & 5) ~= 0 then
    error("Stop playback/recording before exporting the package.")
  end
  local snapshot, output_dir = snapshot_module.run({ silent = true })
  local plan_path = output_dir .. SEP .. "export-plan.txt"
  local existing = io.open(plan_path, "rb")
  if existing then
    existing:close()
  else
    local count = create_plan(plan_path, snapshot)
    local choice = reaper.MB(
      "A default export plan was created with " .. tostring(count) .. " tracks selected.\n\n"
        .. plan_path .. "\n\nYes: render it now.\nNo: stop so you can edit the plan, then run this action again.",
      "reaper-viz export plan", 4
    )
    if choice ~= 6 then return end
  end

  local plan = parse_plan(plan_path)
  local selected = {}
  for _, source in ipairs(snapshot.tracks) do
    local entry = plan[source.id]
    if entry and entry.include then
      local track = find_track(source.id)
      if not track then error("Selected track is missing: " .. source.name) end
      local role = entry.role
      -- Plans created by 0.2.0 could contain `other` because its role detector
      -- used regex-style alternation, which Lua patterns do not support.
      if role == "other" and source.role and source.role ~= "other" then
        role = source.role
      end
      selected[#selected + 1] = { source = source, track = track, role = role }
    end
  end
  if #selected == 0 then error("The export plan selects no tracks.") end

  local stems_dir = output_dir .. SEP .. "stems"
  reaper.RecursiveCreateDirectory(stems_dir, 0)
  local saved = capture_state()
  local render_index = { extractorVersion = VERSION, tracks = {}, stateRestored = false }
  local render_ok, render_error
  reaper.PreventUIRefresh(1)
  render_ok, render_error = xpcall(function()
    configure_common(snapshot, stems_dir)
    for position, entry in ipairs(selected) do
      reaper.ShowConsoleMsg("reaper-viz: rendering stem " .. tostring(position) .. "/"
        .. tostring(#selected) .. " - " .. entry.source.name .. "\n")
      local pattern = entry.source.stemPlan.path:match("([^/\\]+)%.wav$")
      local target = render_one(2, stems_dir, pattern, entry.track)
      render_index.tracks[#render_index.tracks + 1] = {
        id = entry.source.id, role = entry.role, path = target,
      }
    end
    reaper.ShowConsoleMsg("reaper-viz: rendering master\n")
    render_index.master = render_one(0, output_dir, "master", nil)
  end, debug.traceback)
  local restored, restore_key = restore_state(saved)
  render_index.stateRestored = restored
  reaper.PreventUIRefresh(-1)
  if not restored then error("Could not restore REAPER setting: " .. tostring(restore_key)) end
  if not render_ok then error(render_error) end

  local render_index_path = output_dir .. SEP .. "render-index.json"
  write_atomic(render_index_path, json.encode(render_index, true) .. "\n")
  local finalizer_output = finalize(output_dir, render_index_path)
  reaper.ShowConsoleMsg(finalizer_output .. "\n")
  reaper.MB(
    "Complete reaper-viz package exported and validated.\n\n"
      .. tostring(#selected) .. " stems + master WAV\n\n" .. output_dir,
    "reaper-viz extractor", 0
  )
end

local ok, message = xpcall(run, debug.traceback)
if not ok then
  reaper.ShowConsoleMsg("reaper-viz export failed:\n" .. tostring(message) .. "\n")
  reaper.MB(tostring(message), "reaper-viz export failed", 0)
end
