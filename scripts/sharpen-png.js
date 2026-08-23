const zlib = require('zlib')
const fs = require('fs')

const BRAND = null // unused

function crc32(buf) {
  if (!crc32.table) {
    const table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    crc32.table = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idatData = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))])
}

function decodePNG(buf) {
  let offset = 8
  let width, height, bitDepth, colorType
  const idatChunks = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idatChunks.push(data)
    offset += 8 + len + 4
    if (type === 'IEND') break
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks))
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  const bpp = Math.ceil((bitDepth * channels) / 8)
  const stride = Math.ceil((width * bitDepth * channels) / 8)
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos]
    pos++
    const rowStart = y * stride
    const prevRowStart = (y - 1) * stride
    for (let x = 0; x < stride; x++) {
      const rb = raw[pos + x]
      const a = x >= bpp ? out[rowStart + x - bpp] : 0
      const b = y > 0 ? out[prevRowStart + x] : 0
      const c = y > 0 && x >= bpp ? out[prevRowStart + x - bpp] : 0
      let val
      if (filter === 0) val = rb
      else if (filter === 1) val = rb + a
      else if (filter === 2) val = rb + b
      else if (filter === 3) val = rb + Math.floor((a + b) / 2)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        val = rb + pr
      } else val = rb
      out[rowStart + x] = val & 0xff
    }
    pos += stride
  }
  return { width, height, channels, rgba: out }
}

function toRGBA(width, height, channels, buf) {
  if (channels === 4) return Buffer.from(buf)
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (channels === 3) {
      rgba[i * 4] = buf[i * 3]
      rgba[i * 4 + 1] = buf[i * 3 + 1]
      rgba[i * 4 + 2] = buf[i * 3 + 2]
      rgba[i * 4 + 3] = 255
    } else if (channels === 1) {
      rgba[i * 4] = buf[i]
      rgba[i * 4 + 1] = buf[i]
      rgba[i * 4 + 2] = buf[i]
      rgba[i * 4 + 3] = 255
    }
  }
  return rgba
}

// Unsharp mask : flou gaussien 3x3 puis original + strength * (original - flou)
function sharpen(width, height, rgba, strength) {
  const kernel = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ]
  const kernelSum = 16
  const blurred = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(width - 1, Math.max(0, x + kx))
          const sy = Math.min(height - 1, Math.max(0, y + ky))
          const idx = (sy * width + sx) * 4
          const w = kernel[ky + 1][kx + 1]
          r += rgba[idx] * w
          g += rgba[idx + 1] * w
          b += rgba[idx + 2] * w
        }
      }
      const idx = (y * width + x) * 4
      blurred[idx] = r / kernelSum
      blurred[idx + 1] = g / kernelSum
      blurred[idx + 2] = b / kernelSum
      blurred[idx + 3] = rgba[idx + 3]
    }
  }

  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    for (let c = 0; c < 3; c++) {
      const orig = rgba[idx + c]
      const blur = blurred[idx + c]
      const val = orig + strength * (orig - blur)
      out[idx + c] = Math.min(255, Math.max(0, Math.round(val)))
    }
    out[idx + 3] = rgba[idx + 3]
  }
  return out
}

const file = process.argv[2]
const strength = parseFloat(process.argv[3] || '0.6')
const buf = fs.readFileSync(file)
const { width, height, channels, rgba: raw } = decodePNG(buf)
const rgba = toRGBA(width, height, channels, raw)
const sharpened = sharpen(width, height, rgba, strength)
fs.writeFileSync(file, encodePNG(width, height, sharpened))
console.log(`Sharpened ${file} (${width}x${height}, strength ${strength})`)
