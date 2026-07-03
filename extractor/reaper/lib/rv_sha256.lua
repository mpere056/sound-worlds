local M = {}

local MASK = 0xffffffff
local K = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local function ror(value, bits)
  return ((value >> bits) | (value << (32 - bits))) & MASK
end

local function u32(value)
  return value & MASK
end

function M.hex(message)
  local bytes = {}
  for index = 1, #message do bytes[index] = message:byte(index) end
  local bit_length = #bytes * 8
  bytes[#bytes + 1] = 0x80
  while (#bytes % 64) ~= 56 do bytes[#bytes + 1] = 0 end
  local high = math.floor(bit_length / 2^32)
  local low = bit_length & MASK
  for shift = 24, 0, -8 do bytes[#bytes + 1] = (high >> shift) & 0xff end
  for shift = 24, 0, -8 do bytes[#bytes + 1] = (low >> shift) & 0xff end

  local h = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 }
  local w = {}
  for offset = 1, #bytes, 64 do
    for index = 0, 15 do
      local base = offset + index * 4
      w[index] = ((bytes[base] << 24) | (bytes[base + 1] << 16)
        | (bytes[base + 2] << 8) | bytes[base + 3]) & MASK
    end
    for index = 16, 63 do
      local s0 = ror(w[index - 15], 7) ~ ror(w[index - 15], 18) ~ (w[index - 15] >> 3)
      local s1 = ror(w[index - 2], 17) ~ ror(w[index - 2], 19) ~ (w[index - 2] >> 10)
      w[index] = u32(w[index - 16] + s0 + w[index - 7] + s1)
    end
    local a, b, c, d, e, f, g, hh = table.unpack(h)
    for index = 0, 63 do
      local s1 = ror(e, 6) ~ ror(e, 11) ~ ror(e, 25)
      local ch = (e & f) ~ ((~e) & g)
      local t1 = u32(hh + s1 + ch + K[index + 1] + w[index])
      local s0 = ror(a, 2) ~ ror(a, 13) ~ ror(a, 22)
      local maj = (a & b) ~ (a & c) ~ (b & c)
      local t2 = u32(s0 + maj)
      hh, g, f, e, d, c, b, a = g, f, e, u32(d + t1), c, b, a, u32(t1 + t2)
    end
    local values = { a, b, c, d, e, f, g, hh }
    for index = 1, 8 do h[index] = u32(h[index] + values[index]) end
  end
  local parts = {}
  for index = 1, 8 do parts[index] = string.format("%08x", h[index]) end
  return table.concat(parts)
end

return M
