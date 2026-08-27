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
  var btnMenu = document.getElementById('btnMenu');
  var menuDropdown = document.getElementById('menuDropdown');
  var menuItemSaved = document.getElementById('menuItemSaved');
  var menuItemAreas = document.getElementById('menuItemAreas');
  var menuItemMountains = document.getElementById('menuItemMountains');
  var btnCurrentLocation = document.getElementById('btnCurrentLocation');
  var btnPickOnMap = document.getElementById('btnPickOnMap');
  var btnPickArea = document.getElementById('btnPickArea');
  var btnStartCancel = document.getElementById('btnStartCancel');
  var hintToast = document.getElementById('hintToast');
  var radiusPanel = document.getElementById('radiusPanel');
  var radiusSlider = document.getElementById('radiusSlider');
  var radiusValue = document.getElementById('radiusValue');
  var btnRadiusCancel = document.getElementById('btnRadiusCancel');
  var btnRadiusConfirm = document.getElementById('btnRadiusConfirm');
  var radiusPresets = document.getElementById('radiusPresets');
  var radiusControls = document.getElementById('radiusControls');
  var drawAreaToggle = document.getElementById('drawAreaToggle');
  var drawStatus = document.getElementById('drawStatus');
  var drawCount = document.getElementById('drawCount');
  var btnDrawEdit = document.getElementById('btnDrawEdit');
  var btnDrawUndo = document.getElementById('btnDrawUndo');
  var btnDrawClear = document.getElementById('btnDrawClear');
  var savedGrid = document.getElementById('savedGrid');
  var savedEmpty = document.getElementById('savedEmpty');
  var savedAreasSection = document.getElementById('savedAreasSection');
  var savedAreasBackdrop = document.getElementById('savedAreasBackdrop');
  var btnSavedAreasClose = document.getElementById('btnSavedAreasClose');
  var btnAddArea = document.getElementById('btnAddArea');
  var btnImportArea = document.getElementById('btnImportArea');
  var importAreaFile = document.getElementById('importAreaFile');
  var savedAreasGrid = document.getElementById('savedAreasGrid');
  var savedAreasEmpty = document.getElementById('savedAreasEmpty');
  var savedMountainsSection = document.getElementById('savedMountainsSection');
  var savedMountainsBackdrop = document.getElementById('savedMountainsBackdrop');
  var btnSavedMountainsClose = document.getElementById('btnSavedMountainsClose');
  var btnAddMountain = document.getElementById('btnAddMountain');
  var btnImportMountain = document.getElementById('btnImportMountain');
  var importMountainFile = document.getElementById('importMountainFile');
  var savedMountainsGrid = document.getElementById('savedMountainsGrid');
  var savedMountainsEmpty = document.getElementById('savedMountainsEmpty');
  var areaAddPanel = document.getElementById('areaAddPanel');
  var areaAddPanelTitle = document.getElementById('areaAddPanelTitle');
  var areaNameInput = document.getElementById('areaNameInput');
  var areaDrawCount = document.getElementById('areaDrawCount');
  var btnAreaDrawEdit = document.getElementById('btnAreaDrawEdit');
  var btnAreaDrawUndo = document.getElementById('btnAreaDrawUndo');
  var btnAreaDrawClear = document.getElementById('btnAreaDrawClear');
  var btnAreaAddCancel = document.getElementById('btnAreaAddCancel');
  var btnAreaAddSave = document.getElementById('btnAreaAddSave');
  var eleFilter = document.getElementById('eleFilter');
  var eleMinInput = document.getElementById('eleMin');
  var eleMaxInput = document.getElementById('eleMax');

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

  /* Shranjene točke so zavihek, ki zdrsne čez zemljevid z desne — zemljevid
     je visok čez cel zaslon, zato do njih drugače (zlasti na telefonu, kjer
     prst premika zemljevid) ni mogoče zdrsniti. */
  var savedSection = document.getElementById('savedSection');
  var savedBackdrop = document.getElementById('savedBackdrop');
  var btnSavedClose = document.getElementById('btnSavedClose');

  function openSavedDrawer() {
    savedSection.classList.add('open');
    savedBackdrop.classList.add('open');
  }
  function closeSavedDrawer() {
    savedSection.classList.remove('open');
    savedBackdrop.classList.remove('open');
  }

  btnSavedClose.addEventListener('click', closeSavedDrawer);
  savedBackdrop.addEventListener('click', closeSavedDrawer);

  /* Isti zavihek-zdrsni-čez-zemljevid vzorec kot pri shranjenih točkah zgoraj. */
  function openSavedAreasDrawer() {
    savedAreasSection.classList.add('open');
    savedAreasBackdrop.classList.add('open');
  }
  function closeSavedAreasDrawer() {
    savedAreasSection.classList.remove('open');
    savedAreasBackdrop.classList.remove('open');
  }

  btnSavedAreasClose.addEventListener('click', closeSavedAreasDrawer);
  savedAreasBackdrop.addEventListener('click', closeSavedAreasDrawer);

  /* Isto še enkrat za "Gorovja" — ločen predal, a enaka funkcionalnost kot
     "Shranjena območja" (glej openSavedAreaOnMap/enterAreaAddMode nižje). */
  function openSavedMountainsDrawer() {
    savedMountainsSection.classList.add('open');
    savedMountainsBackdrop.classList.add('open');
  }
  function closeSavedMountainsDrawer() {
    savedMountainsSection.classList.remove('open');
    savedMountainsBackdrop.classList.remove('open');
  }

  btnSavedMountainsClose.addEventListener('click', closeSavedMountainsDrawer);
  savedMountainsBackdrop.addEventListener('click', closeSavedMountainsDrawer);

  // -------------------------------------------------------------- meni
  function openMenu() {
    menuDropdown.hidden = false;
    btnMenu.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menuDropdown.hidden = true;
    btnMenu.setAttribute('aria-expanded', 'false');
  }

  btnMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menuDropdown.hidden) openMenu(); else closeMenu();
  });

  /* Klik kjerkoli izven menija ga zapre — ker se poteg zemljevida (mousedown
     na #map) ne zaključi vedno s 'click', to zadošča brez posebne obravnave
     zemljevida. */
  document.addEventListener('click', function (e) {
    if (!menuDropdown.hidden && !menuDropdown.contains(e.target)) closeMenu();
  });

  menuItemSaved.addEventListener('click', function () {
    closeMenu();
    openSavedDrawer();
  });

  menuItemAreas.addEventListener('click', function () {
    closeMenu();
    openSavedAreasDrawer();
  });

  menuItemMountains.addEventListener('click', function () {
    closeMenu();
    openSavedMountainsDrawer();
  });

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

  /* Tretja opcija preskoči izhodišče in radij ter gre naravnost v risanje
     območja — enak način, kot ga sicer vklopi kljukica "Sam izberi območje"
     v panelu, le da tu do njega pridemo brez vmesnega koraka. */
  btnPickArea.addEventListener('click', function () {
    closeStartOverlay();
    pendingStart = null;
    drawAreaToggle.checked = true;
    radiusPanel.hidden = false;
    enterDrawMode();
  });

  // --------------------------------------------------------- korak 2: radij
  var AREA_STYLE = { color: '#38bdf8', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.12 };

  function createPreviewCircle(latlng, radius) {
    if (previewCircle) map.removeLayer(previewCircle);
    previewCircle = L.circle(latlng, L.extend({ radius: radius }, AREA_STYLE)).addTo(map);
  }

  function beginRadiusStep(latlng) {
    pendingStart = latlng;

    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker(latlng, { icon: startIcon }).addTo(map);

    var radius = parseInt(radiusSlider.value, 10);
    createPreviewCircle(latlng, radius);

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

  /* Filter nadmorske višine je smiseln le pri "Izberi vrh" (naključni met
     ne pozna imenovanih točk, torej ne ve za njihovo višino). */
  document.querySelectorAll('input[name="pickMode"]').forEach(function (r) {
    r.addEventListener('change', function () { eleFilter.hidden = pickMode() !== 'marked'; });
  });

  function readEleRange() {
    var minRaw = eleMinInput.value.trim();
    var maxRaw = eleMaxInput.value.trim();
    var min = minRaw === '' ? null : parseInt(minRaw, 10);
    var max = maxRaw === '' ? null : parseInt(maxRaw, 10);
    if (min != null && !isFinite(min)) min = null;
    if (max != null && !isFinite(max)) max = null;
    return { min: min, max: max };
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
     enkrat počakamo in poskusimo znova. eleMin/eleMax (lahko null) dodatno
     omejita izbor na vrhove z znano nadmorsko višino (oznaka `ele`) znotraj
     tega razpona. */
  function queryMarkedPoint(areaFilter, eleMin, eleMax) {
    var query = '[out:json][timeout:25];' +
      'node["natural"="peak"]["name"](' + areaFilter + ');' +
      'out body 1000;';

    return overpassRequest(query).catch(function (err) {
      if (err.status === 429) return sleep(2500).then(function () { return overpassRequest(query); });
      throw err;
    }).then(function (data) {
      var elements = (data.elements || []).filter(function (el) {
        if (!el.tags || !el.tags.name || el.lat == null) return false;
        /* Brez znane višine vrha ne moremo preveriti, ali ustreza filtru,
           zato ga pri aktivnem filtru izločimo. */
        if (eleMin != null || eleMax != null) {
          var ele = parseFloat(el.tags.ele);
          if (!isFinite(ele)) return false;
          if (eleMin != null && ele < eleMin) return false;
          if (eleMax != null && ele > eleMax) return false;
        }
        return true;
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

  // ------------------------------------------------ lastno narisano območje
  var drawPoints = [];
  var drawShape = null;          // polilinija (< 3 točke) ali poligon
  var vertexMarkers = [];        // vlečljivi označevalci na ogliščih
  var editMode = false;          // ali lahko trenutno vlečemo oglišča

  /* Isto risalno komponento (drawPoints/drawShape/editMode) uporabljata dva
     neodvisna zaslona — panel radija ("Sam izberi območje") in dodajanje
     novega shranjenega območja — ki pa imata vsak svoj status/Uredi/Nazaj/
     Počisti v svojem kosu vmesnika. activeDrawUI kaže, kateremu trenutno
     poročamo. */
  var activeDrawUI = { countEl: drawCount, editBtn: btnDrawEdit, undoBtn: btnDrawUndo, clearBtn: btnDrawClear };

  function vertexIcon() {
    return L.divIcon({
      className: 'draw-vertex-icon' + (editMode ? ' editable' : ''),
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
  }

  function clearDrawLayers() {
    if (drawShape) { map.removeLayer(drawShape); drawShape = null; }
    vertexMarkers.forEach(function (m) { map.removeLayer(m); });
    vertexMarkers = [];
  }

  function updateDrawStatus() {
    var n = drawPoints.length;
    activeDrawUI.countEl.textContent = n === 0 ? 'Klikaj po zemljevidu' :
      n < 3 ? (n + (n === 1 ? ' točka' : ' točki') + ' — potrebne so vsaj 3') :
      (n + (n === 2 ? ' točki' : n === 3 || n === 4 ? ' točke' : ' točk'));
    activeDrawUI.editBtn.disabled = n === 0;
    activeDrawUI.undoBtn.disabled = n === 0;
    activeDrawUI.clearBtn.disabled = n === 0;
  }

  /* Med vlečenjem oglišča prerišemo samo obris (poligon/polilinijo), ne pa
     tudi označevalcev — s tem ne prekinemo vlečenja tistega, ki se ravno
     premika. */
  function redrawShapeOnly() {
    if (drawShape) { map.removeLayer(drawShape); drawShape = null; }
    if (drawPoints.length) {
      drawShape = drawPoints.length >= 3
        ? L.polygon(drawPoints, AREA_STYLE).addTo(map)
        : L.polyline(drawPoints, { color: AREA_STYLE.color, weight: 2, dashArray: '5,5' }).addTo(map);
    }
  }

  function redrawArea() {
    clearDrawLayers();
    if (drawPoints.length) {
      redrawShapeOnly();
      drawPoints.forEach(function (p, i) {
        var marker = L.marker(p, { icon: vertexIcon(), draggable: editMode }).addTo(map);
        marker.on('drag', function (e) {
          var ll = e.target.getLatLng();
          drawPoints[i] = [ll.lat, ll.lng];
          redrawShapeOnly();
        });
        vertexMarkers.push(marker);
      });
    }
    /* Če je zadnja točka izginila (Nazaj/Počisti), medtem ko je bilo urejanje
       vklopljeno, ni več ničesar za vleči — samodejno izklopimo, sicer bi
       ostal klik na zemljevid nepovezan (dodajanje novih točk je med
       urejanjem namenoma izklopljeno). */
    if (!drawPoints.length && editMode) setEditMode(false);
    updateDrawStatus();
  }

  function onDrawClick(e) {
    drawPoints.push([e.latlng.lat, e.latlng.lng]);
    redrawArea();
  }

  /* "Uredi": ko je vklopljeno, oglišča postanejo vlečljiva, klik na
     zemljevid pa ne dodaja več novih točk (da se med vlečenjem ne doda
     nenamerna točka). Gumb se ob tem obarva. */
  function setEditMode(on) {
    editMode = on;
    activeDrawUI.editBtn.classList.toggle('active', on);
    if (on) {
      map.off('click', onDrawClick);
      showToast('Povleci točko, da jo premakneš', 2500);
    } else {
      map.on('click', onDrawClick);
    }
    vertexMarkers.forEach(function (m) {
      m.setIcon(vertexIcon());
      if (on) m.dragging.enable(); else m.dragging.disable();
    });
  }

  btnDrawEdit.addEventListener('click', function () { setEditMode(!editMode); });

  function enterDrawMode() {
    radiusControls.hidden = true;
    drawStatus.hidden = false;
    if (previewCircle) { map.removeLayer(previewCircle); previewCircle = null; }
    map.on('click', onDrawClick);
    showToast('Klikaj po zemljevidu in obkroži svoje območje', 3500);
    updateDrawStatus();
  }

  function exitDrawMode() {
    radiusControls.hidden = false;
    drawStatus.hidden = true;
    setEditMode(false);
    map.off('click', onDrawClick);
    drawPoints = [];
    clearDrawLayers();
    if (pendingStart) createPreviewCircle(pendingStart, parseInt(radiusSlider.value, 10));
  }

  drawAreaToggle.addEventListener('change', function () {
    if (drawAreaToggle.checked) {
      enterDrawMode();
    } else if (!pendingStart) {
      /* Sem smo prišli neposredno prek "Sam izberi območje" v prvem oknu,
         zato ni izhodišča za krog — ostanemo v risanju. */
      drawAreaToggle.checked = true;
      showToast('Za radij okoli izhodišča prekliči in izberi točko znova.', 3200);
    } else {
      exitDrawMode();
    }
  });

  btnDrawUndo.addEventListener('click', function () {
    drawPoints.pop();
    redrawArea();
  });

  btnDrawClear.addEventListener('click', function () {
    drawPoints = [];
    redrawArea();
  });

  // Isti Uredi/Nazaj/Počisti, tokrat za panel "Novo območje".
  btnAreaDrawEdit.addEventListener('click', function () { setEditMode(!editMode); });
  btnAreaDrawUndo.addEventListener('click', function () { drawPoints.pop(); redrawArea(); });
  btnAreaDrawClear.addEventListener('click', function () { drawPoints = []; redrawArea(); });

  // --------------------------------------------- dodajanje novega območja
  /* Isti obrazec za risanje uporabljata "Shranjena območja" in "Gorovja" —
     addAreaTarget pove, v katerega od njiju gre Shrani/Prekliči. */
  var addAreaTarget = 'areas';

  function enterAreaAddMode(target) {
    addAreaTarget = target;
    areaAddPanelTitle.textContent = target === 'mountains' ? 'Novo gorovje' : 'Novo območje';
    areaNameInput.placeholder = target === 'mountains' ? 'Ime gorovja' : 'Ime območja';
    if (!radiusPanel.hidden) endRadiusStep(); // ne dovoli dveh sočasnih risanj
    activeDrawUI = { countEl: areaDrawCount, editBtn: btnAreaDrawEdit, undoBtn: btnAreaDrawUndo, clearBtn: btnAreaDrawClear };
    drawPoints = [];
    clearDrawLayers();
    areaNameInput.value = '';
    areaAddPanel.hidden = false;
    map.on('click', onDrawClick);
    showToast('Klikaj po zemljevidu in obkroži območje', 3500);
    updateDrawStatus();
  }

  function exitAreaAddMode() {
    areaAddPanel.hidden = true;
    setEditMode(false);
    map.off('click', onDrawClick);
    drawPoints = [];
    clearDrawLayers();
    activeDrawUI = { countEl: drawCount, editBtn: btnDrawEdit, undoBtn: btnDrawUndo, clearBtn: btnDrawClear };
  }

  /* Klik na shranjeno območje: nariše njegov obris na zemljevid in odpre isti
     obrazec za iskanje vrha (Vrzi naključno / Izberi vrh, radij ni relevanten)
     kot ga sicer odpre "Sam izberi območje" — le da je poligon že narisan. */
  function openSavedAreaOnMap(points) {
    if (!areaAddPanel.hidden) exitAreaAddMode();
    if (!radiusPanel.hidden) endRadiusStep();
    if (resultMarker) { map.removeLayer(resultMarker); resultMarker = null; }

    pendingStart = null;
    drawPoints = points.slice();
    drawAreaToggle.checked = true;
    radiusPanel.hidden = false;
    enterDrawMode();
    redrawArea();
    map.flyToBounds(L.latLngBounds(points), { padding: [40, 40] });
  }

  btnAddArea.addEventListener('click', function () {
    closeSavedAreasDrawer();
    enterAreaAddMode('areas');
  });

  btnAddMountain.addEventListener('click', function () {
    closeSavedMountainsDrawer();
    enterAreaAddMode('mountains');
  });

  /* Uvoz iz .json datoteke, izvožene z gumbom pri shranjenem območju/gorovju.
     Ime datoteke je namenoma prezrto — uporabljeno je ime iz vsebine. Skupna
     za oba zavihka; okoli nje le drugačen gumb/vnos in hramba. */
  function wireAreaImport(button, fileInput, loadList, persistList, rerender, successMsg) {
    button.addEventListener('click', function () {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); }
        catch (e) { showToast('Datoteka ni veljaven JSON.', 3000); return; }

        var points = Array.isArray(data.points) ? data.points.filter(function (p) {
          return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]);
        }) : [];
        if (points.length < 3) {
          showToast('Datoteka ne vsebuje veljavnega območja (vsaj 3 točke).', 3500);
          return;
        }

        var list = loadList();
        list.push({
          id: Date.now(),
          name: (typeof data.name === 'string' && data.name.trim()) || null,
          points: points,
          created: Date.now()
        });
        var ok = persistList(list);
        rerender();
        showToast(ok ? successMsg : 'Napaka pri uvozu', 2500);
      };
      reader.onerror = function () { showToast('Branje datoteke ni uspelo.', 3000); };
      reader.readAsText(file);
    });
  }

  wireAreaImport(btnImportArea, importAreaFile, loadSavedAreas, persistSavedAreas, function () { renderSavedAreasGrid(); }, 'Območje uvoženo');
  wireAreaImport(btnImportMountain, importMountainFile, loadSavedMountains, persistSavedMountains, function () { renderSavedMountainsGrid(); }, 'Gorovje uvoženo');

  btnAreaAddCancel.addEventListener('click', function () {
    exitAreaAddMode();
    if (addAreaTarget === 'mountains') openSavedMountainsDrawer(); else openSavedAreasDrawer();
  });

  btnAreaAddSave.addEventListener('click', function () {
    if (drawPoints.length < 3) {
      showToast('Za območje nariši vsaj tri točke.', 3000);
      return;
    }
    var isMountain = addAreaTarget === 'mountains';
    var name = areaNameInput.value.trim();
    var points = drawPoints.slice();
    var list = isMountain ? loadSavedMountains() : loadSavedAreas();
    list.push({ id: Date.now(), name: name || null, points: points, created: Date.now() });
    var ok = isMountain ? persistSavedMountains(list) : persistSavedAreas(list);
    exitAreaAddMode();
    if (isMountain) {
      renderSavedMountainsGrid();
      openSavedMountainsDrawer();
      showToast(ok ? 'Gorovje shranjeno' : 'Napaka pri shranjevanju', 2500);
    } else {
      renderSavedAreasGrid();
      openSavedAreasDrawer();
      showToast(ok ? 'Območje shranjeno' : 'Napaka pri shranjevanju', 2500);
    }
  });

  /* Test žarka: ali točka leži znotraj poligona. */
  function pointInPolygon(lat, lng, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Naključna točka v poligonu z zavračanjem: žrebamo v očrtanem pravokotniku,
     dokler zadetek ne pade znotraj. Pri zelo ozkih oblikah lahko spodleti,
     zato omejeno število poskusov. */
  function randomPointInPolygon(poly) {
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    poly.forEach(function (p) {
      minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
      minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]);
    });
    for (var i = 0; i < 800; i++) {
      var lat = minLat + Math.random() * (maxLat - minLat);
      var lng = minLng + Math.random() * (maxLng - minLng);
      if (pointInPolygon(lat, lng, poly)) return [lat, lng];
    }
    return null;
  }

  function polyFilter(poly) {
    return 'poly:"' + poly.map(function (p) {
      return p[0].toFixed(6) + ' ' + p[1].toFixed(6);
    }).join(' ') + '"';
  }

  function endRadiusStep() {
    radiusStepToken++;
    radiusPanel.hidden = true;
    if (previewCircle) { map.removeLayer(previewCircle); previewCircle = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    if (drawAreaToggle.checked) {
      drawAreaToggle.checked = false;
      setEditMode(false);
      map.off('click', onDrawClick);
      radiusControls.hidden = false;
      drawStatus.hidden = true;
    }
    drawPoints = [];
    clearDrawLayers();
    pendingStart = null;
  }

  btnRadiusCancel.addEventListener('click', endRadiusStep);

  function showResult(point, name) {
    if (resultMarker) map.removeLayer(resultMarker);
    resultMarker = L.marker(point, { icon: resultIcon }).addTo(map);
    map.flyTo(point, 14);
    openResultPopup(point[0], point[1], name, true);
    if (name) showToast('Izbrano: ' + name, 3000);
  }

  /* Zadnji met — shranjeni parametri, da ga lahko z gumbom v oknu ponovimo
     pod povsem enakimi pogoji (isto območje, isti način izbire). */
  var lastThrow = null;

  /* "Spremeni vrednosti" v rezultatu: znova odpre panel izbire natanko v stanju
     pred zadnjo potrditvijo — isto območje (krog ali narisan poligon), isti
     radij, način izbire in filter višine (ti trije se med potrditvijo sploh ne
     spremenijo, zato jih ni treba posebej obnavljati). */
  function reopenPanelFromLastThrow() {
    if (!lastThrow) return;
    var spec = lastThrow;
    if (resultMarker) { map.removeLayer(resultMarker); resultMarker = null; }

    if (spec.useDrawn) {
      pendingStart = spec.start;
      drawPoints = spec.poly.slice();
      drawAreaToggle.checked = true;
      radiusPanel.hidden = false;
      enterDrawMode();
      redrawArea();
      if (drawPoints.length) map.flyToBounds(L.polygon(drawPoints).getBounds(), { padding: [40, 40] });
    } else {
      beginRadiusStep(spec.start);
    }
  }

  /* Iz (morebitnega) odgovora Overpassa in žrebalnika sestavi končni rezultat.
     `found` je null pri čistem naključnem metu. */
  function resolveThrow(spec, found) {
    if (found && found.status === 'ok') {
      showResult([found.lat, found.lng], found.name);
      return;
    }
    var fallback = spec.pickRandom();
    if (!fallback) {
      showToast('Območje je preozko — nariši ga malo širše.', 3500);
      return;
    }
    if (found && found.status === 'empty') {
      showToast(
        (spec.eleMin != null || spec.eleMax != null)
          ? 'Ni vrhov v tej višini znotraj območja, izbrana naključna točka.'
          : 'Ni vrhov v tem območju, izbrana naključna točka.',
        3500
      );
    } else if (found) {
      showToast('Iskanje vrhov ni uspelo, izbrana naključna točka.', 3500);
    }
    showResult(fallback);
  }

  btnRadiusConfirm.addEventListener('click', function () {
    var useDrawn = drawAreaToggle.checked;

    if (useDrawn && drawPoints.length < 3) {
      showToast('Za območje nariši vsaj tri točke.', 3000);
      return;
    }
    if (!useDrawn && !pendingStart) return;

    /* Območje iskanja opišemo enkrat — kot filter za Overpass in kot žrebalnik
       naključne točke — da je nadaljnji potek enak za krog in narisan poligon. */
    /* useDrawn/poly/start gredo tudi v spec (poleg areaFilter) — samo zato, da
       jih "Spremeni vrednosti" v rezultatu lahko obnovi natanko take, kot so
       bile pred potrditvijo (glej reopenPanelFromLastThrow). */
    var spec;
    if (useDrawn) {
      var poly = drawPoints.slice();
      spec = {
        mode: pickMode(),
        useDrawn: true,
        poly: poly,
        start: pendingStart,
        areaFilter: polyFilter(poly),
        pickRandom: function () { return randomPointInPolygon(poly); },
        slow: true
      };
    } else {
      var radius = parseInt(radiusSlider.value, 10);
      var start = pendingStart;
      spec = {
        mode: pickMode(),
        useDrawn: false,
        start: start,
        areaFilter: 'around:' + radius + ',' + start[0] + ',' + start[1],
        pickRandom: function () { return randomPointInCircle(start[0], start[1], radius); },
        slow: radius > 20000
      };
    }
    if (pickMode() === 'marked') {
      var ele = readEleRange();
      if (ele.min != null && ele.max != null && ele.min > ele.max) {
        showToast('Najnižja nadmorska višina je večja od najvišje.', 3000);
        return;
      }
      spec.eleMin = ele.min;
      spec.eleMax = ele.max;
    }
    lastThrow = spec;

    if (spec.mode === 'marked') {
      var token = radiusStepToken;
      btnRadiusConfirm.disabled = true;
      btnRadiusConfirm.textContent = spec.slow ? 'Iščem (lahko traja do 30 s) …' : 'Iščem …';
      queryMarkedPoint(spec.areaFilter, spec.eleMin, spec.eleMax).then(function (found) {
        btnRadiusConfirm.disabled = false;
        btnRadiusConfirm.textContent = 'Potrdi';
        if (token !== radiusStepToken) return; // preklicano medtem
        endRadiusStep();
        resolveThrow(spec, found);
      });
      return;
    }

    endRadiusStep();
    resolveThrow(spec, null);
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

  // ------------------------------------------------ shranjena območja: podatki
  var AREAS_STORAGE_KEY = 'kam-saved-areas';

  function loadSavedAreas() {
    try { return JSON.parse(localStorage.getItem(AREAS_STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function persistSavedAreas(list) {
    try { localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  // ------------------------------------------------------ gorovja: podatki
  var MOUNTAINS_STORAGE_KEY = 'kam-saved-mountains';

  function loadSavedMountains() {
    try { return JSON.parse(localStorage.getItem(MOUNTAINS_STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function persistSavedMountains(list) {
    try { localStorage.setItem(MOUNTAINS_STORAGE_KEY, JSON.stringify(list)); return true; }
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
  /* Gumb z ikono: SVG postavimo pred besedilo, ki ga po potrebi menjamo. */
  function iconButton(className, label, svgPaths) {
    var btn = document.createElement('button');
    btn.className = className;
    btn.type = 'button';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = svgPaths;
    var span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(svg);
    btn.appendChild(span);
    btn.setLabel = function (text) { span.textContent = text; };
    return btn;
  }

  var ICON_REPEAT = '<path d="M20 11a8 8 0 1 0-.6 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M20 4v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  var ICON_SAVE = '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>';
  var ICON_TUNE = '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="15" cy="6" r="2" fill="currentColor" stroke="#12151b" stroke-width="1"/>' +
    '<circle cx="9" cy="12" r="2" fill="currentColor" stroke="#12151b" stroke-width="1"/>' +
    '<circle cx="17" cy="18" r="2" fill="currentColor" stroke="#12151b" stroke-width="1"/>';

  function buildResultPopup(lat, lng, knownName, allowRepeat) {
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

    /* Ponovi zadnji met z istimi parametri. Rezultat zamenja označevalec in s
       tem to okno, zato gumba ni treba posebej vračati v izhodiščno stanje —
       razen kadar met ne da točke in okno ostane odprto. */
    if (allowRepeat && lastThrow) {
      var editBtn = iconButton('popup-edit-btn', 'Spremeni vrednosti', ICON_TUNE);
      editBtn.addEventListener('click', reopenPanelFromLastThrow);
      wrap.appendChild(editBtn);

      var repeatBtn = iconButton('popup-repeat-btn', 'Vrzi ponovno', ICON_REPEAT);
      repeatBtn.addEventListener('click', function () {
        var spec = lastThrow;
        if (spec.mode !== 'marked') { resolveThrow(spec, null); return; }
        repeatBtn.disabled = true;
        repeatBtn.setLabel('Iščem …');
        queryMarkedPoint(spec.areaFilter, spec.eleMin, spec.eleMax).then(function (found) {
          repeatBtn.disabled = false;
          repeatBtn.setLabel('Vrzi ponovno');
          resolveThrow(spec, found);
        });
      });
      wrap.appendChild(repeatBtn);
    }

    var saveBtn = iconButton('popup-save-btn', 'Shrani', ICON_SAVE);
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      saveBtn.setLabel('Shranjujem …');
      /* Pri izbranem vrhu ime že imamo; pri naključni točki poiščemo najbližji
         vrh ali kraj. Če opis ne uspe, točko vseeno shranimo — le brez opisa. */
      var namePromise = knownName ? Promise.resolve(knownName) : describePoint(lat, lng);
      Promise.all([makeThumbnail(lat, lng), namePromise]).then(function (r) {
        var list = loadSaved();
        list.push({ id: Date.now(), lat: lat, lng: lng, thumb: r[0], name: r[1] || null, created: Date.now() });
        var ok = persistSaved(list);
        renderSavedGrid();
        saveBtn.disabled = false;
        saveBtn.setLabel(ok ? 'Shranjeno ✓' : 'Napaka pri shranjevanju');
        setTimeout(function () { saveBtn.setLabel('Shrani'); }, 1500);
      });
    });
    wrap.appendChild(saveBtn);

    return wrap;
  }

  function openResultPopup(lat, lng, name, allowRepeat) {
    resultMarker.bindPopup(buildResultPopup(lat, lng, name, allowRepeat), { offset: [0, -28] }).openPopup();
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

  function renamePin() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('fill', 'none');
    svg.innerHTML = '<path d="M4 20l4.5-1L19 8.5a1.5 1.5 0 0 0 0-2.1l-1.4-1.4a1.5 1.5 0 0 0-2.1 0L5 15.5 4 20Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
    return svg;
  }

  function exportPin() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('fill', 'none');
    svg.innerHTML = '<path d="M12 14V4M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  /* Za ime izvožene datoteke — poenostavi na varne znake, odstrani šumnike. */
  function slugify(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'gorovje';
  }

  /* Izvozi eno shranjeno območje/gorovje kot .json datoteko za kasnejši uvoz. */
  function exportAreaRecord(rec, kind, filePrefix) {
    var payload = { kind: kind, version: 1, name: rec.name || null, points: rec.points, created: rec.created };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filePrefix + '-' + slugify(rec.name || 'neimenovano') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
        closeSavedDrawer();
        map.flyTo([rec.lat, rec.lng], 14);
        if (resultMarker) map.removeLayer(resultMarker);
        resultMarker = L.marker([rec.lat, rec.lng], { icon: resultIcon }).addTo(map);
        openResultPopup(rec.lat, rec.lng, rec.name);
      });

      savedGrid.appendChild(card);
    });
  }

  // ------------------------------------------ shranjena območja / gorovja: seznam
  /* Skupna izrisovalka vrstic — uporabljata jo renderSavedAreasGrid in
     renderSavedMountainsGrid, ki se razlikujeta le po hrambi, predalu in
     besedilu za neimenovan vnos. Vrstni red gumbov: preimenuj, izvozi, izbriši. */
  function renderAreaRows(grid, emptyEl, list, unnamedLabel, onDelete, onRename, closeDrawer, exportOpts) {
    grid.innerHTML = '';
    emptyEl.hidden = list.length > 0;

    list.slice().reverse().forEach(function (rec) {
      var row = document.createElement('div');
      row.className = 'area-row';

      var textWrap = document.createElement('div');
      textWrap.className = 'area-row-text';

      var title = document.createElement('div');
      title.className = 'area-row-name';
      title.textContent = rec.name || unnamedLabel;
      if (!rec.name) title.classList.add('is-unnamed');
      title.title = title.textContent;
      textWrap.appendChild(title);

      var sub = document.createElement('div');
      sub.className = 'area-row-sub';
      sub.textContent = rec.points.length + (rec.points.length === 1 ? ' točka' : ' točk');
      textWrap.appendChild(sub);

      row.appendChild(textWrap);

      var actions = document.createElement('div');
      actions.className = 'area-row-actions';

      var ren = document.createElement('button');
      ren.className = 'saved-card-delete area-row-rename';
      ren.type = 'button';
      ren.title = 'Preimenuj';
      ren.appendChild(renamePin());
      ren.addEventListener('click', function (e) {
        e.stopPropagation();
        var next = prompt('Novo ime:', rec.name || '');
        if (next === null) return; // preklicano
        onRename(rec.id, next.trim());
      });
      actions.appendChild(ren);

      if (exportOpts) {
        var exp = document.createElement('button');
        exp.className = 'saved-card-delete area-row-export';
        exp.type = 'button';
        exp.title = 'Izvozi';
        exp.appendChild(exportPin());
        exp.addEventListener('click', function (e) {
          e.stopPropagation();
          exportAreaRecord(rec, exportOpts.kind, exportOpts.prefix);
        });
        actions.appendChild(exp);
      }

      var del = document.createElement('button');
      del.className = 'saved-card-delete';
      del.type = 'button';
      del.title = 'Izbriši';
      del.appendChild(deletePin());
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        onDelete(rec.id);
      });
      actions.appendChild(del);

      row.appendChild(actions);

      row.addEventListener('click', function () {
        closeDrawer();
        openSavedAreaOnMap(rec.points);
      });

      grid.appendChild(row);
    });
  }

  function renderSavedAreasGrid() {
    renderAreaRows(savedAreasGrid, savedAreasEmpty, loadSavedAreas(), 'Neimenovano območje', function (id) {
      persistSavedAreas(loadSavedAreas().filter(function (r) { return r.id !== id; }));
      renderSavedAreasGrid();
    }, function (id, name) {
      var list = loadSavedAreas();
      var rec = list.find(function (r) { return r.id === id; });
      if (rec) rec.name = name || null;
      persistSavedAreas(list);
      renderSavedAreasGrid();
    }, closeSavedAreasDrawer, { kind: 'kam-obmocje', prefix: 'obmocje' });
  }

  function renderSavedMountainsGrid() {
    renderAreaRows(savedMountainsGrid, savedMountainsEmpty, loadSavedMountains(), 'Neimenovano gorovje', function (id) {
      persistSavedMountains(loadSavedMountains().filter(function (r) { return r.id !== id; }));
      renderSavedMountainsGrid();
    }, function (id, name) {
      var list = loadSavedMountains();
      var rec = list.find(function (r) { return r.id === id; });
      if (rec) rec.name = name || null;
      persistSavedMountains(list);
      renderSavedMountainsGrid();
    }, closeSavedMountainsDrawer, { kind: 'kam-gorovje', prefix: 'gorovje' });
  }

  renderSavedGrid();
  renderSavedAreasGrid();
  renderSavedMountainsGrid();
})();
