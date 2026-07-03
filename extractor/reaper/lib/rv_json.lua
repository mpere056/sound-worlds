local M = {}

M.null = setmetatable({}, { __tostring = function() return "null" end })

local function escape(value)
  local replacements = {
    ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
    ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
  }
  return value:gsub('[%z\1-\31\\"]', function(char)
    return replacements[char] or string.format('\\u%04x', char:byte())
  end)
end

local function array_length(value)
  local max_index = 0
  local count = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      return nil
    end
    max_index = math.max(max_index, key)
    count = count + 1
  end
  if max_index ~= count then return nil end
  return max_index
end

local function encode(value, depth, pretty)
  local kind = type(value)
  if value == M.null then return "null" end
  if kind == "nil" then return "null" end
  if kind == "boolean" then return value and "true" or "false" end
  if kind == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      error("JSON cannot encode a non-finite number")
    end
    return string.format("%.15g", value)
  end
  if kind == "string" then return '"' .. escape(value) .. '"' end
  if kind ~= "table" then error("JSON cannot encode " .. kind) end

  local indent = pretty and string.rep("  ", depth) or ""
  local child_indent = pretty and string.rep("  ", depth + 1) or ""
  local separator = pretty and ",\n" or ","
  local colon = pretty and ": " or ":"
  local length = array_length(value)
  local parts = {}
  if length then
    for index = 1, length do
      parts[#parts + 1] = child_indent .. encode(value[index], depth + 1, pretty)
    end
    if #parts == 0 then return "[]" end
    return "[" .. (pretty and "\n" or "") .. table.concat(parts, separator)
      .. (pretty and "\n" .. indent or "") .. "]"
  end

  local keys = {}
  for key in pairs(value) do
    if type(key) ~= "string" then error("JSON object keys must be strings") end
    keys[#keys + 1] = key
  end
  table.sort(keys)
  for _, key in ipairs(keys) do
    parts[#parts + 1] = child_indent .. '"' .. escape(key) .. '"' .. colon
      .. encode(value[key], depth + 1, pretty)
  end
  if #parts == 0 then return "{}" end
  return "{" .. (pretty and "\n" or "") .. table.concat(parts, separator)
    .. (pretty and "\n" .. indent or "") .. "}"
end

function M.encode(value, pretty)
  return encode(value, 0, pretty == true)
end

return M
