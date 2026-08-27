/* Izriše ikone PNG iz iste risbe kot icon.svg — brez zunanjih odvisnosti.
   Zagon: node tools/make-icons.js
   Chrome za namestitev zahteva rastrski ikoni 192x192 in 512x512. */
var zlib = require('zlib'), fs = require('fs'), path = require('path');

var OUT = path.join(__dirname, '..', 'icons');
var SS = 4;                        // nadvzorčenje za mehke robove

var BG = [0x0d, 0x2a, 0x44];
var PEAK = [0xf3, 0xf5, 0xf8];
var SNOW = [0x7d, 0xd3, 0xfc];
var SUN = [0xf5, 0x9e, 0x0b];

/* Risba je v koordinatah 0..192; njen dejanski obseg je
   x 40..168, y 39..152 (dva vrhova + sonce) — sredina (104, 96). */
var ART = { cx: 104, cy: 96 };

// --------------------------------------------------------------- geometrija
function insideRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  var cx = Math.min(Math.max(x, r), w - r);
  var cy = Math.min(Math.max(y, r), h - r);
  var dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insidePolygon(x, y, pts) {
  var hit = false;
  for (var i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    var xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function insideCircle(x, y, cx, cy, r) {
  var dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// ------------------------------------------------------------------ risanje
/* Platno RGBA s premnoženo prosojnostjo (nezapolnjeno = prosojno). */
function Bitmap(size) {
  this.size = size;
  this.px = new Uint8Array(size * size * 4);
}

Bitmap.prototype.fill = function (test, color) {
  var n = this.size, p = this.px;
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      if (test(x + 0.5, y + 0.5)) {
        var o = (y * n + x) * 4;
        p[o] = color[0]; p[o + 1] = color[1]; p[o + 2] = color[2]; p[o + 3] = 255;
      }
    }
  }
};

/* Povpreči nadvzorčeno sliko na končno velikost in odpravi premnoženje. */
function downsample(big, size) {
  var out = new Uint8Array(size * size * 4), n = big.size, f = n / size, area = f * f;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var r = 0, g = 0, b = 0, a = 0;
      for (var sy = 0; sy < f; sy++) {
        for (var sx = 0; sx < f; sx++) {
          var o = ((y * f + sy) * n + (x * f + sx)) * 4;
          if (big.px[o + 3]) { r += big.px[o]; g += big.px[o + 1]; b += big.px[o + 2]; a += 255; }
        }
      }
      var d = (y * size + x) * 4;
      if (a) {
        out[d] = Math.round(r / (a / 255)); out[d + 1] = Math.round(g / (a / 255));
        out[d + 2] = Math.round(b / (a / 255)); out[d + 3] = Math.round(a / area);
      }
    }
  }
  return out;
}

/* maskable = polno ozadje brez zaobljenih vogalov, risba pomanjšana v varno cono. */
function drawIcon(size, maskable) {
  var n = size * SS, bmp = new Bitmap(n), unit = n / 192;
  var scale = maskable ? 0.82 : 1;
  var ox = maskable ? ART.cx : 96, oy = maskable ? ART.cy : 96;
  function X(u) { return ((u - ox) * scale + 96) * unit; }
  function Y(v) { return ((v - oy) * scale + 96) * unit; }
  var S = scale * unit;

  if (maskable) {
    bmp.fill(function () { return true; }, BG);
  } else {
    bmp.fill(function (x, y) { return insideRoundRect(x, y, n, n, 40 * unit); }, BG);
  }

  // sonce
  bmp.fill(function (x, y) { return insideCircle(x, y, X(150), Y(55), 16 * S); }, SUN);

  // vrh A (večji, levo)
  var peakA = [40, 152, 86, 64, 122, 152];
  var polyA = [];
  for (var i = 0; i < peakA.length; i += 2) polyA.push(X(peakA[i]), Y(peakA[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polyA); }, PEAK);

  // vrh B (manjši, desno, čez vrh A)
  var peakB = [96, 152, 138, 86, 168, 152];
  var polyB = [];
  for (i = 0; i < peakB.length; i += 2) polyB.push(X(peakB[i]), Y(peakB[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polyB); }, PEAK);

  // sneg na vrhu A — pomanjšan trikotnik po istih robovih kot vrh A, da ne štrli čez rob
  var snowA = [71.3, 92.2, 86, 64, 97.5, 92.2];
  var polySA = [];
  for (i = 0; i < snowA.length; i += 2) polySA.push(X(snowA[i]), Y(snowA[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polySA); }, SNOW);

  // sneg na vrhu B — pomanjšan trikotnik po istih robovih kot vrh B
  var snowB = [124.6, 107.1, 138, 86, 147.6, 107.1];
  var polySB = [];
  for (i = 0; i < snowB.length; i += 2) polySB.push(X(snowB[i]), Y(snowB[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polySB); }, SNOW);

  return downsample(bmp, size);
}

// ----------------------------------------------------------------- zapis PNG
var CRC = (function () {
  var t = new Int32Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  var c = -1;
  for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  var head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.slice(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, rgba) {
  var stride = size * 4;
  var raw = Buffer.alloc((stride + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --------------------------------------------------------------------- zagon
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

[
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true }
].forEach(function (spec) {
  var buf = encodePng(spec.size, drawIcon(spec.size, spec.maskable));
  fs.writeFileSync(path.join(OUT, spec.file), buf);
  console.log('  icons/' + spec.file + '  (' + spec.size + 'x' + spec.size + ', ' + Math.round(buf.length / 1024) + ' kB)');
});
