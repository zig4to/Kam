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
  // preselimo v oblak (če v oblaku še ni ničesar), nato jih pobrišemo, da na
  // deljeni napravi ne pricurljajo v oblak naslednjega uporabnika.
  var LEGACY = {
    points: "kam-saved-points",
    areas: "kam-saved-areas",
    mountains: "kam-saved-mountains",
    wishlist: "kam-wishlist"
    // 'types' (lastne vrste destinacij) je novejši od oblaka — brez legacy ključa
  };

  var KEYS = ["points", "areas", "mountains", "wishlist", "types"];
  var uid = null;
  var pushTimer = null;
  var initDone = null;
  var dirty = false;   // je v `state` sprememba, ki še ni potrjeno v oblaku?

  // --- deljenje seznama "Vem kam grem" (tabela kam_profiles, glej 002_sharing.sql)
  var shareEnabled = false;   // "prikaži točke ostalim"
  var profileName = "";       // kratko ime (Žiga T.)
  var sharedTimer = null;

  function shortName(user) {
    var md = (user && user.user_metadata) || {};
    var full = String(md.full_name || md.name || md.display_name ||
      ((md.first_name || md.given_name || "") + " " + (md.last_name || md.family_name || ""))).trim();
    if (!full && user && user.email) {
      full = user.email.split("@")[0].replace(/[._-]+/g, " ").trim();
    }
    var parts = full.split(/\s+/).filter(Boolean);
    if (!parts.length) return "Uporabnik";
    var cap = function (w) { return w.charAt(0).toUpperCase() + w.slice(1); };
    if (parts.length === 1) return cap(parts[0]);
    return cap(parts[0]) + " " + parts[1].charAt(0).toUpperCase() + ".";
  }

  function pushProfile() {
    if (!uid) return Promise.resolve(false);
    return sb.from("kam_profiles").upsert({
      user_id: uid,
      display_name: profileName,
      share_enabled: shareEnabled,
      shared_wishlist: shareEnabled && Array.isArray(state.wishlist) ? state.wishlist : [],
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" }).then(function (res) {
      return !res.error;
    }).catch(function () { return false; });
  }
  function scheduleSharedPush() {
    if (!shareEnabled) return;
    if (sharedTimer) clearTimeout(sharedTimer);
    sharedTimer = setTimeout(function () { sharedTimer = null; pushProfile(); }, 1200);
  }

  function emptyState() {
    var s = {};
    KEYS.forEach(function (k) { s[k] = []; });
    return s;
  }
  var state = emptyState();
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
      if (!LEGACY[k]) return;
      try {
        var v = JSON.parse(localStorage.getItem(LEGACY[k]));
        if (Array.isArray(v) && v.length) { s[k] = v; found = true; }
      } catch (e) {}
    });
    return found ? s : null;
  }
  function clearLegacy() {
    KEYS.forEach(function (k) {
      if (!LEGACY[k]) return;
      try { localStorage.removeItem(LEGACY[k]); } catch (e) {}
    });
  }

  // Potisne cel `state` v oblak. Vrne Promise<boolean> — true ob potrjenem
  // zapisu. Ob neuspehu ostane `dirty`, da splakne poznejši flush().
  function pushNow() {
    pushTimer = null;
    if (!uid) return Promise.resolve(false);
    return sb.from("kam_data")
      .upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" })
      .then(function (res) {
        if (res.error) {
          console.warn("Kam: shranjevanje v oblak ni uspelo.", res.error.message);
          return false;
        }
        dirty = false;
        return true;
      })
      .catch(function (err) {
        console.warn("Kam: shranjevanje v oblak ni uspelo.", err);
        return false;
      });
  }
  function schedulePush() {
    dirty = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 800);
  }
  // Ob vrnitvi povezave / aplikacije v ospredje splakni morebitno neshranjeno
  // spremembo (schedulePush teče le ob novi spremembi).
  function flush() {
    if (dirty && uid) pushNow();
  }
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) flush();
  });

  function init() {
    if (initDone) return initDone;

    var mirror = readMirror();
    if (mirror) state = mirror;

    initDone = sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      uid = session && session.user ? session.user.id : null;
      if (!uid) return; // brez prijave (auth.js sicer tega ne dovoli)

      profileName = shortName(session.user);
      // Profil (deljenje) — če tabele še ni, tiho preskočimo.
      sb.from("kam_profiles").select("share_enabled").eq("user_id", uid).maybeSingle()
        .then(function (res) {
          if (!res.error && res.data) shareEnabled = !!res.data.share_enabled;
          return pushProfile();
        }).catch(function () {});

      return sb.from("kam_data").select("data").eq("user_id", uid).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;

          if (res.data && res.data.data && !isEmptyState(normalize(res.data.data))) {
            // V oblaku že obstaja stanje — to je vir resnice. Stari lokalni
            // ključi so od zdaj zastareli.
            state = normalize(res.data.data);
            writeMirror();
            clearLegacy();
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
          return pushNow().then(function (ok) {
            // Legacy pobrišemo šele po potrjenem zapisu v oblak — sicer bi ob
            // neuspehu (brez povezave) izgubili edino kopijo.
            if (ok) clearLegacy();
          });
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
    if (key === "wishlist") scheduleSharedPush();
    return true;
  }
  function clearCache() {
    try { localStorage.removeItem(MIRROR_KEY); } catch (e) {}
    clearLegacy(); // ob odjavi: brez tega bi na deljeni napravi pricurljali
                   // v oblak naslednjega uporabnika (če je njegov prazen)
    state = emptyState();
    initDone = null;
    uid = null;
    dirty = false;
    shareEnabled = false;
    profileName = "";
    if (sharedTimer) { clearTimeout(sharedTimer); sharedTimer = null; }
  }

  // --- deljenje ---
  function isShared() { return shareEnabled; }
  function setShare(on) {
    shareEnabled = !!on;
    return pushProfile();
  }
  function listShared() {
    if (!uid) return Promise.resolve([]);
    return sb.from("kam_profiles").select("user_id, display_name")
      .eq("share_enabled", true).neq("user_id", uid)
      .then(function (res) {
        if (res.error) return [];
        return (res.data || []).map(function (p) {
          return { userId: p.user_id, name: p.display_name || "Uporabnik" };
        }).sort(function (a, b) { return a.name.localeCompare(b.name, "sl"); });
      }).catch(function () { return []; });
  }
  function getShared(userId) {
    if (!userId) return Promise.resolve([]);
    return sb.from("kam_profiles").select("shared_wishlist")
      .eq("user_id", userId).eq("share_enabled", true).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) return [];
        return Array.isArray(res.data.shared_wishlist) ? res.data.shared_wishlist : [];
      }).catch(function () { return []; });
  }

  window.KamData = {
    init: init, get: get, set: set, clearCache: clearCache,
    isShared: isShared, setShare: setShare, listShared: listShared, getShared: getShared
  };
})();
