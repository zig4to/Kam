/* Aplikacija se zažene šele po uspešni prijavi — js/auth.js pokliče
   window.startApp(). Podatki (točke, območja, gorovja, seznam) gredo prek
   window.KamData v oblak (glej js/db.js), ne več neposredno v localStorage. */
window.startApp = function () {
  if (window.__kamStarted) return;
  window.__kamStarted = true;

  var map = L.map('map', { zoomControl: true }).setView([46.05, 14.5], 9); // Ljubljana / Slovenija

  /* PNG namesto JPG (brez stiskanja), {r} -> @2x ploščice (512 px) na zaslonih
     z visoko gostoto pik, maxZoom 20 = dejanski maksimum strežnika. */
  L.tileLayer('https://tiles.bergfex.at/styles/bergfex-osm/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
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
  var menuUserName = document.getElementById('menuUserName');
  var menuUserEmail = document.getElementById('menuUserEmail');
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
  var popularToggle = document.getElementById('popularToggle');

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
     tega razpona. popularOnly obdrži le vrhove, ki imajo `wikipedia` ali
     `wikidata` oznako — v OSM praksi jih dobijo predvsem prepoznavni,
     znani vrhovi, zato je to razumen posreden približek "priljubljenosti"
     (OSM nima dejanske statistike obiskov). */
  function queryMarkedPoint(areaFilter, eleMin, eleMax, popularOnly) {
    var query = '[out:json][timeout:25];' +
      'node["natural"="peak"]["name"](' + areaFilter + ');' +
      'out body 1000;';

    return overpassRequest(query).catch(function (err) {
      if (err.status === 429) return sleep(2500).then(function () { return overpassRequest(query); });
      throw err;
    }).then(function (data) {
      var elements = (data.elements || []).filter(function (el) {
        if (!el.tags || !el.tags.name || el.lat == null) return false;
        if (popularOnly && !el.tags.wikipedia && !el.tags.wikidata) return false;
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
    radiusPanel.classList.remove('collapsed');
    radiusPanel.style.transform = '';
    radiusPanel.style.transition = '';
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

  /* Telefon: ročaj na vrhu panela s parametri — poteg navzdol ga zloži (ostane
     le ročaj, zemljevid je bolj dostopen), poteg navzgor ali tap ga razpre. */
  (function () {
    var radiusHandle = document.getElementById('radiusHandle');
    if (!radiusHandle) return;
    var startY = 0, base = 0, peek = 0, dragging = false, moved = false;
    function isCollapsed() { return radiusPanel.classList.contains('collapsed'); }
    function setCollapsed(v) { radiusPanel.classList.toggle('collapsed', v); }

    radiusHandle.addEventListener('touchstart', function (e) {
      dragging = true;
      moved = false;
      startY = e.touches[0].clientY;
      peek = Math.max(60, radiusPanel.offsetHeight - 46);
      base = isCollapsed() ? peek : 0;
      radiusPanel.style.transition = 'none';
    }, { passive: true });

    radiusHandle.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > 6) moved = true;
      var off = Math.max(0, Math.min(peek, base + dy));
      radiusPanel.style.transform = 'translate(-50%, ' + off + 'px)';
    }, { passive: true });

    radiusHandle.addEventListener('touchend', function (e) {
      if (!dragging) return;
      dragging = false;
      var off = base + (e.changedTouches[0].clientY - startY);
      radiusPanel.style.transition = '';
      radiusPanel.style.transform = '';
      if (moved) setCollapsed(off > peek * 0.4);
    }, { passive: true });

    radiusHandle.addEventListener('click', function () {
      if (moved) { moved = false; return; }   // to je bil poteg, ne tap
      setCollapsed(!isCollapsed());
    });
  })();

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
    /* Vrha ni v (filtrirani) bazi — namesto naključne točke se vrni na obrazec
       za izbiro, da lahko uporabnik prilagodi vrednosti (območje, filtre) in
       poskusi znova. */
    if (found && found.status === 'empty') {
      var filtered = spec.eleMin != null || spec.eleMax != null || spec.popularOnly;
      reopenPanelFromLastThrow();
      showToast(
        (filtered ? 'Noben vrh ne ustreza filtru.' : 'Ni vrhov v tem območju.') + ' Prilagodi vrednosti in poskusi znova.',
        3500
      );
      return;
    }
    /* Dejanska napaka iskanja (status 'error' — omrežje/API): ne vržemo
       naključne točke, stanje ostane nespremenjeno — namesto potrditvenega
       okna se pod pinom na sredini območja odpre isto vrsto okna kot pri
       zadetku, le da namesto rezultata ponudi ponovitev. */
    if (found) {
      showErrorResult(spec);
      return;
    }
    // found === null → čist naključni met (mode "Vrzi naključno")
    var fallback = spec.pickRandom();
    if (!fallback) {
      showToast('Območje je preozko — nariši ga malo širše.', 3500);
      return;
    }
    showResult(fallback);
  }

  /* Sredinska točka območja — samo za postavitev pina pri showErrorResult
     (krog ima že svoje izhodišče, poligon ga nima, zato center oboda). */
  function areaCenterPoint(spec) {
    if (!spec.useDrawn) return spec.start;
    var c = L.latLngBounds(spec.poly).getCenter();
    return [c.lat, c.lng];
  }

  function showErrorResult(spec) {
    var point = areaCenterPoint(spec);
    if (resultMarker) map.removeLayer(resultMarker);
    resultMarker = L.marker(point, { icon: resultIcon }).addTo(map);
    map.flyTo(point, Math.max(map.getZoom(), 11));
    resultMarker.bindPopup(buildErrorPopup(spec), { offset: [0, -28] }).openPopup();
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
      spec.popularOnly = popularToggle.checked;
    }
    lastThrow = spec;

    if (spec.mode === 'marked') {
      var token = radiusStepToken;
      btnRadiusConfirm.disabled = true;
      btnRadiusConfirm.textContent = spec.slow ? 'Iščem (lahko traja do 30 s) …' : 'Iščem …';
      queryMarkedPoint(spec.areaFilter, spec.eleMin, spec.eleMax, spec.popularOnly).then(function (found) {
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

  // --------------------------------------------------------------- podatki
  /* Vse štiri zbirke (točke, območja, gorovja, seznam) hrani window.KamData:
     v pomnilniku + zrcalo v localStorage + sinhronizacija v Supabase. Te
     ovojnice ohranjajo isti vmesnik kot prej (sinhroni load/persist). */
  var THUMB_ZOOM = 14, THUMB_W = 320, THUMB_H = 200;

  function loadSaved()            { return window.KamData ? KamData.get('points') : []; }
  function persistSaved(list)     { return window.KamData ? KamData.set('points', list) : false; }
  function loadSavedAreas()       { return window.KamData ? KamData.get('areas') : []; }
  function persistSavedAreas(l)   { return window.KamData ? KamData.set('areas', l) : false; }
  function loadSavedMountains()   { return window.KamData ? KamData.get('mountains') : []; }
  function persistSavedMountains(l) { return window.KamData ? KamData.set('mountains', l) : false; }

  /* Slippy-map projekcija (Web Mercator) za pretvorbo lat/lng v koordinate ploščic. */
  function deg2num(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = (lng + 180) / 360 * n;
    var latRad = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x: x, y: y };
  }

  function tileUrl(z, x, y) {
    return 'https://tiles.bergfex.at/styles/bergfex-osm/' + z + '/' + x + '/' + y + '.png';
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
     položimo na dejanski odmik točke znotraj izreza, ne kar na sredino.
     opts: { zoom, pin } — privzeto THUMB_ZOOM in pin narisan. */
  function makeThumbnail(lat, lng, opts) {
    opts = opts || {};
    var z = opts.zoom || THUMB_ZOOM;
    var showPin = opts.pin !== false;
    var p = deg2num(lat, lng, z);
    var tx0 = Math.floor(p.x) - 1, ty0 = Math.floor(p.y) - 1;
    var localX = (p.x - tx0) * 256, localY = (p.y - ty0) * 256;

    var jobs = [];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        jobs.push(loadTile(z, tx0 + col, ty0 + row, col, row));
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
      if (showPin) drawPin(octx, localX - sx, localY - sy);
      try { return out.toDataURL('image/jpeg', 0.75); }
      catch (e) { return null; }
    });
  }

  /* Približno središče slovenske statistične regije (povprečje točk zunanjega
     obroča) — za izsek zemljevida, ko destinacija nima koordinat. */
  function regionCentroid(name) {
    var rings = window.SI_REGIONS && window.SI_REGIONS[name];
    if (!rings || !rings.length || !rings[0].length) return null;
    var ring = rings[0], sx = 0, sy = 0, n = ring.length;
    for (var i = 0; i < n; i++) { sx += ring[i][0]; sy += ring[i][1]; }
    return { lat: sy / n, lng: sx / n };
  }

  // ------------------------------------------------ samodejna slika za kartico
  /* Vsaka destinacija na seznamu "Vem Kam!" dobi sliko brez ročnega nalaganja:
     najprej fotografija z Wikipedije (po koordinatah, nato po imenu), nato
     Openverse (po imenu), na koncu izsek zemljevida. Shranimo le URL (polje
     rec.image); izsek zemljevida nima URL-ja, zato gre kot data: URI.
     rec.image === '' pomeni "poskusili, nič"; do ponovnega poskusa preteče
     WL_IMG_MAXAGE. Zahtevo za posamezno destinacijo naredimo enkrat.
     WL_IMG_VER povečaj, ko se spremenijo viri/poizvedbe — takrat se prazni
     zapisi enkrat na novo poskusijo (ne glede na WL_IMG_MAXAGE). */
  var WL_IMG_MAXAGE = 30 * 864e5;
  var WL_IMG_VER = 2;
  var wlImgInflight = {};

  function fetchJson(url, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms || 7000);
    return fetch(url, { signal: ctrl.signal, referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (v) { clearTimeout(t); return v; });
  }

  /* Prvi članek s sličico iz Wikipedijinega Action API (prop=pageimages).
     kind: 'geo' -> generator=geosearch okoli koordinat; 'name' -> generator=search. */
  function wikiThumb(lang, kind, rec) {
    var base = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&format=json&origin=*' +
      '&prop=pageimages&piprop=thumbnail&pithumbsize=640&pilimit=10';
    var url;
    if (kind === 'geo') {
      url = base + '&generator=geosearch&ggslimit=6&ggsradius=1000' +
        '&ggscoord=' + rec.lat + '%7C' + rec.lng;
    } else {
      // Samo ime: Wikipedijino iskanje zahteva ujemanje vseh besed, zato dodana
      // regija/država vrne 0 zadetkov (npr. "Slap Savica Gorenjska").
      url = base + '&generator=search&gsrlimit=5&gsrsearch=' + encodeURIComponent(rec.name);
    }
    return fetchJson(url).then(function (data) {
      var pages = data && data.query && data.query.pages;
      if (!pages) return null;
      var best = null;
      Object.keys(pages).forEach(function (k) {
        var p = pages[k];
        if (!p.thumbnail || !p.thumbnail.source) return;
        // pri iskanju po imenu spoštuj vrstni red (index), pri geosearch vzemi prvo
        if (!best || (p.index != null && best.index != null && p.index < best.index)) best = p;
      });
      return best ? best.thumbnail.source : null;
    });
  }

  function openverseThumb(rec) {
    // Openverse rangira po relevantnosti (ne zahteva vseh besed), zato je država
    // koristna za razdvoumljanje; regije ne dodajamo (preveč obskurna za oznake).
    var q = (rec.name + ' ' + (rec.country || '')).trim();
    var url = 'https://api.openverse.org/v1/images/?page_size=3&mature=false&q=' +
      encodeURIComponent(q);
    return fetchJson(url).then(function (data) {
      var r = data && data.results && data.results[0];
      return r ? (r.thumbnail || r.url || null) : null;
    });
  }

  /* Vrne Promise<{url, src} | null>. Viri po vrsti; prvi zadetek zmaga. */
  function resolveCardImage(rec) {
    var hasCoords = isNum(rec.lat) && isNum(rec.lng);
    var steps = [];
    if (hasCoords) {
      steps.push(function () { return wikiThumb('sl', 'geo', rec).then(tag('wikipedia')); });
      steps.push(function () { return wikiThumb('en', 'geo', rec).then(tag('wikipedia')); });
    }
    if (rec.name) {
      steps.push(function () { return wikiThumb('sl', 'name', rec).then(tag('wikipedia')); });
      steps.push(function () { return wikiThumb('en', 'name', rec).then(tag('wikipedia')); });
      steps.push(function () { return openverseThumb(rec).then(tag('openverse')); });
    }
    // Zadnja rezerva: izsek zemljevida, da kartica dobi vsaj nekaj.
    // S koordinatami -> s pinom; brez njih, a s slovensko regijo -> središče
    // regije, bolj oddaljeno in brez pina (položaj je le približen).
    steps.push(function () {
      var mk = null;
      if (hasCoords) {
        mk = makeThumbnail(rec.lat, rec.lng);
      } else if (rec.country === 'Slovenija') {
        var c = regionCentroid(rec.region);
        if (c) mk = makeThumbnail(c.lat, c.lng, { zoom: 9, pin: false });
      }
      if (!mk) return null;
      return mk.then(function (u) { return u ? { url: u, src: 'map' } : null; })
        .catch(function () { return null; });
    });
    function tag(src) {
      return function (u) { return u ? { url: u, src: src } : null; };
    }
    return steps.reduce(function (chain, step) {
      return chain.then(function (res) { return res || step().catch(function () { return null; }); });
    }, Promise.resolve(null));
  }

  /* Poskrbi, da ima kartica sliko: nastavi jo, če je znana; sicer jo poišče,
     shrani v zapis in posodobi le to kartico (brez ponovnega izrisa seznama). */
  function ensureCardImage(rec, imgEl, rowEl) {
    if (rec.image) { imgEl.src = rec.image; rowEl.classList.add('has-img'); return; }
    if (wlExplore) return;                       // tuj seznam — ne pišemo v tuje zapise
    if (wlImgInflight[rec.id]) return;
    if (rec.image === '' && rec.imgVer === WL_IMG_VER &&
        Date.now() - (rec.imgTs || 0) < WL_IMG_MAXAGE) return;

    wlImgInflight[rec.id] = true;
    resolveCardImage(rec).then(function (res) {
      delete wlImgInflight[rec.id];
      var list = loadWishlist();
      var it = list.find(function (x) { return x.id === rec.id; });
      if (!it) return;
      it.image = res ? res.url : '';
      it.imgSrc = res ? res.src : undefined;
      it.imgTs = Date.now();
      it.imgVer = WL_IMG_VER;
      persistWishlist(list);
      if (res && rowEl.isConnected) {
        imgEl.src = res.url;
        rowEl.classList.add('has-img');
      }
    }).catch(function () { delete wlImgInflight[rec.id]; });
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
  var ICON_BACK = '<path d="M20 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

  function buildResultPopup(lat, lng, knownName, allowRepeat, onBack) {
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
        queryMarkedPoint(spec.areaFilter, spec.eleMin, spec.eleMax, spec.popularOnly).then(function (found) {
          repeatBtn.disabled = false;
          repeatBtn.setLabel('Vrzi ponovno');
          resolveThrow(spec, found);
        });
      });
      wrap.appendChild(repeatBtn);
    }

    /* "Nazaj na seznam" — le kadar smo okno odprli s klikom na destinacijo v
       predalu "Vem kam grem"; vrne nas v isti (filtrirani) seznam. */
    if (typeof onBack === 'function') {
      var backBtn = iconButton('popup-back-btn', 'Nazaj na seznam', ICON_BACK);
      backBtn.addEventListener('click', onBack);
      wrap.appendChild(backBtn);
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

  function openResultPopup(lat, lng, name, allowRepeat, onBack) {
    resultMarker.bindPopup(buildResultPopup(lat, lng, name, allowRepeat, onBack), { offset: [0, -28] }).openPopup();
  }

  /* Okno ob napaki iskanja (glej showErrorResult) — enak vzorec gumbov kot pri
     zadetku (Spremeni vrednosti / ponovitev), le brez koordinat in Shrani. */
  function buildErrorPopup(spec) {
    var wrap = document.createElement('div');
    wrap.className = 'result-popup';

    var title = document.createElement('div');
    title.className = 'popup-title';
    title.textContent = 'Iskanje vrhov ni uspelo';
    wrap.appendChild(title);

    var editBtn = iconButton('popup-edit-btn', 'Spremeni vrednosti', ICON_TUNE);
    editBtn.addEventListener('click', reopenPanelFromLastThrow);
    wrap.appendChild(editBtn);

    var retryBtn = iconButton('popup-repeat-btn', 'Poskusi znova', ICON_REPEAT);
    retryBtn.addEventListener('click', function () {
      retryBtn.disabled = true;
      retryBtn.setLabel('Iščem …');
      queryMarkedPoint(spec.areaFilter, spec.eleMin, spec.eleMax, spec.popularOnly).then(function (found) {
        retryBtn.disabled = false;
        retryBtn.setLabel('Poskusi znova');
        resolveThrow(spec, found);
      });
    });
    wrap.appendChild(retryBtn);

    return wrap;
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

  /* Kazalec navzdol (kot v filtrih) — zavrti se ob zloženi skupini. */
  function chevronDown() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('class', 'wl-filter-chevron');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  /* Ikona za vrsto destinacije — glede na vrsto. Vgrajene vrste imajo svojo
     ikono, lastne pa dobijo ustrezno po ključnih besedah v imenu; če nič ne
     ustreza, splošna oznaka (kartografska bucika). Ista ikona v obrazcu in
     na kartici. */
  var TYPE_ICON_PATHS = {
    vrh: '<path d="m2.5 18 5-9 3.3 4.8 2-3L21.5 18H2.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="17.5" cy="7" r="1.3" stroke="currentColor" stroke-width="1.4"/>',
    slap: '<path d="M5 5h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 5v10M12 5v12M16 5v10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 20c2 0 2-1.8 4-1.8s2 1.8 4 1.8 2-1.8 4-1.8 2 1.8 4 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    jezero: '<path d="M3 10c2.4 0 2.4 2 4.8 2S10.2 10 12.6 10 15 12 17.4 12 19.8 10 21 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 15c2.4 0 2.4 2 4.8 2S10.2 15 12.6 15 15 17 17.4 17 19.8 15 21 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    soteska: '<path d="M6 3v13l2.5 5M18 3v13l-2.5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    jama: '<path d="M3 21v-4a9 9 0 0 1 18 0v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 21h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9 21v-3a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    grad: '<path d="M5 21V8l2 1V6h3v3l2-1 2 1V6h3v3l2-1v13" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 21h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10 21v-4h4v4" stroke="currentColor" stroke-width="1.6"/>',
    cerkev: '<path d="M12 2v5M9.5 4.2h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 21V10l6-4 6 4v11" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10 21v-4a2 2 0 0 1 4 0v4" stroke="currentColor" stroke-width="1.6"/>',
    razgled: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/>',
    izvir: '<path d="M12 3s6.5 7 6.5 11a6.5 6.5 0 1 1-13 0C5.5 10 12 3 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    plaza: '<circle cx="12" cy="9" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.6v1.6M5.8 9H4.2M19.8 9h-1.6M7.4 4.4 6.3 3.3M17.7 4.4l1-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M3 19.5c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    gozd: '<path d="M12 3 7 11h3l-3 5h10l-3-5h3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 16v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    reka: '<path d="M7 3c0 4-3 5-3 9s3 5 3 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17 3c0 4 3 5 3 9s-3 5-3 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 6v3M12 13v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    muzej: '<path d="M3 9 12 4l9 5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 9h18M4 21h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6 9v10M10 9v10M14 9v10M18 9v10" stroke="currentColor" stroke-width="1.6"/>',
    koca: '<path d="m3 11 9-7 9 7" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 9.5V20h12V9.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 20v-5h4v5" stroke="currentColor" stroke-width="1.6"/>',
    most: '<path d="M2 13h20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 13c0-4 3-4.5 3-4.5M20 13c0-4-3-4.5-3-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 13v5M21 13v5M8.5 13v5M15.5 13v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  var TYPE_ICON_FALLBACK = '<path d="M12 21s6-6 6-11a6 6 0 1 0-12 0c0 5 6 11 6 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2" stroke="currentColor" stroke-width="1.6"/>';
  var TYPE_ICON_KEYWORDS = [
    [/koca|koce|bivak|zaveti|planinsk\w* dom|kmetij/, 'koca'],
    [/vrh|gora|gorsk|hrib|greben|masiv/, 'vrh'],
    [/slap/, 'slap'],
    [/jezer|ribnik|mlaka|lagun/, 'jezero'],
    [/sotesk|korit|kanjon|vintgar|klisur|tolmun|grap/, 'soteska'],
    [/jama|brezno|podzem|spilj/, 'jama'],
    [/grad|razvalin|utrdb|dvorec|palac/, 'grad'],
    [/cerkev|cerkv|crkv|kapel|samostan|bazilik|svetisc|romars|katedral/, 'cerkev'],
    [/razgled|panoram|pogled|vista|belveder|stolp/, 'razgled'],
    [/izvir|vrelec|studenec|sotocj|terma|toplic/, 'izvir'],
    [/plaz|kopalis|obala|morj|zaliv/, 'plaza'],
    [/gozd|drevo|park|arboretum|drevored/, 'gozd'],
    [/reka|potok|struga|kanal|rijek/, 'reka'],
    [/muzej|galerij|razstav|spomenik|kip|obelisk/, 'muzej'],
    [/most|brv/, 'most']
  ];
  function normType(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');
  }
  function iconKeyForType(key) {
    var k = normType(key);
    if (TYPE_ICON_PATHS[k]) return k;
    for (var i = 0; i < TYPE_ICON_KEYWORDS.length; i++) {
      if (TYPE_ICON_KEYWORDS[i][0].test(k)) return TYPE_ICON_KEYWORDS[i][1];
    }
    return null;
  }
  function typeIcon(key) {
    var ik = iconKeyForType(key);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = (ik && TYPE_ICON_PATHS[ik]) || TYPE_ICON_FALLBACK;
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

  // ============================================================ naslovna stran
  /* Pokaže se ob vsakem odprtju čez ves zaslon. "Pojdi naključno" jo skrije in
     odkrije zemljevid, gumb "domov" (zgoraj levo) jo prikliče nazaj. Zemljevid
     se inicializira za njo, zato ob skritju kličemo map.invalidateSize(). */
  var landingOverlay = document.getElementById('landingOverlay');
  var btnLandingRandom = document.getElementById('btnLandingRandom');
  var btnLandingWishlist = document.getElementById('btnLandingWishlist');
  var btnHome = document.getElementById('btnHome');
  var btnMapWishlist = document.getElementById('btnMapWishlist');

  /* Ali je začetni zaslon skrit (smo na zemljevidu / "Pojdi naključno") — se
     ohrani po osvežitvi, da nas refresh ne vrže nazaj na začetno stran. */
  var LANDING_HIDDEN_KEY = 'kam:landingHidden';
  function rememberLandingHidden(hidden) {
    try {
      if (hidden) localStorage.setItem(LANDING_HIDDEN_KEY, '1');
      else localStorage.removeItem(LANDING_HIDDEN_KEY);
    } catch (e) {}
  }
  function showLanding() {
    landingOverlay.classList.remove('hidden');
    document.documentElement.classList.remove('landing-restored');
    rememberLandingHidden(false);
  }
  function hideLanding() {
    if (landingOverlay.classList.contains('hidden')) return;
    landingOverlay.classList.add('hidden');
    rememberLandingHidden(true);
    map.invalidateSize();
  }

  btnLandingRandom.addEventListener('click', hideLanding);
  btnHome.addEventListener('click', showLanding);

  // Obnovi stanje po osvežitvi: če smo bili na zemljevidu, ostanemo tam.
  try {
    if (localStorage.getItem(LANDING_HIDDEN_KEY) === '1') hideLanding();
  } catch (e) {}

  // ============================================================ "Kam želim"
  /* Vnaprej pripravljene države in njihove regije za zavihke/podzavihke in
     spustna seznama v obrazcu. Zapisi lahko vsebujejo tudi druge države/regije
     (npr. iz uvoza) — te se pridružijo iz samih zapisov. */
  var WL_COUNTRIES = ['Slovenija', 'Italija', 'Avstrija', 'Hrvaška'];
  var WL_ALL = '__all__';   // "izbrano vse" za regijo / vrsto v filtrih
  var COUNTRY_REGIONS = {
    // 12 statističnih regij (SURS). Regija se samodejno določi iz koordinat
    // (Overpass is_in -> admin meje); brez koordinat jo izbereš ročno.
    'Slovenija': ['Pomurska', 'Podravska', 'Koroška', 'Savinjska', 'Zasavska',
      'Posavska', 'Jugovzhodna Slovenija', 'Osrednjeslovenska', 'Gorenjska',
      'Primorsko-notranjska', 'Goriška', 'Obalno-kraška'],
    'Italija': ['Furlanija - Julijska krajina', 'Benečija', 'Tridentinsko - Zgornje Poadižje',
      'Lombardija', 'Piemont', 'Dolina Aoste', 'Ligurija', 'Emilija - Romanja', 'Toskana',
      'Umbrija', 'Marke', 'Lacij', 'Abruci', 'Molize', 'Kampanija', 'Apulija', 'Bazilikata',
      'Kalabrija', 'Sicilija', 'Sardinija'],
    'Avstrija': ['Koroška', 'Štajerska', 'Tirolska', 'Salzburška', 'Zgornja Avstrija',
      'Spodnja Avstrija', 'Predarlska', 'Gradiščanska', 'Dunaj'],
    'Hrvaška': ['Istra', 'Kvarner', 'Gorski kotar', 'Lika', 'Sjeverna Dalmacija',
      'Srednja Dalmacija', 'Južna Dalmacija', 'Hrvaško zagorje', 'Slavonija', 'Banovina',
      'Zagreb z okolico']
  };
  // Vgrajene vrste; uporabnik lahko doda svoje (gumb "+" v obrazcu). Lastne
  // vrste se hranijo z ostalimi podatki (KamData -> ključ 'types') in se
  // sinhronizirajo med napravami. Ključ lastne vrste je kar njeno ime.
  var WL_TYPES = [
    { key: 'slap', label: 'Slap' },
    { key: 'jezero', label: 'Jezero' },
    { key: 'soteska', label: 'Soteska' },
    { key: 'vrh', label: 'Vrh' }
  ];

  function loadWishlist()        { return window.KamData ? KamData.get('wishlist') : []; }
  function persistWishlist(list) { return window.KamData ? KamData.set('wishlist', list) : false; }

  function loadCustomTypes() {
    var raw = window.KamData ? KamData.get('types') : [];
    return raw.filter(function (t) {
      return t && typeof t.key === 'string' && t.key && typeof t.label === 'string' && t.label;
    });
  }
  function persistCustomTypes(list) { return window.KamData ? KamData.set('types', list) : false; }

  /* Vse vrste za obrazec: vgrajene + lastne + morebitne s trenutnega zapisa
     (extra), ki jih ni več na seznamu. Brez podvojenih ključev. */
  function allTypes(extra) {
    var out = WL_TYPES.slice();
    var seen = {};
    out.forEach(function (t) { seen[t.key] = true; });
    loadCustomTypes().forEach(function (t) {
      if (!seen[t.key]) { seen[t.key] = true; out.push(t); }
    });
    (extra || []).forEach(function (k) {
      if (k && !seen[k]) { seen[k] = true; out.push({ key: k, label: k }); }
    });
    return out;
  }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function slCmp(a, b) { return String(a).localeCompare(String(b), 'sl'); }

  /* Razbere koordinate iz več oblik in vrne { lat, lng } ali null. Podpira:
       "46.3190927, 14.7246127"        (pika = decimalka, vejica = ločilo)
       "46,3190927°N 14,7246127°E"     (vejica = decimalka, oznake polobl)
       "46,3190927, 14,7246127"        (vejica = decimalka in ločilo)
       "46°16′25″N, 13°48′44″E"        (stopinje/minute/sekunde)
       vrstni red N/E ni pomemben; S in W dasta negativno vrednost. */
  function round7(n) { return Math.round(n * 1e7) / 1e7; }   // ~1 cm natančnost
  function parseLatLng(raw) {
    if (!raw) return null;
    var s = String(raw).trim().toUpperCase()
      .replace(/º/g, '°')      // º -> °
      .replace(/[′’]/g, "'")   // ′ ’ -> '
      .replace(/[″”]/g, '"');  // ″ ” -> "

    function assign(lat, lng) {
      return (isFinite(lat) && isFinite(lng)) ? { lat: lat, lng: lng } : null;
    }
    function place(v, h, o) {
      if (h === 'S' || h === 'W') v = -Math.abs(v); else v = Math.abs(v);
      if (h === 'N' || h === 'S') o.lat = v; else o.lng = v;
    }

    // -- stopinje/minute(/sekunde): 46°16'25"N   46° 16' 25.5" N   46°16.5'N
    var dmsRe = /(-?\d+)\s*°\s*(\d+(?:[.,]\d+)?)\s*'\s*(?:(\d+(?:[.,]\d+)?)\s*"?\s*)?([NSEW])/g;
    var dms = s.match(dmsRe);
    if (dms && dms.length === 2) {
      var o1 = {};
      dms.forEach(function (t) {
        var m = t.match(/(-?\d+)\s*°\s*(\d+(?:[.,]\d+)?)\s*'\s*(?:(\d+(?:[.,]\d+)?)\s*"?\s*)?([NSEW])/);
        var deg = Math.abs(parseFloat(m[1]));
        var min = parseFloat(m[2].replace(',', '.'));
        var sec = m[3] ? parseFloat(m[3].replace(',', '.')) : 0;
        place(deg + min / 60 + sec / 3600, m[4], o1);
      });
      return assign(o1.lat, o1.lng);
    }

    // -- decimalne stopinje z oznakami polobl: 46,3190927°N 14,7246127°E
    var d = s.replace(/°/g, ' ');
    var toks = d.match(/-?\d+(?:[.,]\d+)?\s*[NSEW]/g);
    if (toks && toks.length === 2) {
      var o2 = {};
      toks.forEach(function (t) {
        var mm = t.match(/(-?\d+(?:[.,]\d+)?)\s*([NSEW])/);
        place(parseFloat(mm[1].replace(',', '.')), mm[2], o2);
      });
      return assign(o2.lat, o2.lng);
    }

    // -- brez oznak: dve decimalni števili (pika ali vejica kot decimalka)
    var nums = d.replace(/[NSEW]/g, ' ').match(/-?\d+(?:[.,]\d+)?/g) || [];
    if (nums.length === 2) {
      var a = parseFloat(nums[0].replace(',', '.'));
      var b = parseFloat(nums[1].replace(',', '.'));
      if (isFinite(a) && isFinite(b)) return { lat: a, lng: b };
    }
    return null;
  }

  /* Samodejno določi slovensko statistično regijo iz koordinat — point-in-polygon
     nad poenostavljenimi mejami (js/si-regions.js, GADM). Sinhrono, deluje tudi
     brez povezave. Vrne ime regije ali null (npr. točka izven Slovenije). */
  function pointInRing(lng, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) &&
          (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function regionFromCoords(lat, lng) {
    if (!isNum(lat) || !isNum(lng) || !window.SI_REGIONS) return null;
    for (var name in window.SI_REGIONS) {
      if (!window.SI_REGIONS.hasOwnProperty(name)) continue;
      var polys = window.SI_REGIONS[name];
      for (var p = 0; p < polys.length; p++) {
        if (pointInRing(lng, lat, polys[p])) return name;
      }
    }
    return null;
  }

  var wishlistSection = document.getElementById('wishlistSection');
  var wishlistBackdrop = document.getElementById('wishlistBackdrop');
  var btnWishlistClose = document.getElementById('btnWishlistClose');
  var menuItemWishlist = document.getElementById('menuItemWishlist');
  var wishlistBrowse = document.getElementById('wishlistBrowse');
  var wishlistFormView = document.getElementById('wishlistFormView');
  var wishlistFormTitle = document.getElementById('wishlistFormTitle');
  var wishlistTabs = document.getElementById('wishlistTabs');
  var wishlistSubtabs = document.getElementById('wishlistSubtabs');
  var wishlistList = document.getElementById('wishlistList');
  var wishlistEmpty = document.getElementById('wishlistEmpty');
  var wlFilters = document.getElementById('wlFilters');
  var wishlistTypeTabs = document.getElementById('wishlistTypeTabs');
  var wlTypeGroup = document.getElementById('wlTypeGroup');
  var wlRegionGroup = document.getElementById('wlRegionGroup');
  var wlExploreGroup = document.getElementById('wlExploreGroup');
  var wlExploreList = document.getElementById('wlExploreList');
  var wlExploreBanner = document.getElementById('wlExploreBanner');
  var wlExploreBannerText = document.getElementById('wlExploreBannerText');
  var wlExploreBack = document.getElementById('wlExploreBack');
  var chkShareLists = document.getElementById('chkShareLists');
  var wlSortRegionBtn = document.getElementById('wlSortRegion');
  var wlSortAlphaBtn = document.getElementById('wlSortAlpha');
  var btnWlFilterToggle = document.getElementById('btnWlFilterToggle');
  var btnAddDest = document.getElementById('btnAddDest');
  var btnImportWishlist = document.getElementById('btnImportWishlist');
  var btnExportWishlist = document.getElementById('btnExportWishlist');
  var importWishlistFile = document.getElementById('importWishlistFile');
  var destName = document.getElementById('destName');
  var destCountry = document.getElementById('destCountry');
  var destRegion = document.getElementById('destRegion');
  var destCoords = document.getElementById('destCoords');
  var destTypes = document.getElementById('destTypes');
  var btnDestCancel = document.getElementById('btnDestCancel');
  var btnDestSave = document.getElementById('btnDestSave');

  var wlActiveCountry = 'Slovenija';
  var wlActiveRegion = WL_ALL;
  var wlActiveType = WL_ALL;
  var wlEditId = null;

  /* Izbrani filtri (država / regija / vrsta) se ohranijo po osvežitvi. Če
     shranjena vrednost ne obstaja več, jo renderWishlist samodejno popravi. */
  var WL_FILTERS_KEY = 'kam:wlActiveFilters';
  function saveActiveFilters() {
    try {
      localStorage.setItem(WL_FILTERS_KEY, JSON.stringify({
        country: wlActiveCountry, region: wlActiveRegion, type: wlActiveType
      }));
    } catch (e) {}
  }
  try {
    var _wlf = JSON.parse(localStorage.getItem(WL_FILTERS_KEY) || '{}');
    if (_wlf && typeof _wlf === 'object') {
      if (typeof _wlf.country === 'string') wlActiveCountry = _wlf.country;
      if (typeof _wlf.region === 'string') wlActiveRegion = _wlf.region;
      if (typeof _wlf.type === 'string') wlActiveType = _wlf.type;
    }
  } catch (e) {}

  /* Pogled seznama: 'region' (združeno po regijah, kot doslej) ali 'alpha'
     (cel seznam države po abecedi, brez regij). Ohrani se po osvežitvi. */
  var WL_SORT_KEY = 'kam:wlSort';
  var wlSortMode = 'region';
  try { if (localStorage.getItem(WL_SORT_KEY) === 'alpha') wlSortMode = 'alpha'; } catch (e) {}
  function applySortButtons() {
    wlSortRegionBtn.classList.toggle('active', wlSortMode === 'region');
    wlSortAlphaBtn.classList.toggle('active', wlSortMode === 'alpha');
  }
  function setSortMode(mode) {
    if (mode === wlSortMode) return;
    wlSortMode = mode;
    try { localStorage.setItem(WL_SORT_KEY, mode); } catch (e) {}
    applySortButtons();
    renderWishlist();
  }
  applySortButtons();
  wlSortRegionBtn.addEventListener('click', function () { setSortMode('region'); });
  wlSortAlphaBtn.addEventListener('click', function () { setSortMode('alpha'); });

  /* "Razišči ideje drugih" — gumbi oseb, ki so v nastavitvah vklopile "Prikaži
     točke ostalim". Klik naloži njihov seznam (samo za ogled). wlExplore == null
     pomeni: gledam svoj seznam. */
  var wlExplore = null;   // null | { userId, name, list: [] }
  var wlFiltersBeforeExplore = null;
  var sharingReady = !!(window.KamData && KamData.listShared);

  function exitExplore() {
    if (!wlExplore) return;
    wlExplore = null;
    if (wlFiltersBeforeExplore) {
      wlActiveCountry = wlFiltersBeforeExplore.c;
      wlActiveRegion = wlFiltersBeforeExplore.r;
      wlActiveType = wlFiltersBeforeExplore.t;
      wlFiltersBeforeExplore = null;
    }
    renderExploreList();
    renderWishlist();
  }
  function enterExplore(userId, name) {
    if (!sharingReady) return;
    KamData.getShared(userId).then(function (list) {
      if (!wlExplore) {
        wlFiltersBeforeExplore = { c: wlActiveCountry, r: wlActiveRegion, t: wlActiveType };
      }
      wlExplore = { userId: userId, name: name, list: Array.isArray(list) ? list : [] };
      wlActiveCountry = WL_ALL; wlActiveRegion = WL_ALL; wlActiveType = WL_ALL;
      renderExploreList();
      renderWishlist();
      var inner = wishlistSection.querySelector('.wl-browse-inner');
      if (inner) inner.scrollTop = 0;
    });
  }

  function renderExploreList() {
    if (!wlExploreList) return;
    wlExploreList.innerHTML = '';
    if (!sharingReady) {
      var m = document.createElement('p');
      m.className = 'wl-explore-empty';
      m.textContent = 'Deljenje ni na voljo.';
      wlExploreList.appendChild(m);
      return;
    }
    KamData.listShared().then(function (people) {
      wlExploreList.innerHTML = '';
      if (wlExplore) {
        var mine = document.createElement('button');
        mine.type = 'button';
        mine.className = 'wl-explore-btn wl-explore-mine';
        mine.textContent = 'Moj seznam';
        mine.addEventListener('click', exitExplore);
        wlExploreList.appendChild(mine);
      }
      if (!people.length) {
        var e = document.createElement('p');
        e.className = 'wl-explore-empty';
        e.textContent = 'Nihče ne deli seznama.';
        wlExploreList.appendChild(e);
        return;
      }
      people.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wl-explore-btn' +
          (wlExplore && wlExplore.userId === p.userId ? ' active' : '');
        b.textContent = 'Ideje od ' + p.name;
        b.addEventListener('click', function () { enterExplore(p.userId, p.name); });
        wlExploreList.appendChild(b);
      });
    });
  }

  wlExploreBack.addEventListener('click', exitExplore);

  /* Nastavitev "Deljenje seznama" v uporabniškem meniju. */
  function syncShareCheckbox() {
    if (chkShareLists && window.KamData && KamData.isShared) {
      chkShareLists.checked = KamData.isShared();
    }
  }
  if (chkShareLists) {
    chkShareLists.addEventListener('change', function () {
      if (!(window.KamData && KamData.setShare)) { chkShareLists.checked = false; return; }
      var want = chkShareLists.checked;
      KamData.setShare(want).then(function (ok) {
        if (!ok) {
          chkShareLists.checked = !want;
          showToast('Nastavitve ni bilo mogoče shraniti.', 3000);
        } else {
          showToast(want ? 'Tvoj seznam je zdaj viden drugim.' : 'Deljenje izklopljeno.', 2200);
        }
      });
    });
  }

  // Predal zdrsne z desne čez zemljevid/naslovnico — isti vzorec kot drugi seznami.
  // Zapomni si, da je odprt, da po osvežitvi strani ostanemo tukaj (glej dno startApp).
  var WL_OPEN_KEY = 'kam:wlOpen';
  function rememberWishlistOpen(open) {
    try {
      if (open) localStorage.setItem(WL_OPEN_KEY, '1');
      else localStorage.removeItem(WL_OPEN_KEY);
    } catch (e) {}
  }
  function openWishlistDrawer() {
    wishlistFormView.hidden = true;
    wishlistBrowse.hidden = false;
    wishlistSection.classList.remove('wl-form-open');
    wishlistSection.classList.add('open');
    wishlistBackdrop.classList.add('open');
    rememberWishlistOpen(true);
    if (wlExplore && wlFiltersBeforeExplore) {
      wlActiveCountry = wlFiltersBeforeExplore.c;
      wlActiveRegion = wlFiltersBeforeExplore.r;
      wlActiveType = wlFiltersBeforeExplore.t;
    }
    wlExplore = null;              // vedno začnemo na svojem seznamu
    wlFiltersBeforeExplore = null;
    renderExploreList();
    renderWishlist();
  }
  function closeWishlistDrawer() {
    wishlistSection.classList.remove('open');
    wishlistBackdrop.classList.remove('open');
    rememberWishlistOpen(false);
  }

  btnWishlistClose.addEventListener('click', closeWishlistDrawer);
  wishlistBackdrop.addEventListener('click', closeWishlistDrawer);
  btnLandingWishlist.addEventListener('click', openWishlistDrawer);
  if (btnMapWishlist) btnMapWishlist.addEventListener('click', openWishlistDrawer);
  menuItemWishlist.addEventListener('click', function () {
    closeMenu();
    openWishlistDrawer();
  });

  /* Gumb za filter v navbaru (mobilno) — preklopi filtrirni pas pod navbarom.
     Stanje se ohrani po osvežitvi (localStorage). */
  var WL_FILTERS_OPEN_KEY = 'kam:wlFiltersOpen';
  function setFiltersOpen(open, persist) {
    wishlistSection.classList.toggle('wl-filters-open', open);
    btnWlFilterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (persist) {
      try {
        if (open) localStorage.setItem(WL_FILTERS_OPEN_KEY, '1');
        else localStorage.removeItem(WL_FILTERS_OPEN_KEY);
      } catch (e) {}
    }
  }
  (function () {
    var open = false;
    try { open = localStorage.getItem(WL_FILTERS_OPEN_KEY) === '1'; } catch (e) {}
    setFiltersOpen(open, false);
  })();
  btnWlFilterToggle.addEventListener('click', function () {
    setFiltersOpen(!wishlistSection.classList.contains('wl-filters-open'), true);
  });

  /* Vsak filter (Država / Regija / Vrsta) je zložljiv; klik po celotni naslovni
     vrstici ga odpre ali zapre. Stanje se ohrani po osvežitvi (localStorage). */
  var WL_FILTER_COLLAPSE_KEY = 'kam:wlFilterCollapsed';
  function loadFilterCollapsed() {
    try {
      var o = JSON.parse(localStorage.getItem(WL_FILTER_COLLAPSE_KEY) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function saveFilterCollapsed(o) {
    try { localStorage.setItem(WL_FILTER_COLLAPSE_KEY, JSON.stringify(o)); } catch (e) {}
  }

  /* Zloženost regijskih skupin na seznamu (pri "Vse regije"), ohranjena po
     osvežitvi. Ključ je "<država> <regija>". */
  var WL_REGION_COLLAPSE_KEY = 'kam:wlRegionCollapsed';
  function loadRegionCollapsed() {
    try {
      var o = JSON.parse(localStorage.getItem(WL_REGION_COLLAPSE_KEY) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function saveRegionCollapsed(o) {
    try { localStorage.setItem(WL_REGION_COLLAPSE_KEY, JSON.stringify(o)); } catch (e) {}
  }

  (function initFilterCollapsers() {
    var state = loadFilterCollapsed();
    Array.prototype.forEach.call(
      document.querySelectorAll('#wlFilters .wl-filter-group'),
      function (group) {
        var key = group.getAttribute('data-filter');
        var head = group.querySelector('.wl-filter-head');
        if (!key || !head) return;
        var setCollapsed = function (collapsed) {
          group.classList.toggle('collapsed', collapsed);
          head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        };
        setCollapsed(!!state[key]);
        head.addEventListener('click', function () {
          var collapsed = !group.classList.contains('collapsed');
          setCollapsed(collapsed);
          var s = loadFilterCollapsed();
          s[key] = collapsed;
          saveFilterCollapsed(s);
        });
      }
    );
  })();

  /* Ikona računa v navbaru predala — odpre isti meni kot na zemljevidu
     (Shranjene točke / območja / Gorovja, ime in e-pošta, Odjava). Ime in
     e-pošto prevzame iz glavnega menija, ki ju napolni auth.js ob prijavi.
     Odjava sproži klik na pravi #signoutBtn. */
  var btnWlUser = document.getElementById('btnWlUser');
  var wlMenuDropdown = document.getElementById('wlMenuDropdown');
  var wlMenuUserName = document.getElementById('wlMenuUserName');
  var wlMenuUserEmail = document.getElementById('wlMenuUserEmail');
  function closeWlUserMenu() {
    wlMenuDropdown.hidden = true;
    btnWlUser.setAttribute('aria-expanded', 'false');
  }
  function openWlUserMenu() {
    wlMenuUserName.textContent = menuUserName ? menuUserName.textContent : '';
    wlMenuUserEmail.textContent = menuUserEmail ? menuUserEmail.textContent : '';
    syncShareCheckbox();
    wlMenuDropdown.hidden = false;
    btnWlUser.setAttribute('aria-expanded', 'true');
  }
  btnWlUser.addEventListener('click', function (e) {
    e.stopPropagation();
    if (wlMenuDropdown.hidden) openWlUserMenu(); else closeWlUserMenu();
  });
  document.addEventListener('click', function (e) {
    if (wlMenuDropdown.hidden) return;
    if (wlMenuDropdown.contains(e.target) || btnWlUser.contains(e.target)) return;
    closeWlUserMenu();
  });
  document.getElementById('wlSignoutBtn').addEventListener('click', function () {
    rememberWishlistOpen(false);
    var real = document.getElementById('signoutBtn');
    if (real) real.click();
  });

  /* Države = vnaprej pripravljene (WL_COUNTRIES) + vse dodatne iz zapisov.
     Pokrajine = fiksni seznam za to državo (COUNTRY_REGIONS) + morebitne
     dodatne iz zapisov. */
  function wlCountries(list) {
    var out = WL_COUNTRIES.slice();
    list.forEach(function (r) {
      if (r.country && out.indexOf(r.country) === -1) out.push(r.country);
    });
    return out;
  }
  function wlRegions(list, country) {
    var out = (COUNTRY_REGIONS[country] || []).slice();
    list.forEach(function (r) {
      if (r.country === country && r.region && out.indexOf(r.region) === -1) out.push(r.region);
    });
    return out;
  }

  /* Vrstica pilul za filter. `values` so nizi ali objekti { value, label }.
     Prva vrstica (wishlistTabs) so države, ostale (regija, vrsta) so .wl-subtab. */
  function wlPillRow(container, values, active, onPick) {
    container.innerHTML = '';
    values.forEach(function (raw) {
      var val = (raw && typeof raw === 'object') ? raw.value : raw;
      var label = (raw && typeof raw === 'object') ? raw.label : raw;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = (container === wishlistTabs ? 'wl-tab' : 'wl-subtab') + (val === active ? ' active' : '');
      b.textContent = label;
      if (typeof onPick.count === 'function') {
        var n = onPick.count(val);
        if (n) {
          var s = document.createElement('span');
          s.className = 'wl-tab-count';
          s.textContent = ' ' + n;
          b.appendChild(s);
        }
      }
      b.addEventListener('click', function () { onPick(val); });
      container.appendChild(b);
    });
  }

  function buildWlRow(rec) {
    var readOnly = !!wlExplore;   // gledam tuj seznam — brez urejanja
    var row = document.createElement('div');
    row.className = 'area-row wl-row' + (!readOnly && rec.visited ? ' visited' : '');

    // Samodejna slika kraja (pas na vrhu kartice). Vedno vstavimo <img>, razred
    // .has-img (in s tem prikaz) doda ensureCardImage, ko je vir znan.
    var img = document.createElement('img');
    img.className = 'wl-row-img';
    img.loading = 'lazy';
    img.alt = '';
    row.appendChild(img);

    var main = document.createElement('div');
    main.className = 'wl-row-main';

    if (!readOnly) {
      var chk = document.createElement('button');
      chk.type = 'button';
      chk.className = 'wl-check' + (rec.visited ? ' on' : '');
      chk.title = rec.visited ? 'Označi kot neobiskano' : 'Označi kot obiskano';
      chk.addEventListener('click', function (e) {
        e.stopPropagation();
        var l = loadWishlist();
        var it = l.find(function (x) { return x.id === rec.id; });
        if (it) it.visited = !it.visited;
        persistWishlist(l);
        renderWishlist();
      });
      main.appendChild(chk);
    }

    var textWrap = document.createElement('div');
    textWrap.className = 'area-row-text';

    var title = document.createElement('div');
    title.className = 'area-row-name';
    title.textContent = rec.name;
    title.title = rec.name;
    textWrap.appendChild(title);

    /* Vrsta destinacije (značke z ikono) in koordinate v isti vrstici —
       koordinate poravnane desno. */
    var hasTypes = rec.types && rec.types.length;
    var hasCoords = isNum(rec.lat) && isNum(rec.lng);
    if (hasTypes || hasCoords) {
      var metaLine = document.createElement('div');
      metaLine.className = 'wl-meta-line';

      if (hasTypes) {
        var badges = document.createElement('div');
        badges.className = 'wl-badges';
        var types = allTypes();
        rec.types.forEach(function (t) {
          var meta = types.filter(function (x) { return x.key === t; })[0];
          var b = document.createElement('span');
          b.className = 'wl-type-badge';
          b.appendChild(typeIcon(t));
          b.appendChild(document.createTextNode(meta ? meta.label : t));
          badges.appendChild(b);
        });
        metaLine.appendChild(badges);
      }

      if (hasCoords) {
        var co = document.createElement('div');
        co.className = 'wl-row-coords';
        co.textContent = rec.lat.toFixed(4) + ', ' + rec.lng.toFixed(4);
        metaLine.appendChild(co);
      }

      textWrap.appendChild(metaLine);
    }

    main.appendChild(textWrap);
    row.appendChild(main);

    if (!readOnly) {
      var actions = document.createElement('div');
      actions.className = 'area-row-actions';

      var edit = document.createElement('button');
      edit.className = 'saved-card-delete area-row-rename';
      edit.type = 'button';
      edit.title = 'Uredi';
      edit.appendChild(renamePin());
      edit.addEventListener('click', function (e) {
        e.stopPropagation();
        openWishlistForm(rec);
      });
      actions.appendChild(edit);

      var del = document.createElement('button');
      del.className = 'saved-card-delete';
      del.type = 'button';
      del.title = 'Izbriši';
      del.appendChild(deletePin());
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        persistWishlist(loadWishlist().filter(function (x) { return x.id !== rec.id; }));
        renderWishlist();
      });
      actions.appendChild(del);
      row.appendChild(actions);
    }

    row.addEventListener('click', function () {
      if (!hasCoords) { showToast('Ni koordinat za to destinacijo.', 2500); return; }
      // Zapomni si mesto v seznamu (in morebiten ogled tujih idej), da nas
      // gumb "Nazaj" vrne točno sem.
      var innerEl = wishlistSection.querySelector('.wl-browse-inner');
      var savedScroll = {
        inner: innerEl ? innerEl.scrollTop : 0,
        browse: wishlistBrowse ? wishlistBrowse.scrollTop : 0
      };
      var wasExplore = wlExplore;
      closeWishlistDrawer();
      hideLanding();
      map.flyTo([rec.lat, rec.lng], 13);
      if (resultMarker) map.removeLayer(resultMarker);
      resultMarker = L.marker([rec.lat, rec.lng], { icon: resultIcon }).addTo(map);
      openResultPopup(rec.lat, rec.lng, rec.name, false, function backToWishlist() {
        map.closePopup();
        if (resultMarker) { map.removeLayer(resultMarker); resultMarker = null; }
        openWishlistDrawer();
        if (wasExplore) { wlExplore = wasExplore; renderExploreList(); renderWishlist(); }
        var el = wishlistSection.querySelector('.wl-browse-inner');
        if (el) el.scrollTop = savedScroll.inner;
        if (wishlistBrowse) wishlistBrowse.scrollTop = savedScroll.browse;
      });
    });

    ensureCardImage(rec, img, row);
    return row;
  }

  /* Trinivojsko filtriranje: Država -> Regija -> Vrsta. Regija in vrsta imata
     možnost "Vse" (WL_ALL). Pri "Vse regije" so vrstice združene po regijah s
     podnaslovi; sicer je spodaj še ločen razdelek "Obiskano". */
  function renderWishlist() {
    var exploring = !!wlExplore;
    var vis = function (r) { return !exploring && r.visited; };   // v ogledu ne ločimo "Obiskano"
    var list = exploring ? (wlExplore.list || []) : loadWishlist();

    wishlistSection.classList.toggle('wl-explore', exploring);
    if (wlExploreBanner) {
      wlExploreBanner.hidden = !exploring;
      if (exploring) wlExploreBannerText.textContent = 'Ideje od ' + wlExplore.name;
    }

    var countries = wlCountries(list);
    if (wlActiveCountry !== WL_ALL && countries.indexOf(wlActiveCountry) === -1) wlActiveCountry = countries[0];
    // Na mobilnem pri državi ni gumba "Vse" — če je bil izbran, preskoči na prvo državo.
    var wlMobile = !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches);
    if (wlMobile && wlActiveCountry === WL_ALL && countries.length) wlActiveCountry = countries[0];
    var allCountries = wlActiveCountry === WL_ALL;
    var regions = wlRegions(list, wlActiveCountry);
    if (wlActiveRegion !== WL_ALL && regions.indexOf(wlActiveRegion) === -1) wlActiveRegion = WL_ALL;

    var hasAny = list.length > 0;
    var alpha = wlSortMode === 'alpha';   // cel seznam po abecedi, brez regij
    wishlistEmpty.textContent = exploring
      ? 'Ta oseba nima deljenih destinacij.'
      : 'Ni še destinacij. Dodaj prvo.';
    // Filtri so vidni tudi, ko je moj seznam prazen (za "Razišči ideje drugih").
    var showFilters = hasAny || exploring || sharingReady;
    if (wlFilters) {
      wlFilters.hidden = !showFilters;
      wlFilters.classList.toggle('wl-only-explore', !hasAny && !exploring);
    }
    if (btnWlFilterToggle) btnWlFilterToggle.hidden = !showFilters;
    // Regija nima smisla čez vse države ali v pogledu A–Ž.
    if (wlRegionGroup) wlRegionGroup.hidden = !hasAny || alpha || allCountries;
    wishlistEmpty.hidden = hasAny;
    wishlistTabs.hidden = !hasAny;
    wishlistSubtabs.hidden = !hasAny;

    // -- države (+ "Vse", a ne na mobilnem)
    var countryItems = wlMobile ? [] : [{ value: WL_ALL, label: 'Vse' }];
    countries.forEach(function (c) { countryItems.push({ value: c, label: c }); });
    var pickCountry = function (c) {
      wlActiveCountry = c; wlActiveRegion = WL_ALL; wlActiveType = WL_ALL;
      saveActiveFilters(); renderWishlist();
    };
    pickCountry.count = function (c) {
      return list.filter(function (r) { return c === WL_ALL || r.country === c; }).length;
    };
    wlPillRow(wishlistTabs, countryItems, wlActiveCountry, pickCountry);

    // -- regije (+ "Vse regije")
    var regionItems = [{ value: WL_ALL, label: 'Vse regije' }];
    regions.forEach(function (rg) { regionItems.push({ value: rg, label: rg }); });
    var pickRegion = function (rg) {
      wlActiveRegion = rg; wlActiveType = WL_ALL;
      saveActiveFilters(); renderWishlist();
    };
    pickRegion.count = function (rg) {
      return list.filter(function (r) {
        return r.country === wlActiveCountry && (rg === WL_ALL || r.region === rg);
      }).length;
    };
    wlPillRow(wishlistSubtabs, regionItems, wlActiveRegion, pickRegion);

    // vrstice v obsegu države (+ regija, razen v pogledu A–Ž / "Vse" države),
    // pred filtrom vrste
    var scoped = list.filter(function (r) {
      return (allCountries || r.country === wlActiveCountry) &&
        (alpha || allCountries || wlActiveRegion === WL_ALL || r.region === wlActiveRegion);
    });

    // -- vrste destinacij (+ "Vse"), le tiste, ki se pojavijo v trenutnem obsegu
    var typeKeys = [];
    scoped.forEach(function (r) {
      (r.types || []).forEach(function (t) { if (typeKeys.indexOf(t) === -1) typeKeys.push(t); });
    });
    if (wlActiveType !== WL_ALL && typeKeys.indexOf(wlActiveType) === -1) wlActiveType = WL_ALL;
    if (wishlistTypeTabs) {
      var typeMeta = allTypes(typeKeys);
      var labelFor = function (k) {
        var m = typeMeta.filter(function (x) { return x.key === k; })[0];
        return m ? m.label : k;
      };
      typeKeys.sort(function (a, b) { return slCmp(labelFor(a), labelFor(b)); });
      var typeItems = [{ value: WL_ALL, label: 'Vse' }];
      typeKeys.forEach(function (k) { typeItems.push({ value: k, label: labelFor(k) }); });
      var pickType = function (t) { wlActiveType = t; saveActiveFilters(); renderWishlist(); };
      pickType.count = function (t) {
        return scoped.filter(function (r) {
          return t === WL_ALL || (r.types && r.types.indexOf(t) !== -1);
        }).length;
      };
      wlPillRow(wishlistTypeTabs, typeItems, wlActiveType, pickType);
      if (wlTypeGroup) wlTypeGroup.hidden = !hasAny || !typeKeys.length;
    }

    // -- končni nabor
    var rows = scoped.filter(function (r) {
      return wlActiveType === WL_ALL || (r.types && r.types.indexOf(wlActiveType) !== -1);
    });

    wishlistList.innerHTML = '';
    if (hasAny && !rows.length) {
      var note = document.createElement('p');
      note.className = 'saved-empty';
      note.textContent = 'Ni destinacij za izbrane filtre.';
      wishlistList.appendChild(note);
      return;
    }

    function addRow(rec) { wishlistList.appendChild(buildWlRow(rec)); }

    if (alpha) {
      // Cel seznam po abecedi — brez skupin in razdelka "Obiskano".
      rows.slice()
        .sort(function (a, b) { return slCmp(a.name, b.name); })
        .forEach(addRow);
    } else if (wlActiveRegion === WL_ALL) {
      // Skupine: pri "Vse" državah po državah, sicer po regijah.
      var collapsedRegions = loadRegionCollapsed();
      var byRegion = {};
      rows.forEach(function (r) {
        var k = (allCountries ? r.country : r.region) || 'Drugo';
        (byRegion[k] = byRegion[k] || []).push(r);
      });
      Object.keys(byRegion).sort(slCmp).forEach(function (rg) {
        var recs = byRegion[rg];
        var stateKey = (allCountries ? '__c__' : wlActiveCountry) + '|' + rg;
        var isCollapsed = !!collapsedRegions[stateKey];

        // Skupina = display: contents, da kartice ostanejo v mreži seznama.
        var group = document.createElement('div');
        group.className = 'wl-region-group' + (isCollapsed ? ' collapsed' : '');

        var head = document.createElement('button');
        head.type = 'button';
        head.className = 'wl-region-head';
        head.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        var left = document.createElement('span');
        left.className = 'wl-region-head-left';
        var hn = document.createElement('span'); hn.textContent = rg;
        var hc = document.createElement('span');
        hc.className = 'wl-region-head-count';
        hc.textContent = String(recs.length);
        left.appendChild(hn); left.appendChild(hc);
        head.appendChild(left);
        head.appendChild(chevronDown());
        head.addEventListener('click', function () {
          var nowCollapsed = !group.classList.contains('collapsed');
          group.classList.toggle('collapsed', nowCollapsed);
          head.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
          var s = loadRegionCollapsed();
          if (nowCollapsed) s[stateKey] = true; else delete s[stateKey];
          saveRegionCollapsed(s);
        });
        group.appendChild(head);

        recs.filter(function (r) { return !vis(r); })
          .forEach(function (rec) { group.appendChild(buildWlRow(rec)); });
        recs.filter(function (r) { return vis(r); })
          .forEach(function (rec) { group.appendChild(buildWlRow(rec)); });
        wishlistList.appendChild(group);
      });
    } else {
      var todo = rows.filter(function (r) { return !vis(r); });
      var done = rows.filter(function (r) { return vis(r); });
      todo.forEach(addRow);
      if (done.length) {
        var h = document.createElement('div');
        h.className = 'wl-visited-head';
        h.textContent = 'Obiskano';
        wishlistList.appendChild(h);
        done.forEach(addRow);
      }
    }
  }

  // ------------------------------------------------ obrazec za dodajanje/urejanje
  function checkedTypeKeys() {
    return Array.prototype.map.call(destTypes.querySelectorAll('input:checked'), function (i) { return i.value; });
  }

  /* Zgradi vrstice s kljukicami za vse vrste + gumb "+" za novo vrsto.
     checkedKeys = ključi, ki naj bodo obkljukani (ohranimo jih ob ponovnem
     izrisu, npr. po dodajanju nove vrste). */
  function renderDestTypes(checkedKeys) {
    checkedKeys = checkedKeys || [];
    destTypes.innerHTML = '';
    allTypes(checkedKeys).forEach(function (t) {
      var label = document.createElement('label');
      label.className = 'pick-mode-row';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = t.key;
      input.checked = checkedKeys.indexOf(t.key) !== -1;
      var check = document.createElement('span');
      check.className = 'pick-mode-check';
      check.setAttribute('aria-hidden', 'true');
      var span = document.createElement('span');
      span.textContent = t.label;
      label.appendChild(input);
      label.appendChild(check);
      label.appendChild(typeIcon(t.key));   // ista ikona kot na kartici
      label.appendChild(span);
      destTypes.appendChild(label);
    });

    var actions = document.createElement('div');
    actions.className = 'wl-type-actions';

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'wl-type-add';
    add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '<span>Nova vrsta</span>';
    add.addEventListener('click', function () {
      var name = prompt('Nova vrsta destinacije:');
      if (name === null) return;
      addCustomType(name.trim());
    });
    actions.appendChild(add);

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'wl-type-remove';
    remove.title = 'Odstrani lastno vrsto';
    remove.setAttribute('aria-label', 'Odstrani lastno vrsto');
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    remove.addEventListener('click', removeCustomTypePrompt);
    actions.appendChild(remove);

    destTypes.appendChild(actions);
  }

  function addCustomType(name) {
    if (!name) return;
    var existing = allTypes();
    var dup = existing.some(function (t) {
      return t.key.toLowerCase() === name.toLowerCase() || t.label.toLowerCase() === name.toLowerCase();
    });
    var checked = checkedTypeKeys();
    if (dup) {
      // že obstaja — samo jo obkljukaj
      var match = existing.filter(function (t) {
        return t.key.toLowerCase() === name.toLowerCase() || t.label.toLowerCase() === name.toLowerCase();
      })[0];
      if (match && checked.indexOf(match.key) === -1) checked.push(match.key);
      renderDestTypes(checked);
      return;
    }
    var list = loadCustomTypes();
    list.push({ key: name, label: name });
    persistCustomTypes(list);
    checked.push(name);
    renderDestTypes(checked);
  }

  /* Odstranitev lastne vrste (vgrajene niso odstranljive). Obstoječih destinacij
     ne spremeni — vrsta se le umakne s seznama možnosti. */
  function removeCustomTypePrompt() {
    var custom = loadCustomTypes();
    if (!custom.length) { showToast('Ni lastnih vrst za odstranitev.', 2500); return; }
    var name = prompt('Katero lastno vrsto naj odstranim?\n(' +
      custom.map(function (t) { return t.label; }).join(', ') + ')');
    if (name === null) return;
    var n = name.trim().toLowerCase();
    if (!n) return;
    if (WL_TYPES.some(function (t) { return t.key.toLowerCase() === n || t.label.toLowerCase() === n; })) {
      showToast('Vgrajene vrste ni mogoče odstraniti.', 2800); return;
    }
    var idx = -1;
    custom.forEach(function (t, i) {
      if (idx === -1 && (t.key.toLowerCase() === n || t.label.toLowerCase() === n)) idx = i;
    });
    if (idx === -1) { showToast('Take lastne vrste ni.', 2500); return; }
    var removed = custom[idx].label;
    custom.splice(idx, 1);
    persistCustomTypes(custom);
    var checked = checkedTypeKeys().filter(function (k) { return normType(k) !== normType(removed); });
    renderDestTypes(checked);
    showToast('Odstranjeno: ' + removed, 2000);
  }

  renderDestTypes([]);
  /* Doda <option> v spustni seznam, če ga tam še ni (za države/regije iz
     obstoječih zapisov, ki niso na vnaprejšnjem seznamu). */
  function ensureOption(select, val) {
    if (!val) return;
    var has = Array.prototype.some.call(select.options, function (o) { return o.value === val; });
    if (!has) {
      var o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      select.appendChild(o);
    }
  }
  function fillCountryOptions() {
    destCountry.innerHTML = '';
    wlCountries(loadWishlist()).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      destCountry.appendChild(o);
    });
  }
  function fillRegionOptions(country, selected) {
    destRegion.innerHTML = '';
    var regs = COUNTRY_REGIONS[country] || [];
    regs.forEach(function (rg) {
      var o = document.createElement('option');
      o.value = rg;
      o.textContent = rg;
      destRegion.appendChild(o);
    });
    ensureOption(destRegion, selected);
    destRegion.value = selected || regs[0] || '';
  }
  destCountry.addEventListener('change', function () {
    fillRegionOptions(destCountry.value);
  });

  function openWishlistForm(rec) {
    wlEditId = rec ? rec.id : null;
    wishlistFormTitle.textContent = rec ? 'Uredi destinacijo' : 'Nova destinacija';
    destName.value = rec ? rec.name : '';
    fillCountryOptions();
    var country = rec ? (rec.country || 'Slovenija') : (wlActiveCountry || 'Slovenija');
    ensureOption(destCountry, country);
    destCountry.value = country;
    var defRegion = rec ? (rec.region || '')
      : (wlActiveRegion && wlActiveRegion !== WL_ALL ? wlActiveRegion : '');
    fillRegionOptions(country, defRegion);
    destCoords.value = (rec && isNum(rec.lat) && isNum(rec.lng)) ? (rec.lat + ', ' + rec.lng) : '';
    renderDestTypes((rec && rec.types) ? rec.types.slice() : []);
    wishlistBrowse.hidden = true;
    wishlistFormView.hidden = false;
    wishlistSection.classList.add('wl-form-open');
  }
  function closeWishlistForm() {
    wishlistFormView.hidden = true;
    wishlistBrowse.hidden = false;
    wishlistSection.classList.remove('wl-form-open');
    renderWishlist();
  }
  function saveWishlistForm() {
    var name = destName.value.trim();
    var types = Array.prototype.map.call(destTypes.querySelectorAll('input:checked'), function (i) { return i.value; });
    if (!name) { showToast('Vpiši ime destinacije.', 2500); return; }
    if (!types.length) { showToast('Izberi vsaj eno vrsto.', 2500); return; }

    var country = destCountry.value || 'Slovenija';
    var region = destRegion.value || (COUNTRY_REGIONS[country] && COUNTRY_REGIONS[country][0]) || 'Drugo';

    var lat = null, lng = null;
    var pc = parseLatLng(destCoords.value);
    if (pc) { lat = round7(pc.lat); lng = round7(pc.lng); }

    var list = loadWishlist();
    if (wlEditId !== null) {
      var it = list.find(function (x) { return x.id === wlEditId; });
      if (it) {
        // Ime ali koordinate spremenjeni -> zavrzi staro sliko, da se poišče znova.
        if (it.name !== name || it.lat !== lat || it.lng !== lng) {
          delete it.image; delete it.imgSrc; delete it.imgTs;
        }
        it.name = name; it.country = country; it.region = region;
        it.lat = lat; it.lng = lng; it.types = types;
      }
    } else {
      list.push({
        id: Date.now(), name: name, country: country, region: region,
        lat: lat, lng: lng, types: types, visited: false, created: Date.now()
      });
    }
    var ok = persistWishlist(list);
    wlActiveCountry = country;
    wlActiveRegion = region;
    wlActiveType = WL_ALL;
    saveActiveFilters();
    showToast(ok ? 'Destinacija shranjena' : 'Napaka pri shranjevanju', 2000);
    closeWishlistForm();
  }

  btnAddDest.addEventListener('click', function () { openWishlistForm(null); });
  btnDestCancel.addEventListener('click', closeWishlistForm);
  btnDestSave.addEventListener('click', saveWishlistForm);

  /* Ko uporabnik zapusti polje za koordinate: (1) jih pretvorimo v enotno obliko
     "46.3190927, 14.7246127" (npr. iz "46°16′25″N 13°48′44″E"); (2) za Slovenijo
     samodejno določimo statistično regijo iz koordinat. */
  destCoords.addEventListener('blur', function () {
    var pc = parseLatLng(destCoords.value);
    if (!pc) return;
    destCoords.value = round7(pc.lat) + ', ' + round7(pc.lng);
    if (destCountry.value !== 'Slovenija') return;
    var region = regionFromCoords(pc.lat, pc.lng);
    if (!region) return;
    ensureOption(destRegion, region);
    destRegion.value = region;
    showToast('Regija: ' + region, 1600);
  });

  // ---------------------------------------------------------- izvoz / uvoz seznama
  function exportWishlist() {
    var payload = { kind: 'kam-seznam-zelja', version: 1, items: loadWishlist() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'seznam-zelja.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  btnExportWishlist.addEventListener('click', function () {
    closeWlUserMenu();
    exportWishlist();
  });

  btnImportWishlist.addEventListener('click', function () {
    closeWlUserMenu();
    importWishlistFile.value = '';
    importWishlistFile.click();
  });
  importWishlistFile.addEventListener('change', function () {
    var file = importWishlistFile.files && importWishlistFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (e) { showToast('Datoteka ni veljaven JSON.', 3000); return; }
      var items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      var valid = items.filter(function (it) {
        return it && typeof it.name === 'string' && it.name.trim() &&
          Array.isArray(it.types) && it.types.length;
      });
      if (!valid.length) { showToast('V datoteki ni veljavnih destinacij.', 3500); return; }
      var list = loadWishlist();
      valid.forEach(function (it, k) {
        list.push({
          id: Date.now() + k,
          name: it.name.trim(),
          country: (typeof it.country === 'string' && it.country.trim()) || 'Slovenija',
          region: (typeof it.region === 'string' && it.region.trim()) || 'Drugo',
          lat: isNum(it.lat) ? it.lat : null,
          lng: isNum(it.lng) ? it.lng : null,
          types: it.types.filter(function (t) { return typeof t === 'string'; }),
          visited: !!it.visited,
          created: it.created || (Date.now() + k)
        });
      });
      var ok = persistWishlist(list);
      renderWishlist();
      showToast(ok ? ('Uvoženih destinacij: ' + valid.length) : 'Napaka pri uvozu', 2500);
    };
    reader.onerror = function () { showToast('Branje datoteke ni uspelo.', 3000); };
    reader.readAsText(file);
  });

  function renderAllSaved() {
    renderSavedGrid();
    renderSavedAreasGrid();
    renderSavedMountainsGrid();
    renderWishlist();
    renderExploreList();
  }
  /* Ponoven izris tudi po prijavi (auth.js pokliče window.refreshApp, če je
     startApp že tekel — npr. po prevzemu seje iz huba). */
  window.refreshApp = renderAllSaved;

  renderAllSaved(); // takoj iz zrcala (localStorage), da UI ni prazen

  // Po osvežitvi ostanemo v predalu "Vem kam grem", če je bil odprt (brez animacije).
  try {
    if (localStorage.getItem(WL_OPEN_KEY) === '1') {
      wishlistSection.classList.add('no-anim');
      openWishlistDrawer();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { wishlistSection.classList.remove('no-anim'); });
      });
    }
  } catch (e) {}

  if (window.KamData) {
    KamData.init().then(function () {
      renderAllSaved();       // znova, ko pridejo podatki iz oblaka
      map.invalidateSize();
    });
  }
};
