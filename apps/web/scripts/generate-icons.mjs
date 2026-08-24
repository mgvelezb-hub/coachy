/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 *
 * Dibuja el monograma de Coachy en la identidad Holy Gains — una "C" abierta
 * sobre un cuadrado redondeado ciruela, con el trazo degradado de violeta a
 * rosa — rasterizando con campos de distancia y codificando el PNG a mano con
 * zlib. Correr con: `node scripts/generate-icons.mjs`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Fondo: ciruela oscuro → berenjena. Glifo: violeta → rosa.
const PLUM = [26, 16, 38];
const PLUM_DEEP = [44, 20, 66];
const VIOLET = [140, 92, 246];
const PINK = [236, 72, 153];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Cobertura antialias: 1 dentro, 0 fuera, gradiente de 1px en el borde. */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  // El icono maskable necesita 10% de margen seguro alrededor del glifo.
  const glyphScale = maskable ? 0.62 : 0.78;
  const radius = size * 0.22;
  const ringOuter = (size * glyphScale) / 2;
  const ringWidth = size * glyphScale * 0.19;
  const ringInner = ringOuter - ringWidth;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Fondo: cuadrado redondeado (maskable = cuadrado completo).
      const dx = Math.max(Math.abs(px - c) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(py - c) - (size / 2 - radius), 0);
      const bgDistance = maskable ? -1 : Math.hypot(dx, dy) - radius;
      const bgAlpha = coverage(bgDistance);

      // Degradado diagonal sutil en el fondo (ciruela → berenjena).
      const t = (px + py) / (2 * size);
      let color = mix(PLUM, PLUM_DEEP, t);

      // Glifo: anillo con una abertura a la derecha → "C".
      const r = Math.hypot(px - c, py - c);
      const angle = Math.atan2(py - c, px - c); // -PI..PI
      const inGap = Math.abs(angle) < Math.PI / 5;
      const ringDistance = Math.max(r - ringOuter, ringInner - r);
      const glyphAlpha = inGap ? 0 : coverage(ringDistance);

      // El trazo va de violeta (arriba-izquierda) a rosa (abajo-derecha).
      if (glyphAlpha > 0) color = mix(color, mix(VIOLET, PINK, t), glyphAlpha);

      const offset = (y * size + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = Math.round(255 * bgAlpha);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
  { file: "favicon-32.png", size: 32, maskable: false },
];

for (const target of targets) {
  const png = render(target.size, { maskable: target.maskable });
  writeFileSync(join(OUT_DIR, target.file), png);
  console.log(`${target.file}  ${target.size}x${target.size}  ${png.length} bytes`);
}
