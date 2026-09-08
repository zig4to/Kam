/* Kam — prijava prek Supabase Auth (e-pošta + geslo) + ponastavitev gesla.
   Aplikacija (window.startApp iz js/app.js) se zažene šele po uspešni prijavi.
   Če je uporabnik že prijavljen v hub TomStudios (deljena seja ali žeton
   #sb_at/#sb_rt v povezavi), se prijava zgodi samodejno in ta zaslon se
   preskoči. */
(function () {
  var sb = window.sb;

  var authScreen = document.getElementById("authScreen");
  var recoveryScreen = document.getElementById("recoveryScreen");
  var appRoot = document.getElementById("appRoot");

  var form = document.getElementById("authForm");
  var emailEl = document.getElementById("authEmail");
  var passEl = document.getElementById("authPassword");
  var submitBtn = document.getElementById("authSubmit");
  var toggleBtn = document.getElementById("authToggle");
  var forgotBtn = document.getElementById("authForgot");
  var titleEl = document.getElementById("authTitle");
  var errEl = document.getElementById("authError");
  var noteEl = document.getElementById("authNote");

  var recForm = document.getElementById("recoveryForm");
  var recPass1 = document.getElementById("recoveryPassword");
  var recPass2 = document.getElementById("recoveryPassword2");
  var recSubmit = document.getElementById("recoverySubmit");
  var recErr = document.getElementById("recoveryError");
  var recNote = document.getElementById("recoveryNote");

  var userNameEl = document.getElementById("menuUserName");
  var userEmailEl = document.getElementById("menuUserEmail");
  var signoutBtn = document.getElementById("signoutBtn");

  function displayName(user) {
    var md = (user && user.user_metadata) || {};
    var full = String(md.full_name || md.name || md.display_name || "").trim();
    if (!full) {
      var fn = String(md.first_name || md.given_name || "").trim();
      var ln = String(md.last_name || md.family_name || "").trim();
      full = (fn + " " + ln).trim();
    }
    if (!full && user && user.email) {
      full = user.email.split("@")[0].split(/[._-]+/).filter(Boolean)
        .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
        .join(" ");
    }
    return full || "Uporabnik";
  }

  var mode = "signin"; // "signin" | "signup"
  var appStarted = false;
  var pendingAuthError = null;
  var ssoAdopting = false;
  // Prava prijava (obrazec / SSO / po ponastavitvi gesla) — takrat aplikacijo
  // vedno odpremo na naslovni strani, ne na zadnjem pogledu. Osvežitev strani
  // z obstoječo sejo tega ne sproži (pogled se obnovi kot doslej).
  var freshLogin = false;
  function clearViewRestore() {
    try {
      localStorage.removeItem("kam:landingHidden");
      localStorage.removeItem("kam:wlOpen");
    } catch (e) {}
    // razred iz vgrajene skripte v <head> (prepreči utripanje) — sicer bi
    // "html.landing-restored .landing-overlay { display: none }" skril naslovnico
    document.documentElement.classList.remove("landing-restored");
  }

  var recovering = location.hash.indexOf("type=recovery") !== -1;
  handleHashError();

  function stopSsoLoader() {
    document.documentElement.classList.remove("sso-pending");
  }

  function consumeSsoHash() {
    var h = location.hash || "";
    if (h.indexOf("sb_at=") === -1 || h.indexOf("sb_rt=") === -1) {
      return Promise.resolve();
    }
    var params = new URLSearchParams(h.replace(/^#/, ""));
    var at = params.get("sb_at");
    var rt = params.get("sb_rt");
    params.delete("sb_at");
    params.delete("sb_rt");
    var rest = params.toString();
    history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
    if (!at || !rt) { stopSsoLoader(); return Promise.resolve(); }
    ssoAdopting = true;
    // Nalagalnik je že viden (pre-paint skript v <head>). Varovalo, če se
    // izmenjava nikoli ne zaključi (Supabase nedosegljiv).
    document.documentElement.classList.add("sso-pending");
    var safety = setTimeout(stopSsoLoader, 10000);
    return sb.auth.setSession({ access_token: at, refresh_token: rt })
      .then(function () { freshLogin = true; })
      .catch(function () {})
      .then(function () { clearTimeout(safety); stopSsoLoader(); });
  }

  function handleHashError() {
    var h = location.hash || "";
    if (h.indexOf("error") === -1) return;
    var p = new URLSearchParams(h.replace(/^#/, ""));
    var code = (p.get("error_code") || p.get("error") || "");
    var desc = (p.get("error_description") || "");
    if (!code && !desc) return;
    history.replaceState(null, "", location.pathname + location.search);
    pendingAuthError = /expired|invalid/i.test(code + " " + desc)
      ? "Povezava za ponastavitev je potekla ali je bila že uporabljena. Vpiši e-pošto in zahtevaj novo."
      : (desc || "Povezava ni veljavna.");
  }

  function prevediNapako(msg) {
    msg = msg || "Nekaj je šlo narobe.";
    if (/Invalid login credentials/i.test(msg)) return "Napačna e-pošta ali geslo.";
    if (/already registered|already been registered/i.test(msg)) return "Ta e-pošta je že registrirana.";
    if (/Password should be at least|at least 6/i.test(msg)) return "Geslo mora imeti vsaj 6 znakov.";
    if (/New password should be different/i.test(msg)) return "Novo geslo mora biti drugačno od starega.";
    if (/Auth session missing|session_not_found|JWT expired/i.test(msg)) return "Seja je potekla. Zahtevaj novo povezavo za ponastavitev.";
    if (/Unable to validate email address|invalid format/i.test(msg)) return "Neveljaven e-poštni naslov.";
    if (/Email not confirmed/i.test(msg)) return "E-pošta še ni potrjena. Preveri predal.";
    if (/rate limit|too many|after \d+ seconds/i.test(msg)) return "Preveč poskusov. Počakaj malo in poskusi znova.";
    return msg;
  }

  function setMode(m) {
    mode = m;
    errEl.textContent = "";
    noteEl.textContent = "";
    if (m === "signup") {
      titleEl.textContent = "Registracija";
      submitBtn.textContent = "Ustvari račun";
      toggleBtn.textContent = "Že imaš račun? Prijava";
      forgotBtn.hidden = true;
    } else {
      titleEl.textContent = "Prijava";
      submitBtn.textContent = "Prijava";
      toggleBtn.textContent = "Nimaš računa? Registracija";
      forgotBtn.hidden = false;
    }
  }

  toggleBtn.addEventListener("click", function () {
    setMode(mode === "signin" ? "signup" : "signin");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = emailEl.value.trim();
    var pass = passEl.value;
    errEl.textContent = "";
    noteEl.textContent = "";
    pendingAuthError = null;
    if (!email || !pass) { errEl.textContent = "Vpiši e-pošto in geslo."; return; }
    submitBtn.disabled = true;
    if (mode === "signin") freshLogin = true;

    var op = mode === "signup"
      ? sb.auth.signUp({
          email: email,
          password: pass,
          options: { emailRedirectTo: location.origin + location.pathname }
        })
      : sb.auth.signInWithPassword({ email: email, password: pass });

    op.then(function (res) {
      submitBtn.disabled = false;
      if (res.error) { freshLogin = false; errEl.textContent = prevediNapako(res.error.message); return; }
      if (mode === "signup" && res.data && res.data.user && !res.data.session) {
        noteEl.textContent = "Račun ustvarjen. Potrdi e-pošto, nato se prijavi.";
        setMode("signin");
      }
    }).catch(function (err) {
      submitBtn.disabled = false;
      freshLogin = false;
      errEl.textContent = prevediNapako(String((err && err.message) || err));
    });
  });

  forgotBtn.addEventListener("click", function () {
    var email = emailEl.value.trim();
    errEl.textContent = "";
    noteEl.textContent = "";
    pendingAuthError = null;
    if (!email) { errEl.textContent = "Vpiši e-pošto, nato klikni Pozabljeno geslo."; emailEl.focus(); return; }
    forgotBtn.disabled = true;
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
      .then(function (res) {
        forgotBtn.disabled = false;
        if (res.error) { errEl.textContent = prevediNapako(res.error.message); return; }
        noteEl.textContent = "Če račun obstaja, smo poslali povezavo za ponastavitev gesla. Preveri e-pošto (klikni najnovejšo povezavo čim prej).";
      })
      .catch(function (err) {
        forgotBtn.disabled = false;
        errEl.textContent = prevediNapako(String((err && err.message) || err));
      });
  });

  recForm.addEventListener("submit", function (e) {
    e.preventDefault();
    recErr.textContent = "";
    recNote.textContent = "";
    var p1 = recPass1.value;
    var p2 = recPass2.value;
    if (p1.length < 6) { recErr.textContent = "Geslo mora imeti vsaj 6 znakov."; return; }
    if (p1 !== p2) { recErr.textContent = "Gesli se ne ujemata."; return; }
    recSubmit.disabled = true;
    sb.auth.updateUser({ password: p1 }).then(function (res) {
      recSubmit.disabled = false;
      if (res.error) { recErr.textContent = prevediNapako(res.error.message); return; }
      recovering = false;
      recNote.textContent = "Geslo je spremenjeno.";
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { freshLogin = true; showApp(r.data.session); }
        else { setMode("signin"); showAuth(); }
      });
    }).catch(function (err) {
      recSubmit.disabled = false;
      recErr.textContent = prevediNapako(String((err && err.message) || err));
    });
  });

  signoutBtn.addEventListener("click", function () {
    signoutBtn.disabled = true;
    Promise.resolve(window.KamData && window.KamData.clearCache ? window.KamData.clearCache() : null)
      .catch(function () {})
      .then(function () { return sb.auth.signOut(); })
      .catch(function () {})
      .then(function () { location.reload(); });
  });

  function showApp(session) {
    if (recovering) return;
    authScreen.hidden = true;
    recoveryScreen.hidden = true;
    appRoot.hidden = false;
    var user = session && session.user;
    if (userEmailEl) userEmailEl.textContent = (user && user.email) || "";
    if (userNameEl) userNameEl.textContent = displayName(user);
    if (!appStarted && typeof window.startApp === "function") {
      if (freshLogin) clearViewRestore();   // prijava -> vedno naslovna stran
      appStarted = true;
      window.startApp();
    } else if (appStarted && typeof window.refreshApp === "function") {
      window.refreshApp();
    }
    freshLogin = false;
    if (window.InstallPromo) window.InstallPromo.afterLogin();
  }

  function showAuth() {
    recoveryScreen.hidden = true;
    appRoot.hidden = true;
    authScreen.hidden = false;
    if (pendingAuthError) { errEl.textContent = pendingAuthError; pendingAuthError = null; }
  }

  function showRecovery() {
    recovering = true;
    authScreen.hidden = true;
    appRoot.hidden = true;
    recoveryScreen.hidden = false;
    recPass1.value = "";
    recPass2.value = "";
    recErr.textContent = "";
    recNote.textContent = "";
    recPass1.focus();
  }

  setMode("signin");

  consumeSsoHash().then(function () {
    ssoAdopting = false;
    if (recovering) { showRecovery(); return; }
    sb.auth.getSession().then(function (res) {
      if (recovering) return;
      if (res.data && res.data.session) showApp(res.data.session);
      else showAuth();
    });
  });

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === "PASSWORD_RECOVERY") { showRecovery(); return; }
    if (event === "INITIAL_SESSION") return;
    if (ssoAdopting) return;
    if (recovering) return;
    if (session) showApp(session);
    else showAuth();
  });
})();
