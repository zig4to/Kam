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

  var startMarker = null;
  var previewCircle = null;
  var resultMarker = null;
  var pendingStart = null;
  var toastTimer = null;

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
    radiusPanel.hidden = false;
    map.flyTo(latlng, Math.max(map.getZoom(), 11));
    map.once('moveend', function () { map.fitBounds(previewCircle.getBounds(), { padding: [40, 40] }); });
  }

  radiusSlider.addEventListener('input', function () {
    var radius = parseInt(radiusSlider.value, 10);
    radiusValue.textContent = formatRadius(radius);
    if (previewCircle) previewCircle.setRadius(radius);
  });

  function endRadiusStep() {
    radiusPanel.hidden = true;
    if (previewCircle) { map.removeLayer(previewCircle); previewCircle = null; }
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    pendingStart = null;
  }

  btnRadiusCancel.addEventListener('click', endRadiusStep);

  btnRadiusConfirm.addEventListener('click', function () {
    if (!pendingStart) return;
    var radius = parseInt(radiusSlider.value, 10);
    var point = randomPointInCircle(pendingStart[0], pendingStart[1], radius);
    endRadiusStep();

    if (resultMarker) map.removeLayer(resultMarker);
    resultMarker = L.marker(point, { icon: resultIcon }).addTo(map);
    map.flyTo(point, 14);
  });
})();
