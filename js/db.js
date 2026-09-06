/* Kam — podatkovni sloj.

   Vir resnice: Supabase, tabela `kam_data` — ena vrstica na uporabnika, cela
   vsebina (shranjene točke, območja, gorovja, seznam "Vem kam grem") je en
   jsonb blob v stolpcu `data`. Med napravami se sinhronizira samodejno.

   localStorage (`kam-data-cache`) je SAMO zrcalni predpomnilnik zadnjega
   znanega stanja, da aplikacija deluje tudi brez povezave; ob spremembi jo
   takoj zapišemo lokalno in z zamikom potisnemo v oblak.

   Izpostavi window.sb (Supabase klient) in window.KamData (get/set/init). */
(function () {
  var CFG = window.SUPABASE_CONFIG || {};
  var sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "kam-auth" }
  });
  window.sb = sb;

  var MIRROR_KEY = "kam-data-cache";
  // Stari ključi iz časa pred oblakom — ob prvi prijavi na napravi jih enkratno
  // preselimo v oblak (če v oblaku še ni ničesar).
  var LEGACY = {
    points: "kam-saved-points",
    areas: "kam-saved-areas",
    mountains: "kam-saved-mountains",
    wishlist: "kam-wishlist"
  };

  var KEYS = ["points", "areas", "mountains", "wishlist"];
  var state = { points: [], areas: [], mountains: [], wishlist: [] };
  var uid = null;
  var pushTimer = null;
  var initDone = null;

  function emptyState() {
    return { points: [], areas: [], mountains: [], wishlist: [] };
  }
  function normalize(raw) {
    var out = emptyState();
    if (raw && typeof raw === "object") {
      KEYS.forEach(function (k) {
        if (Array.isArray(raw[k])) out[k] = raw[k];
      });
    }
    return out;
  }
  function isEmptyState(s) {
    return KEYS.every(function (k) { return !s[k] || s[k].length === 0; });
  }

  function readMirror() {
    try {
      var v = JSON.parse(localStorage.getItem(MIRROR_KEY));
      if (v) return normalize(v);
    } catch (e) {}
    return null;
  }
  function writeMirror() {
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function readLegacy() {
    var s = emptyState();
    var found = false;
    KEYS.forEach(function (k) {
      try {
        var v = JSON.parse(localStorage.getItem(LEGACY[k]));
        if (Array.isArray(v) && v.length) { s[k] = v; found = true; }
      } catch (e) {}
    });
    return found ? s : null;
  }

  function pushNow() {
    pushTimer = null;
    if (!uid) return Promise.resolve();
    return sb.from("kam_data")
      .upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" })
      .then(function (res) {
        if (res.error) console.warn("Kam: shranjevanje v oblak ni uspelo.", res.error.message);
      })
      .catch(function (err) {
        console.warn("Kam: shranjevanje v oblak ni uspelo.", err);
      });
  }
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }

  function init() {
    if (initDone) return initDone;

    var mirror = readMirror();
    if (mirror) state = mirror;

    initDone = sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      uid = session && session.user ? session.user.id : null;
      if (!uid) return; // brez prijave (auth.js sicer tega ne dovoli)

      return sb.from("kam_data").select("data").eq("user_id", uid).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;

          if (res.data && res.data.data && !isEmptyState(normalize(res.data.data))) {
            // V oblaku že obstaja stanje — to je vir resnice.
            state = normalize(res.data.data);
            writeMirror();
            return;
          }

          // V oblaku še ni ničesar: preseli morebitne stare lokalne podatke.
          var legacy = readLegacy();
          if (legacy && !isEmptyState(legacy)) {
            state = legacy;
          } else if (mirror && !isEmptyState(mirror)) {
            state = mirror;
          } else {
            state = emptyState();
          }
          writeMirror();
          return pushNow();
        })
        .catch(function (err) {
          // Brez povezave / napaka: delamo naprej iz zrcala, potiskanje pozneje.
          console.warn("Kam: branje iz oblaka ni uspelo, uporabljam lokalno kopijo.", err);
        });
    });

    return initDone;
  }

  function get(key) {
    var v = state[key];
    return Array.isArray(v) ? v.slice() : [];
  }
  function set(key, list) {
    state[key] = Array.isArray(list) ? list : [];
    writeMirror();
    schedulePush();
    return true;
  }
  function clearCache() {
    try { localStorage.removeItem(MIRROR_KEY); } catch (e) {}
    state = emptyState();
    initDone = null;
    uid = null;
  }

  window.KamData = { init: init, get: get, set: set, clearCache: clearCache };
})();
