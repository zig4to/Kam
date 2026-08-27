/* Izriše ikone PNG iz iste risbe kot icon.svg — brez zunanjih odvisnosti.
   Zagon: node tools/make-icons.js
   Chrome za namestitev zahteva rastrski ikoni 192x192 in 512x512. */
var zlib = require('zlib'), fs = require('fs'), path = require('path');

var OUT = path.join(__dirname, '..', 'icons');
var SS = 4;                        // nadvzorčenje za mehke robove

var GRAD_START = [0x38, 0xbd, 0xf8];   // sky-blue
var GRAD_END = [0x0f, 0x76, 0x6e];     // teal
var PEAK = [0xf3, 0xf5, 0xf8];
var SNOW = [0x7d, 0xd3, 0xfc];

/* Risba (zaprt greben + dve snežni kapi) je v koordinatah 0..192;
   njen dejanski obseg je x 32..160, y 48..140 — sredina (96, 94). */
var ART = { cx: 96, cy: 94 };

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

/* Diagonalen preliv (ujema SVG linearGradient 14.7%,6.4% -> 85.3%,93.6%). */
function gradColor(x, y, n) {
  var gx1 = 0.147 * n, gy1 = 0.064 * n, gx2 = 0.853 * n, gy2 = 0.936 * n;
  var dx = gx2 - gx1, dy = gy2 - gy1, len2 = dx * dx + dy * dy;
  var t = len2 ? ((x - gx1) * dx + (y - gy1) * dy) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  return [
    Math.round(GRAD_START[0] + (GRAD_END[0] - GRAD_START[0]) * t),
    Math.round(GRAD_START[1] + (GRAD_END[1] - GRAD_START[1]) * t),
    Math.round(GRAD_START[2] + (GRAD_END[2] - GRAD_START[2]) * t)
  ];
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

/* Kot fill, a barvo za vsak piksel izračuna colorFn (za preliv). */
Bitmap.prototype.fillFn = function (test, colorFn) {
  var n = this.size, p = this.px;
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      if (test(x + 0.5, y + 0.5)) {
        var c = colorFn(x + 0.5, y + 0.5);
        var o = (y * n + x) * 4;
        p[o] = c[0]; p[o + 1] = c[1]; p[o + 2] = c[2]; p[o + 3] = 255;
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

  var bgTest = maskable
    ? function () { return true; }
    : function (x, y) { return insideRoundRect(x, y, n, n, 40 * unit); };
  bmp.fillFn(bgTest, function (x, y) { return gradColor(x, y, n); });

  // zaprt greben (isti potek kot pot v icon.svg, a zaprt na dnu) — polno bel
  var ridge = [32, 140, 72, 64, 96, 96, 120, 48, 160, 140];
  var polyRidge = [];
  for (var i = 0; i < ridge.length; i += 2) polyRidge.push(X(ridge[i]), Y(ridge[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polyRidge); }, PEAK);

  // snežna kapa na vrhu 1 — pomanjšan trikotnik po robovih vrha, ne štrli čez rob
  var snow1 = [65.26, 76.8, 72, 64, 81.6, 76.8];
  var polySnow1 = [];
  for (i = 0; i < snow1.length; i += 2) polySnow1.push(X(snow1[i]), Y(snow1[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polySnow1); }, SNOW);

  // snežna kapa na vrhu 2
  var snow2 = [113.6, 60.8, 120, 48, 125.57, 60.8];
  var polySnow2 = [];
  for (i = 0; i < snow2.length; i += 2) polySnow2.push(X(snow2[i]), Y(snow2[i + 1]));
  bmp.fill(function (x, y) { return insidePolygon(x, y, polySnow2); }, SNOW);

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
