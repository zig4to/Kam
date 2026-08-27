(function () {
  var map = L.map('map', { zoomControl: true }).setView([46.05, 14.5], 9); // Ljubljana / Slovenija

  L.tileLayer('https://tiles.bergfex.at/styles/bergfex-osm/{z}/{x}/{y}.jpg', {
    maxZoom: 18,
    minZoom: 5,
    attribution: '&copy; <a href="https://www.bergfex.at">Bergfex</a>, OpenStreetMap contributors'
  }).addTo(map);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js');
    });
  }

  // ------------------------------------------------------------- elementi
  var startOverlay = document.getElementById('startOverlay');
  var btnCompass = document.getElementById('btnCompass');
  var btnCurrentLocation = document.getElementById('btnCurrentLocation');
  var btnPickOnMap = document.getElementById('btnPickOnMap');
  var btnStartCancel = document.getElementById('btnStartCancel');
  var hintToast = document.getElementById('hintToast');
  var radiusPanel = document.getElementById('radiusPanel');
  var radiusSlider = document.getElementById('radiusSlider');
  var radiusValue = document.getElementById('radiusValue');
  var btnRadiusCancel = document.getElementById('btnRadiusCancel');
  var btnRadiusConfirm = document.getElementById('btnRadiusConfirm');
  var radiusPresets = document.getElementById('radiusPresets');
  var savedGrid = document.getElementById('savedGrid');
  var savedEmpty = document.getElementById('savedEmpty');

  var startMarker = null;
  var previewCircle = null;
  var resultMarker = null;
  var pendingStart = null;
  var toastTimer = null;
  var radiusStepToken = 0;

  // ---------------------------------------------------------------- ikone
  function pinIcon(color) {
    return L.divIcon({
      className: '',
      html:
        '<svg viewBox="0 0 24 24" width="34" height="34" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M12 22s7-7.5 7-12.5A7 7 0 1 0 5 9.5C5 14.5 12 22 12 22Z" fill="' + color + '" stroke="#12151b" stroke-width="1"/>' +
        '<circle cx="12" cy="9.5" r="2.4" fill="#12151b"/>' +
        '</svg>',
      iconSize: [34, 34],
      iconAnchor: [17, 32]
    });
  }
  var startIcon = pinIcon('#38bdf8');
  var resultIcon = pinIcon('#f59e0b');

  // --------------------------------------------------------------- pomoč
  function showToast(text, duration) {
    hintToast.textContent = text;
    hintToast.hidden = false;
    clearTimeout(toastTimer);
    if (duration) toastTimer = setTimeout(function () { hintToast.hidden = true; }, duration);
  }
  function hideToast() { hintToast.hidden = true; clearTimeout(toastTimer); }

  function openStartOverlay() { startOverlay.classList.add('open'); }
  function closeStartOverlay() { startOverlay.classList.remove('open'); }

  function formatRadius(m) {
    return m < 1000 ? (m + ' m') : ((m / 1000).toFixed(1).replace(/\.0$/, '') + ' km');
  }

  /* Enakomerno naključna točka znotraj kroga (polarne koordinate, sqrt za enakomerno gostoto). */
  function randomPointInCircle(lat, lng, radiusMeters) {
    var w = radiusMeters * Math.sqrt(Math.random());
    var t = 2 * Math.PI * Math.random();
    var dx = w * Math.cos(t), dy = w * Math.sin(t);
    var dLat = dy / 111320;
    var dLng = dx / (111320 * Math.cos(lat * Math.PI / 180));
    return [lat + dLat, lng + dLng];
  }

  // ------------------------------------------------------- korak 1: izhodišče
  btnCompass.addEventListener('click', function () {
    if (resultMarker) { map.removeLayer(resultMarker); resultMarker = null; }
    openStartOverlay();
  });

  btnStartCancel.addEventListener('click', closeStartOverlay);

  btnCurrentLocation.addEventListener('click', function () {
    closeStartOverlay();
    if (!('geolocation' in navigator)) {
      showToast('Naprava ne podpira lokacije.', 3000);
      return;
    }
    showToast('Iščem trenutno lokacijo …');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        hideToast();
        beginRadiusStep([pos.coords.latitude, pos.coords.longitude]);
      },
      function () {
        showToast('Dostop do lokacije ni bil dovoljen.', 3000);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  btnPickOnMap.addEventListener('click', function () {
    closeStartOverlay();
    showToast('Klikni točko na zemljevidu');
    map.once('click', function (e) {
      hideToast();
      beginRadiusStep([e.latlng.lat, e.latlng.lng]);
    });
  });

  // --------------------------------------------------------- korak 2: radij
  function beginRadiusStep(latlng) {
    pendingStart = latlng;

    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker(latlng, { icon: startIcon }).addTo(map);

    var radius = parseInt(radiusSlider.value, 10);
    if (previewCircle) map.removeLayer(previewCircle);
    previewCircle = L.circle(latlng, {
      radius: radius,
      color: '#38bdf8',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.12
    }).addTo(map);

    radiusValue.textContent = formatRadius(radius);
    syncPresetActive(radius);
    radiusPanel.hidden = false;
    map.flyTo(latlng, Math.max(map.getZoom(), 11));
    map.once('moveend', function () { map.fitBounds(previewCircle.getBounds(), { padding: [40, 40] }); });
  }

  // prednastavljene vrednosti radija (km)
  var RADIUS_PRESETS = [5, 10, 20, 30, 40, 50, 80, 100];
  var presetButtons = RADIUS_PRESETS.map(function (km) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radius-preset-btn';
    btn.textContent = km + ' km';
    btn.dataset.meters = km * 1000;
    btn.addEventListener('click', function () { setRadius(km * 1000); });
    radiusPresets.appendChild(btn);
    return btn;
  });

  function syncPresetActive(meters) {
    presetButtons.forEach(function (btn) {
      btn.classList.toggle('active', Number(btn.dataset.meters) === meters);
    });
  }

  function setRadius(meters) {
    radiusSlider.value = meters;
    radiusValue.textContent = formatRadius(meters);
    if (previewCircle) previewCircle.setRadius(meters);
    syncPresetActive(meters);
  }

  radiusSlider.addEventListener('input', function () {
    var radius = parseInt(radiusSlider.value, 10);
    radiusValue.textContent = formatRadius(radius);
    if (previewCircle) previewCircle.setRadius(radius);
    syncPresetActive(radius);
  });

  // način izbire cilja: naključna točka ali označena točka na zemljevidu
  function pickMode() {
    var checked = document.querySelector('input[name="pickMode"]:checked');
    return checked ? checked.value : 'random';
  }

  var OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Ena poizvedba na Overpass. Odjemalčev rok (35 s) je namenoma nad
     strežnikovim ([timeout:25] + režijski stroški), da ne prekinemo zahteve,
     ki bi čez trenutek uspela — deluje le kot varovalka proti pravemu obvisu. */
  function overpassRequest(query, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 35000);
    return fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) { var err = new Error('overpass ' + res.status); err.status = res.status; throw err; }
      return res.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* Poizvede izključno VRHOVE z imenom (natural=peak + name) iz OpenStreetMap
     prek javnega Overpass API-ja — to so točke, ki so na zemljevidu narisane s
     trikotnikom in napisanim imenom. Bergfex ploščice so le slike brez
     poizvedljivih podatkov, zato za to potrebujemo ločen vir.
     Vrhovi so v OSM praktično vedno vozlišča, zato poizvedujemo samo po
     `node` (ne `nwr`) — to preskoči poti in relacije in je opazno hitrejše.
     Izpis mora biti `out body` in NE `out tags`: slednji vrne le oznake brez
     lat/lon, kar bi pomenilo, da nobenega zadetka ne moremo postaviti na
     zemljevid. Javni strežnik dovoli le 2 sočasni zahtevi na IP, zato ob 429
     enkrat počakamo in poskusimo znova. */
  function queryMarkedPoint(lat, lng, radiusMeters) {
    var query = '[out:json][timeout:25];' +
      'node["natural"="peak"]["name"](around:' + radiusMeters + ',' + lat + ',' + lng + ');' +
      'out body 1000;';

    return overpassRequest(query).catch(function (err) {
      if (err.status === 429) return sleep(2500).then(function () { return overpassRequest(query); });
      throw err;
    }).then(function (data) {
      var elements = (data.elements || []).filter(function (el) {
        return el.tags && el.tags.name && el.lat != null;
      });
      if (!elements.length) return { status: 'empty' };
      var pick = elements[Math.floor(Math.random() * elements.length)];
      var plat = pick.lat;
      var plng = pick.lon;
      var ele = parseFloat(pick.tags.ele);
      var label = pick.tags.name + (isFinite(ele) ? ' (' + Math.round(ele) + ' m)' : '');
      return { status: 'ok', lat: plat, lng: plng, name: label };
    }).catch(function () { return { status: 'error' }; });
  }

  function endRadiusStep() {
    radiusStepToken++;
    radiusPanel.hidden = true;
    if (previewCircle) { map.removeLayer(previewCircle); previewCircle = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    pendingStart = null;
  }

  btnRadiusCancel.addEventListener('click', endRadiusStep);

  function showResult(point, name) {
    if (resultMarker) map.removeLayer(resultMarker);
    resultMarker = L.marker(point, { icon: resultIcon }).addTo(map);
    map.flyTo(point, 14);
    openResultPopup(point[0], point[1], name);
    if (name) showToast('Izbrano: ' + name, 3000);
  }

  btnRadiusConfirm.addEventListener('click', function () {
    if (!pendingStart) return;
    var radius = parseInt(radiusSlider.value, 10);
    var start = pendingStart;

    if (pickMode() === 'marked') {
      var token = radiusStepToken;
      btnRadiusConfirm.disabled = true;
      btnRadiusConfirm.textContent = radius > 20000 ? 'Iščem (lahko traja do 30 s) …' : 'Iščem …';
      queryMarkedPoint(start[0], start[1], radius).then(function (found) {
        btnRadiusConfirm.disabled = false;
        btnRadiusConfirm.textContent = 'Potrdi';
        if (token !== radiusStepToken) return; // preklicano medtem
        endRadiusStep();
        if (found.status === 'ok') {
          showResult([found.lat, found.lng], found.name);
        } else if (found.status === 'empty') {
          showToast('Ni vrhov v tem radiju, izbrana naključna točka.', 3500);
          showResult(randomPointInCircle(start[0], start[1], radius));
        } else {
          showToast('Iskanje vrhov ni uspelo, izbrana naključna točka.', 3500);
          showResult(randomPointInCircle(start[0], start[1], radius));
        }
      });
      return;
    }

    var point = randomPointInCircle(start[0], start[1], radius);
    endRadiusStep();
    showResult(point);
  });

  // ------------------------------------------------- shranjene točke: podatki
  var STORAGE_KEY = 'kam-saved-points';
  var THUMB_ZOOM = 14, THUMB_W = 320, THUMB_H = 200;

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function persistSaved(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  /* Slippy-map projekcija (Web Mercator) za pretvorbo lat/lng v koordinate ploščic. */
  function deg2num(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = (lng + 180) / 360 * n;
    var latRad = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x: x, y: y };
  }

  function tileUrl(z, x, y) {
    return 'https://tiles.bergfex.at/styles/bergfex-osm/' + z + '/' + x + '/' + y + '.jpg';
  }

  function loadTile(z, x, y, col, row) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve({ img: img, col: col, row: row }); };
      img.onerror = function () { resolve({ img: null, col: col, row: row }); };
      img.src = tileUrl(z, x, y);
    });
  }

  /* Nariše pin (kapljica s konico v točki) — enaka oblika in barva kot
     označevalec rezultata na zemljevidu, da je sličica takoj prepoznavna. */
  function drawPin(ctx, x, y) {
    var r = 7.5, cy = y - 14;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, cy, r, 0.7 * Math.PI, 0.3 * Math.PI, false);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#12151b';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, cy, 2.8, 0, 2 * Math.PI);
    ctx.fillStyle = '#12151b';
    ctx.fill();
    ctx.restore();
  }

  /* Sestavi 3x3 mrežo ploščic, izreže sličico okoli izbrane točke in nanjo
     nariše pin. Izrez je pri robu sveta lahko zamaknjen (clamp), zato pin
     položimo na dejanski odmik točke znotraj izreza, ne kar na sredino. */
  function makeThumbnail(lat, lng) {
    var p = deg2num(lat, lng, THUMB_ZOOM);
    var tx0 = Math.floor(p.x) - 1, ty0 = Math.floor(p.y) - 1;
    var localX = (p.x - tx0) * 256, localY = (p.y - ty0) * 256;

    var jobs = [];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        jobs.push(loadTile(THUMB_ZOOM, tx0 + col, ty0 + row, col, row));
      }
    }

    return Promise.all(jobs).then(function (tiles) {
      var big = document.createElement('canvas');
      big.width = 768; big.height = 768;
      var bctx = big.getContext('2d');
      tiles.forEach(function (t) {
        if (t.img) bctx.drawImage(t.img, t.col * 256, t.row * 256);
      });

      var sx = Math.min(Math.max(localX - THUMB_W / 2, 0), 768 - THUMB_W);
      var sy = Math.min(Math.max(localY - THUMB_H / 2, 0), 768 - THUMB_H);

      var out = document.createElement('canvas');
      out.width = THUMB_W; out.height = THUMB_H;
      var octx = out.getContext('2d');
      octx.drawImage(big, sx, sy, THUMB_W, THUMB_H, 0, 0, THUMB_W, THUMB_H);
      drawPin(octx, localX - sx, localY - sy);
      try { return out.toDataURL('image/jpeg', 0.75); }
      catch (e) { return null; }
    });
  }

  /* Razdalja v metrih (ekvirektangularna aproksimacija — na teh razdaljah
     povsem zadošča in je bistveno cenejša od haversine). */
  function distanceMeters(lat1, lng1, lat2, lng2) {
    var dLat = (lat2 - lat1) * 111320;
    var dLng = (lng2 - lng1) * 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  /* Poišče najbližji poimenovani vrh ali kraj kot opis točke. Uporabi se le
     za naključno vržene točke — pri izbranem vrhu ime že poznamo.
     Rok je kratek (8 s): opis je le prijeten dodatek, shranjevanje pa se
     zaradi njega ne sme zatakniti — brez opisa se točka shrani takoj. */
  function describePoint(lat, lng) {
    var q = '[out:json][timeout:8];(' +
      'node["natural"="peak"]["name"](around:5000,' + lat + ',' + lng + ');' +
      'node["place"~"^(city|town|village|hamlet)$"]["name"](around:5000,' + lat + ',' + lng + ');' +
      ');out body 80;';

    return overpassRequest(q, 8000).then(function (data) {
      var best = null, bestDist = Infinity;
      (data.elements || []).forEach(function (el) {
        if (!el.tags || !el.tags.name || el.lat == null) return;
        var d = distanceMeters(lat, lng, el.lat, el.lon);
        if (d < bestDist) { bestDist = d; best = el; }
      });
      if (!best) return null;
      var ele = parseFloat(best.tags.ele);
      var name = best.tags.name + (isFinite(ele) ? ' (' + Math.round(ele) + ' m)' : '');
      return bestDist < 150 ? name : name + ' — ' + formatRadius(Math.round(bestDist));
    }).catch(function () { return null; });
  }

  // -------------------------------------------------- rezultat: popup okno
  function buildResultPopup(lat, lng, knownName) {
    var text = lat.toFixed(5) + ', ' + lng.toFixed(5);
    var wrap = document.createElement('div');
    wrap.className = 'result-popup';

    if (knownName) {
      var title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = knownName;
      wrap.appendChild(title);
    }

    var coords = document.createElement('div');
    coords.className = 'popup-coords';
    coords.textContent = text;
    wrap.appendChild(coords);

    var feedback = document.createElement('div');
    feedback.className = 'popup-copied';
    wrap.appendChild(feedback);

    coords.addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(text).then(function () {
        feedback.textContent = 'Kopirano';
        setTimeout(function () { feedback.textContent = ''; }, 1500);
      }, function () {
        feedback.textContent = 'Kopiranje ni uspelo';
      });
    });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'popup-save-btn';
    saveBtn.type = 'button';
    saveBtn.textContent = 'Shrani';
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Shranjujem …';
      /* Pri izbranem vrhu ime že imamo; pri naključni točki poiščemo najbližji
         vrh ali kraj. Če opis ne uspe, točko vseeno shranimo — le brez opisa. */
      var namePromise = knownName ? Promise.resolve(knownName) : describePoint(lat, lng);
      Promise.all([makeThumbnail(lat, lng), namePromise]).then(function (r) {
        var list = loadSaved();
        list.push({ id: Date.now(), lat: lat, lng: lng, thumb: r[0], name: r[1] || null, created: Date.now() });
        var ok = persistSaved(list);
        renderSavedGrid();
        saveBtn.disabled = false;
        saveBtn.textContent = ok ? 'Shranjeno ✓' : 'Napaka pri shranjevanju';
        setTimeout(function () { saveBtn.textContent = 'Shrani'; }, 1500);
      });
    });
    wrap.appendChild(saveBtn);

    return wrap;
  }

  function openResultPopup(lat, lng, name) {
    resultMarker.bindPopup(buildResultPopup(lat, lng, name), { offset: [0, -28] }).openPopup();
  }

  // ------------------------------------------------- shranjene točke: seznam
  function deletePin() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.innerHTML = '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  function renderSavedGrid() {
    var list = loadSaved();
    savedGrid.innerHTML = '';
    savedEmpty.hidden = list.length > 0;

    list.slice().reverse().forEach(function (rec) {
      var card = document.createElement('div');
      card.className = 'saved-card';

      var img = document.createElement('img');
      img.className = 'saved-card-img';
      img.src = rec.thumb;
      img.alt = 'Zemljevid lokacije';
      card.appendChild(img);

      var body = document.createElement('div');
      body.className = 'saved-card-body';

      var textWrap = document.createElement('div');
      textWrap.className = 'saved-card-text';

      var title = document.createElement('div');
      title.className = 'saved-card-name';
      title.textContent = rec.name || 'Neimenovana točka';
      if (!rec.name) title.classList.add('is-unnamed');
      title.title = title.textContent;
      textWrap.appendChild(title);

      var coords = document.createElement('div');
      coords.className = 'saved-card-coords';
      coords.textContent = rec.lat.toFixed(5) + ', ' + rec.lng.toFixed(5);
      textWrap.appendChild(coords);

      body.appendChild(textWrap);

      var del = document.createElement('button');
      del.className = 'saved-card-delete';
      del.type = 'button';
      del.title = 'Izbriši';
      del.appendChild(deletePin());
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        persistSaved(loadSaved().filter(function (r) { return r.id !== rec.id; }));
        renderSavedGrid();
      });
      body.appendChild(del);

      card.appendChild(body);

      card.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        map.flyTo([rec.lat, rec.lng], 14);
        if (resultMarker) map.removeLayer(resultMarker);
        resultMarker = L.marker([rec.lat, rec.lng], { icon: resultIcon }).addTo(map);
        openResultPopup(rec.lat, rec.lng, rec.name);
      });

      savedGrid.appendChild(card);
    });
  }

  renderSavedGrid();
})();
