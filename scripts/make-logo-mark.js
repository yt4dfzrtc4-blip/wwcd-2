const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

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

const SRC = path.join(__dirname, '..', 'public', 'logo-source.png')
const OUT = path.join(__dirname, '..', 'public', 'logo-mark.png')
const BG = [241, 226, 189] // couleur de fond du logo

const buf = fs.readFileSync(SRC)
const { width, height, rgba } = decodePNG(buf)

// Rend transparent tout ce qui est proche de la couleur de fond, en gardant
// une transition douce sur les pixels anti-aliasés entre lettre et fond.
const NEAR = 18 // distance en dessous = fond -> transparent
const FAR = 55 // distance au-dessus = trait -> opaque

const out = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) {
  const idx = i * 4
  const r = rgba[idx]
  const g = rgba[idx + 1]
  const b = rgba[idx + 2]
  const dist = Math.sqrt((r - BG[0]) ** 2 + (g - BG[1]) ** 2 + (b - BG[2]) ** 2)
  let alpha
  if (dist <= NEAR) alpha = 0
  else if (dist >= FAR) alpha = 255
  else alpha = Math.round(((dist - NEAR) / (FAR - NEAR)) * 255)
  out[idx] = r
  out[idx + 1] = g
  out[idx + 2] = b
  out[idx + 3] = alpha
}

// Bounding box des pixels non transparents
let minX = width,
  maxX = 0,
  minY = height,
  maxY = 0
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4
    if (out[idx + 3] > 10) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}

const margin = 4
minX = Math.max(0, minX - margin)
minY = Math.max(0, minY - margin)
maxX = Math.min(width - 1, maxX + margin)
maxY = Math.min(height - 1, maxY + margin)

const cropW = maxX - minX + 1
const cropH = maxY - minY + 1
const cropped = Buffer.alloc(cropW * cropH * 4)
for (let y = 0; y < cropH; y++) {
  const srcRow = (minY + y) * width + minX
  const dstRow = y * cropW
  out.copy(cropped, dstRow * 4, srcRow * 4, (srcRow + cropW) * 4)
}

fs.writeFileSync(OUT, encodePNG(cropW, cropH, cropped))
console.log(`logo-mark.png généré : ${cropW}x${cropH} (bbox source ${minX},${minY} -> ${maxX},${maxY})`)
