const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const BRAND = [0x53, 0x4a, 0xb7] // #534AB7
const WHITE = [0xff, 0xff, 0xff]

function crc32(buf) {
  if (!crc32.table) {
    const table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      table[n] = c
    }
    crc32.table = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
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
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idatData = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))])
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLen2 = abx * abx + aby * aby
  let t = abLen2 === 0 ? 0 : (apx * abx + apy * aby) / abLen2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

function drawIcon(size, { padding = 0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BRAND[0]
    rgba[i * 4 + 1] = BRAND[1]
    rgba[i * 4 + 2] = BRAND[2]
    rgba[i * 4 + 3] = 255
  }

  const inner = size - padding * 2
  const x0 = padding + inner * 0.1
  const x4 = padding + inner * 0.9
  const spanX = x4 - x0
  const yTop = padding + inner * 0.3
  const yBottom = padding + inner * 0.7
  const yMid = padding + inner * 0.5
  const points = [
    [x0, yTop],
    [x0 + spanX * 0.25, yBottom],
    [x0 + spanX * 0.5, yMid],
    [x0 + spanX * 0.75, yBottom],
    [x4, yTop],
  ]
  const thickness = inner * 0.12

  const minX = Math.max(0, Math.floor(x0 - thickness))
  const maxX = Math.min(size, Math.ceil(x4 + thickness))
  const minY = Math.max(0, Math.floor(yTop - thickness))
  const maxY = Math.min(size, Math.ceil(yBottom + thickness))

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      let minDist = Infinity
      for (let i = 0; i < points.length - 1; i++) {
        const d = distToSegment(x, y, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
        if (d < minDist) minDist = d
      }
      if (minDist <= thickness / 2) {
        const idx = (y * size + x) * 4
        rgba[idx] = WHITE[0]
        rgba[idx + 1] = WHITE[1]
        rgba[idx + 2] = WHITE[2]
        rgba[idx + 3] = 255
      }
    }
  }

  return encodePNG(size, size, rgba)
}

const iconsDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(iconsDir, { recursive: true })

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), drawIcon(192, { padding: 0 }))
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), drawIcon(512, { padding: 0 }))
fs.writeFileSync(path.join(iconsDir, 'icon-192-maskable.png'), drawIcon(192, { padding: 192 * 0.15 }))
fs.writeFileSync(path.join(iconsDir, 'icon-512-maskable.png'), drawIcon(512, { padding: 512 * 0.15 }))
fs.writeFileSync(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'), drawIcon(180, { padding: 180 * 0.08 }))

console.log('Icônes générées dans public/icons/ et public/apple-touch-icon.png')
