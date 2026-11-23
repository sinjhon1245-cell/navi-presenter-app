// 수업 내비 · window.claude 자리를 Firebase(Firestore + 구글 로그인)로 채워요 (1단계-1, docs/STAGE1-1-REALTIME.md)
// - Firebase 설정(window.NAVI_FIREBASE, navi-config.js)이 없으면 아무것도 하지 않아요.
// - 로그인하지 않았으면 window.claude를 넣지 않아요. 그러면 앱은 0.7과 똑같이 이 기기 안에서만 동작해요.
// - 로그인했으면 claude.use("db")가 teachers/{교사 id}/ 아래 문서를 줘요. 계정에 두는 것은 scope의 두 가지뿐이고,
//   수업 기록 · 최근 수업 · 0.7 수업 복구는 1단계-2 전까지 이 브라우저에 그대로 있어요.
// - 쓰기는 앱이 상태를 바꿀 때(장면 이동, 신호등, 자료 띄우기…)만 일어나요. 시계 표시처럼 매초 쓰는 일은 없어요.
(function () {
  "use strict";
  const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
  const HINT = "navi-signed-in";
  // PIN으로 연결한 휴대폰(구글 로그인 없음): 교사 PC가 허용한 교사 · 수업 · 이 휴대폰 id
  const DEVICE = "navi-device", ENDED = "navi-device-ended";
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // 로그인 유지(2026-11-11, docs/AUTH-POLICY.md): 로그인 화면의 ‘이 브라우저에서 로그인 유지’(기본 켜짐)
  // - 켜면 Firebase의 브라우저 저장소(IndexedDB)에 둬서, 브라우저를 닫았다 열어도 로그인돼 있어요
  // - 끄면 이 탭에서만(Firebase 탭 저장소): 새로고침은 그대로, 탭 · 창을 닫으면 로그인 전이에요
  // 고른 것은 이 브라우저에 KEEP(1 · 0)으로 남겨 두고, 페이지를 열 때 그 저장소에서만 로그인을 찾아요. 시간이 지났다고 로그아웃시키지 않아요
  // PIN으로 연결한 휴대폰(익명)은 그 휴대폰의 브라우저 저장소에 둬요(개인 기기, 예전과 같아요)
  const KEEP = "navi-keep-login";
  let keepNow = (() => { try { return localStorage.getItem(KEEP) !== "0"; } catch (e) { return true; } })();
  const store = () => { try { return keepNow ? localStorage : sessionStorage; } catch (e) { return null; } };
  const both = (f) => { [() => localStorage, () => sessionStorage].forEach((g) => { try { f(g()); } catch (e) {} }); };
  let cfg = window.NAVI_FIREBASE || null;
  // 내 컴퓨터에서 주소 뒤에 ?emu를 붙여 열면 Firebase 에뮬레이터(가짜 프로젝트 demo-navi)에 붙어요(npm run emu)
  if (isLocalHost && /[?&]emu\b/.test(location.search)) {
    cfg = { app: { apiKey: "demo-key", authDomain: "demo-navi.firebaseapp.com", projectId: "demo-navi", appId: "demo-navi" }, emulator: { auth: "http://127.0.0.1:9099", firestore: "127.0.0.1:8080" }, pin: true };
  }
  if (!cfg || !cfg.app || !cfg.app.projectId) return;
  // 에뮬레이터 설정은 내 컴퓨터 주소에서만 써요
  if (cfg.emulator && !isLocalHost) return;

  // 난수는 브라우저의 암호학적 난수(crypto.getRandomValues)로만 만들어요(Math.random 아님)
  const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join(""); };
  // 교사 해시: SHA-256(교사 id). PIN 자리에는 교사 id 대신 이것만 두고(보안 규칙이 같은 계산으로 맞춰 봐요),
  // QR에는 앞 8자리를 교사 표시로 담아요. 휴대폰은 PIN 자리를 맡은 교사가 QR의 교사와 같을 때만 요청해요
  const sha256hex = async (s) => {
    if (!(window.crypto && crypto.subtle)) return "";
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
  };
  // ‘로그인함’ 표시와 PIN 휴대폰 표시는 로그인과 같은 곳(store)에만 둬요. 다른 곳에 남은 것은 쓸 때 지워요
  const hint = {
    get: () => { try { return store().getItem(HINT) || ""; } catch (e) { return ""; } },
    set: (v) => { both((s) => s.removeItem(HINT)); if (v) { try { store().setItem(HINT, v); } catch (e) {} } }
  };
  const device = {
    get: () => { try { const d = JSON.parse(store().getItem(DEVICE) || "null"); return d && d.teacher && d.uid ? d : null; } catch (e) { return null; } },
    set: (v) => { both((s) => s.removeItem(DEVICE)); if (v) { try { store().setItem(DEVICE, JSON.stringify(v)); } catch (e) {} } }
  };
  // 이번 로그인을 어디에 둘지 정해요(로그인 직전에). 이 브라우저의 다음 페이지도 같은 곳에서 찾아요
  const chooseKeep = async (fb, on) => {
    keepNow = !!on;
    try { localStorage.setItem(KEEP, on ? "1" : "0"); } catch (e) {}
    await fb.U.setPersistence(fb.auth, on ? fb.U.indexedDBLocalPersistence : fb.U.browserSessionPersistence);
  };
  // 교사 PC가 연결을 끝냈거나 시간이 지나 다시 연 화면에 한 번 보여 줄 말
  let endedMsg = "";
  try { endedMsg = sessionStorage.getItem(ENDED) || ""; sessionStorage.removeItem(ENDED); } catch (e) {}

  let loading = null, driveTok = null;
  function boot() {
    if (!loading) {
      loading = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]).then(([A, U, F]) => {
        const app = A.initializeApp(cfg.app);
        // 로그인 유지를 골랐으면 브라우저 저장소에서, 아니면 이 탭의 저장소에서만 로그인을 찾아요(위 KEEP 참고)
        const auth = U.initializeAuth(app, {
          persistence: keepNow ? [U.indexedDBLocalPersistence, U.browserLocalPersistence] : [U.browserSessionPersistence],
          popupRedirectResolver: U.browserPopupRedirectResolver
        });
        // Firestore는 웹소켓이 아니라 HTTPS(WebChannel) 연결을 써요. 중간 장치가 스트리밍을 막으면 긴 폴링으로 스스로 바꿔요.
        const fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
        if (cfg.emulator) {
          U.connectAuthEmulator(auth, cfg.emulator.auth, { disableWarnings: true });
          const hp = cfg.emulator.firestore.split(":");
          F.connectFirestoreEmulator(fs, hp[0], Number(hp[1]));
        }
        return { U, F, auth, fs };
      });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  // ---------- 로그인: 화면은 naviAuth만 봐요 ----------
  const watchers = new Set();
  const st = { busy: false, error: endedMsg, email: "", uid: "", name: "", pinStage: "", pinWait: "", pinExp: 0, pinBusy: false, pinError: "", pinWhy: "" };
  const emit = () => watchers.forEach((f) => { try { f(); } catch (e) {} });
  const ERR = {
    "auth/popup-blocked": "로그인 창이 막혔어요. 주소창 오른쪽에서 이 사이트의 팝업을 허용하고 다시 눌러 주세요.",
    "auth/unauthorized-domain": "이 주소는 아직 로그인할 수 있게 등록되지 않았어요. Firebase 콘솔의 승인된 도메인에 더해야 해요.",
    "auth/network-request-failed": "인터넷 연결을 확인하고 다시 눌러 주세요.",
    "auth/operation-not-allowed": "구글 로그인이 아직 켜져 있지 않아요. Firebase 콘솔에서 켜야 해요."
  };
  function signedIn(user) {
    hint.set(user.uid); device.set(null);
    location.reload();
  }
  // ---------- PIN 4자리로 연결: 휴대폰 쪽 (docs/UX-1-1.md 9) ----------
  // 교사 PC가 ‘휴대폰 연결’을 열면 그 PIN 자리(pins/{PIN})를 3분 동안 맡아요. 휴대폰은 거기에 요청 하나를 남기고,
  // 교사 PC가 ‘허용’을 눌러야만 이어져요. PIN만 맞혀서는 수업을 읽을 수 없어요.
  // 단계(pinStage): "" 입력 · busy 보내는 중 · wait 허용 기다림 · ok 연결됨 · no 거절됨 · late 시간 지남이나 연결 닫힘(pinWhy)
  // 기다리는 요청(받은 수 - 거절한 수)은 3개까지, 한 번 열 때 받는 요청은 20개까지(보안 규칙과 같아요)
  const PIN_ASKS = 3, PIN_MAX = 20;
  const pinFull = (d) => d.asks - (d.no || 0) >= PIN_ASKS || d.asks >= PIN_MAX;
  const PIN_MSG = {
    bad: "PIN 4자리를 넣어 주세요.",
    none: "이 PIN으로 열린 연결이 없어요. PC의 ‘휴대폰 연결’ 창이 열려 있는지, 번호가 맞는지 확인해 주세요.",
    full: "이 PIN에 요청이 너무 많아요. PC에서 ‘다시 열기’를 누른 뒤 다시 요청해 주세요.",
    qr: "이 QR은 지금 열린 연결과 맞지 않아요. PC 화면의 QR을 다시 찍거나 PIN을 직접 넣어 주세요.",
    off: "이 주소에서는 PIN 연결이 아직 켜져 있지 않아요. 구글 계정으로 연결해 주세요.",
    net: "인터넷 연결을 확인하고 다시 눌러 주세요."
  };
  // 기기 종류만 짧게(교사 PC가 ‘iPhone · 연결 요청’처럼 알아보게). 이름 · 번호 같은 정보는 보내지 않아요
  const kindOf = () => { const u = navigator.userAgent || ""; return /iPad/.test(u) ? "iPad" : /iPhone/.test(u) ? "iPhone" : /Android/.test(u) ? (/Mobile/.test(u) ? "Android 휴대폰" : "Android 태블릿") : /Mobile/.test(u) ? "휴대폰" : "컴퓨터"; };
  let pinOff = [], pinCur = null;
  const pinStop = () => { pinOff.forEach((f) => { try { f(); } catch (e) {} }); pinOff = []; };
  const pinSet = (stage, msg, why) => { st.pinStage = stage; st.pinBusy = stage === "busy"; st.pinError = msg || ""; st.pinWhy = why || ""; emit(); };
  window.naviAuth = {
    get busy() { return st.busy; },
    get error() { return st.error; },
    get email() { return st.email; },
    // 로그인한 구글 계정의 id(이 기기의 기록을 계정별로 나눌 때) · 구글 계정 이름(처음 로그인할 때 표시 이름의 기본값)
    get uid() { return st.uid; },
    get name() { return st.name; },
    // 이 브라우저에서 로그인 유지(로그인 화면의 체크 상자 기본값은 늘 켜짐, 이 값은 지금 로그인이 어디에 있는지)
    get keep() { return keepNow; },
    signedIn: !!hint.get(),
    emulator: !!cfg.emulator,
    // PIN으로 연결(구글 로그인 없이): 이 배포에서 켰을 때만(익명 로그인 + 보안 규칙의 ‘허용된 기기’, docs/UX-1-1.md 9)
    pinEnabled: !!cfg.pin,
    // PPTX를 Google로 바꾸기(docs/PPTX-GOOGLE.md): 이 배포에서 켰을 때만(navi-config.js의 주소별 drive). 에뮬레이터 시험은 늘 켜요(가짜 Google)
    driveEnabled: !!(cfg.drive || cfg.emulator),
    get device() { return !!device.get(); },
    get pinStage() { return st.pinStage; },
    get pinBusy() { return st.pinBusy; },
    get pinWait() { return st.pinWait; },
    get pinExp() { return st.pinExp; },
    get pinError() { return st.pinError; },
    // 시간 지남의 까닭: time 3분이 지남 · shut PC가 연결 창을 닫음(다른 휴대폰을 허용했거나 창을 닫았어요)
    get pinWhy() { return st.pinWhy; },
    // 휴대폰: 교사 PC에 보이는 PIN 4자리로 연결을 요청해요. tag: QR로 열었으면 그 QR을 만든 교사의 표시(다른 교사의 같은 PIN에 보내지 않게)
    async pinJoin(pin, tag) {
      if (!cfg.pin || st.pinBusy) return;
      pin = String(pin || "").replace(/\D/g, "");
      if (!/^\d{4}$/.test(pin)) { pinSet("", PIN_MSG.bad); return; }
      pinStop(); pinCur = null; st.pinWait = pin; st.error = ""; pinSet("busy");
      try {
        const fb = await boot(), F = fb.F;
        // PIN 휴대폰은 개인 기기라 이 휴대폰의 브라우저 저장소에 둬요(다음에 열어도 이번 수업에 이어져요)
        if (!keepNow) await chooseKeep(fb, true);
        const u = fb.auth.currentUser && fb.auth.currentUser.isAnonymous ? fb.auth.currentUser : (await fb.U.signInAnonymously(fb.auth)).user;
        const pref = F.doc(fb.fs, "pins/" + pin), aref = F.doc(fb.fs, "pins/" + pin + "/asks/" + u.uid);
        // 거절된 익명 계정은 이 PIN에 다시 요청하지 못해서(규칙), 거절되면 로그아웃해 다음 요청을 새 계정으로 해요
        const fresh = () => { fb.U.signOut(fb.auth).catch(() => {}); };
        const ps = await F.getDoc(pref), p = ps.exists() ? ps.data() : null;
        if (!p) { pinSet("", PIN_MSG.none); return; }
        if (tag && String(p.owner || "").slice(0, 8) !== tag) { pinSet("", PIN_MSG.qr); return; }
        if (!p.open || p.exp <= Date.now()) { pinSet("late", "", p.open ? "time" : "shut"); return; }
        const as = await F.getDoc(aref), a = as.exists() ? as.data() : null;
        let decided = false;
        const joined = (d) => {
          if (decided) return;
          decided = true; pinStop(); pinCur = null;
          device.set({ teacher: d.teacher, sid: d.sid || "", uid: u.uid }); hint.set(u.uid);
          pinSet("ok");
          setTimeout(() => location.reload(), 700);
        };
        const end = (stage, why) => { if (decided) return; decided = true; pinStop(); pinCur = null; if (stage === "no") fresh(); pinSet(stage, "", why); };
        if (a && a.lease === p.lease) {
          // 이 자리에 이미 보낸 요청: 답이 났으면 그대로, 취소했으면 다시 살려요(요청 수는 늘지 않아요)
          if (a.ok && a.teacher) { joined(a); return; }
          if (a.no) { fresh(); pinSet("no"); return; }
          if (a.gone) await F.updateDoc(aref, { gone: false, at: Date.now() });
        } else {
          if (pinFull(p)) { pinSet("", PIN_MSG.full); return; }
          // 요청 하나와 그 자리의 요청 수 올리기를 함께 보내요(규칙이 자리마다 3개까지만 받아요)
          const b = F.writeBatch(fb.fs);
          b.set(aref, { lease: p.lease, at: Date.now(), kind: kindOf() });
          b.update(pref, { asks: F.increment(1) });
          await b.commit();
        }
        pinCur = { F, aref };
        st.pinExp = p.exp; pinSet("wait");
        // 자리가 닫히거나 시간이 지나면: 그 사이 허용됐는지 서버에 한 번 묻고, 아니면 ‘시간 지남’
        const check = async (why) => {
          if (decided) return;
          try { const s = await F.getDoc(aref), d = s.exists() ? s.data() : null; if (d && d.ok && d.teacher) { joined(d); return; } if (d && d.no) { end("no"); return; } } catch (e) {}
          end("late", why || "time");
        };
        pinOff.push(F.onSnapshot(aref, (s) => {
          const d = s.exists() ? s.data() : null;
          if (!d || d.lease !== p.lease) return;
          if (d.ok && d.teacher) joined(d); else if (d.no) end("no");
        }, () => {}));
        pinOff.push(F.onSnapshot(pref, (s) => {
          const d = s.exists() ? s.data() : null;
          if (!d || d.lease !== p.lease || !d.open || d.exp <= Date.now()) check(d && d.lease === p.lease && !d.open ? "shut" : "time");
        }, () => {}));
        const t = setTimeout(check, Math.max(0, p.exp - Date.now()) + 1000);
        pinOff.push(() => clearTimeout(t));
      } catch (e) {
        const c = e && e.code;
        // 규칙이 거절: 그 사이 자리가 닫혔거나 · 시간이 지났거나 · 요청이 가득 찼어요. 어느 쪽인지 한 번 보고 말해요
        if (c === "permission-denied") {
          try {
            const fb = await boot(), s = await fb.F.getDoc(fb.F.doc(fb.fs, "pins/" + pin)), d = s.exists() ? s.data() : null;
            if (d && d.open && d.exp > Date.now() && pinFull(d)) { pinSet("", PIN_MSG.full); return; }
            if (d) { pinSet("late", "", d.open ? "time" : "shut"); return; }
          } catch (x) {}
        }
        pinSet("", c === "auth/operation-not-allowed" || c === "auth/admin-restricted-operation" ? PIN_MSG.off
          : c === "auth/network-request-failed" || c === "unavailable" ? PIN_MSG.net
          : PIN_MSG.none);
      }
    },
    // 취소: 교사 PC의 요청 목록에서도 빠져요(다시 요청하면 같은 자리에서 다시 살아나요)
    pinCancel() {
      const cur = pinCur;
      pinStop(); pinCur = null;
      if (cur && st.pinStage === "wait") cur.F.updateDoc(cur.aref, { gone: true, at: Date.now() }).catch(() => {});
      pinSet("");
    },
    // 거절 · 시간 지남 화면에서 입력 화면으로
    pinReset() { pinStop(); pinCur = null; pinSet(""); },
    onChange: (f) => { watchers.add(f); },
    // o.keep: 로그인 화면의 ‘이 브라우저에서 로그인 유지’(기본 켜짐). false면 이 탭에서만
    async signIn(o) {
      if (st.busy) return;
      st.busy = true; st.error = ""; emit();
      try {
        const fb = await boot();
        await chooseKeep(fb, !(o && o.keep === false));
        const p = new fb.U.GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });
        // 요즘 브라우저는 다른 사이트 저장소를 막아서 ‘다시 돌아오기’ 방식이 깨질 수 있어요. 그래서 팝업으로 해요.
        const r = await fb.U.signInWithPopup(fb.auth, p);
        signedIn(r.user);
      } catch (e) {
        st.busy = false;
        const code = e && e.code;
        st.error = code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? "" : ERR[code] || "로그인하지 못했어요. 다시 눌러 주세요.";
        emit();
      }
    },
    // Google Drive(PPTX를 원래 모양으로, docs/PPTX-GOOGLE.md): 교사가 화면의 안내를 보고 누른 단추에서만 불러요.
    // 이 앱이 만든 파일만 보는 권한(drive.file) 하나를, 지금 로그인한 그 구글 계정으로만 받아요(다른 계정을 고르면 Firebase가 거절).
    // 받은 열쇠(1시간)는 이 창의 메모리에만 두고 어디에도 저장하지 않아요. 에뮬레이터 시험은 창 없이 가짜 열쇠(요청은 시험이 가로채요)
    // 한 번 허용하면 그 탭에서 한 시간 동안(sessionStorage, 탭을 닫으면 사라져요) 다시 묻지 않아요. silent: 창을 열지 않고 있는 열쇠만
    async driveToken(o) {
      if (cfg.emulator) { if (o && o.silent && !driveTok) { const e = new Error("tap"); e.code = "drive/need-tap"; throw e; } driveTok = { t: "test-drive-token", exp: Date.now() + 3600000 }; return driveTok.t; }
      const fb = await boot(), u = fb.auth.currentUser;
      if (!driveTok) { try { const k = JSON.parse(sessionStorage.getItem("navi-gtok") || "null"); if (k && k.uid === (u && u.uid)) driveTok = k; } catch (e) {} }
      if (!(o && o.fresh) && driveTok && driveTok.exp > Date.now() + 60000) return driveTok.t;
      if (o && o.silent) { const e = new Error("tap"); e.code = "drive/need-tap"; throw e; }
      if (!u || u.isAnonymous) { const e = new Error("no google user"); e.code = "drive/no-user"; throw e; }
      const p = new fb.U.GoogleAuthProvider();
      p.addScope("https://www.googleapis.com/auth/drive.file");
      p.setCustomParameters({ login_hint: u.email || "" });
      const r = await fb.U.reauthenticateWithPopup(u, p), c = fb.U.GoogleAuthProvider.credentialFromResult(r);
      if (!c || !c.accessToken) { const e = new Error("no token"); e.code = "drive/no-token"; throw e; }
      driveTok = { t: c.accessToken, exp: Date.now() + 55 * 60000, uid: u.uid };
      try { sessionStorage.setItem("navi-gtok", JSON.stringify(driveTok)); } catch (e) {}
      return driveTok.t;
    },
    driveReady() {
      if (cfg.emulator) return !!driveTok;
      if (!driveTok) { try { driveTok = JSON.parse(sessionStorage.getItem("navi-gtok") || "null"); } catch (e) {} }
      return !!(driveTok && driveTok.exp > Date.now() + 60000);
    },
    dropDriveToken() { driveTok = null; try { sessionStorage.removeItem("navi-gtok"); } catch (e) {} },
    async signOut() {
      driveTok = null; try { sessionStorage.removeItem("navi-gtok"); } catch (e) {}
      hint.set(""); device.set(null);
      try { const fb = await boot(); await fb.U.signOut(fb.auth); } catch (e) {}
      location.reload();
    },
    // 에뮬레이터 시험에서만: 가짜 구글 계정으로 로그인해요(실제 Firebase에서는 쓸 수 없어요). o: { keep, name }
    async testSignIn(email, o) {
      if (!cfg.emulator) throw new Error("emulator only");
      const fb = await boot();
      await chooseKeep(fb, !(o && o.keep === false));
      const cred = fb.U.GoogleAuthProvider.credential(JSON.stringify(Object.assign({ sub: email, email, email_verified: true }, o && o.name ? { name: o.name } : {})));
      const r = await fb.U.signInWithCredential(fb.auth, cred);
      signedIn(r.user);
    }
  };

  // 로그인한 적이 없으면 여기서 끝: 앱은 이 기기 안에서만 동작해요
  if (!hint.get()) return;

  // ---------- 저장소: Firestore를 시안이 쓰는 모양 그대로 ----------
  // Firestore는 ‘배열 안의 배열’(예시 수업의 표 rows · 낱말 defs)을 저장하지 못해요.
  // 저장할 때만 안쪽 배열을 { __a: [...] }로 감싸고, 읽을 때 그대로 풀어서 앱이 보는 모양은 바뀌지 않아요
  function pack(v, inArray) {
    if (Array.isArray(v)) { const a = v.map((x) => pack(x, true)); return inArray ? { __a: a } : a; }
    if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = pack(v[k], false); }); return o; }
    return v;
  }
  function unpack(v) {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === "__a" && Array.isArray(v.__a)) return v.__a.map(unpack);
      const o = {}; keys.forEach((k) => { o[k] = unpack(v[k]); }); return o;
    }
    return v;
  }

  // dev: PIN으로 연결한 휴대폰이면 { teacher, sid } — 그 교사 자리를 읽고, 보안 규칙이 허락한 것만 써요
  function makeDb(fb, user, dev, ownerHash) {
    const F = fb.F, owner = dev ? dev.teacher : user.uid, base = "teachers/" + owner + "/";
    // 교사 PC가 연결을 끝냈거나(수업 끝 · 연결 끊기) 시간이 지나면 규칙이 막아요 → 연결 화면으로 돌아가 그 까닭을 말해요
    let ended = false;
    const denied = (e) => {
      if (!dev || ended || !e || e.code !== "permission-denied") return false;
      ended = true;
      device.set(null); hint.set("");
      try { sessionStorage.setItem(ENDED, "교사 PC가 이 휴대폰 연결을 끝냈어요. 다시 쓰려면 PIN 4자리로 다시 연결해 주세요."); } catch (x) {}
      setTimeout(() => location.reload(), 1500);
      return true;
    };
    let writes = 0;
    // 잘못된 값이어도 앱 흐름(수업 시작 등)을 멈추지 않도록, 쓰기 오류는 언제나 거절된 약속으로 돌려줘요
    const counted = (fn) => { writes++; window.__naviWrites = writes; try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); } };
    const snap = (s) => ({ id: s.id, exists: s.exists(), data: () => unpack(s.data()), metadata: { hasPendingWrites: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache } });
    // db.append(…)로 만든 값은 서버에서 배열 끝에 덧붙여요(arrayUnion). 두 기기가 같은 순간 눌러도 둘 다 남아요
    const prep = (o) => {
      const out = {};
      Object.keys(o).forEach((k) => { const v = o[k]; out[k] = v && v.__append ? F.arrayUnion.apply(null, v.__append.map((x) => pack(x, true))) : pack(v, false); });
      return out;
    };
    // 따라가는 기기(휴대폰)의 조작은 ‘조건부’로 보내요(update(p, { base })):
    // - 서버의 지금 값이 base와 같을 때만(그 사이 교사 PC가 바꿨으면 버려요)
    // - 누른 뒤 STALE_MS 안에만(보내는 길이 끊겼다 이어져도 오래된 조작이 뒤늦게 적용되지 않게)
    // 그래서 Firestore의 ‘끊긴 동안 모아 두었다 나중에 보내기’를 쓰지 않는 거래(transaction)로 보내고, 누른 차례대로 하나씩 보내요.
    // 교사 PC(base 없음)는 지금처럼 모아 두었다 보내요(수업 화면이 PC의 창이라 PC가 기준).
    const STALE_MS = 3000;
    const stale = (why) => Object.assign(new Error(why), { code: "stale" });
    let line = Promise.resolve();
    function guarded(ref, p, base, merge) {
      const t0 = Date.now();
      const late = () => Date.now() - t0 > STALE_MS;
      const run = () => F.runTransaction(fb.fs, async (tx) => {
        if (late()) throw stale("late");
        const s = await tx.get(ref);
        if (late()) throw stale("late");
        const d = s.exists() ? s.data() : null;
        if (merge) { tx.set(ref, prep(p), { merge: true }); return; }
        if (!d || Object.keys(base).some((k) => (d[k] === undefined ? null : d[k]) !== base[k])) throw stale("moved");
        tx.update(ref, prep(p));
      }, { maxAttempts: 2 });
      // 답이 없는 채로 멈춰도 화면은 기다리지 않아요(그 거래는 위의 시간 확인 때문에 늦게 적용되지 않아요)
      const job = new Promise((res, rej) => {
        const timer = setTimeout(() => rej(stale("timeout")), STALE_MS + 2000);
        line.then(run, run).then((v) => { clearTimeout(timer); res(v); }, (e) => { clearTimeout(timer); rej(e); });
      });
      line = job.catch(() => {});
      return job;
    }
    function doc(path) {
      const ref = F.doc(fb.fs, base + path);
      return {
        onSnapshot: (cb, err) => F.onSnapshot(ref, { includeMetadataChanges: true }, (s) => cb(snap(s)), (e) => { denied(e); if (err) err(e); }),
        set: (o) => counted(() => F.setDoc(ref, prep(o))),
        update: (p, opts) => counted(() => (opts && opts.base ? guarded(ref, p, opts.base) : F.updateDoc(ref, prep(p)))),
        // 같은 방식(몇 초 안에만, 누른 차례대로)으로 문서에 덧써요: PIN 휴대폰의 ‘명령’(cmds/{휴대폰})
        put: (p) => counted(() => guarded(ref, p, {}, true)),
        delete: () => counted(() => F.deleteDoc(ref))
      };
    }
    function collection(path) {
      const col = F.collection(fb.fs, base + path);
      // 수업 기록(2026-11-12, docs/RECORDS.md)에 더한 것: where(한 칸 조건) · startAfter(다음 쪽) · get(서버에서 한 번 읽기).
      // onSnapshot의 세 번째 값 meta가 true면 ‘서버가 아직 확인하지 않음’(hasPendingWrites · fromCache)이 바뀔 때도 알려 줘요
      const make = (parts) => F.query.apply(null, [col].concat(parts));
      const query = (parts) => ({
        orderBy: (f, d) => query(parts.concat([F.orderBy(f, d)])),
        limit: (n) => query(parts.concat([F.limit(n)])),
        where: (f, op, v) => query(parts.concat([F.where(f, op, v)])),
        startAfter: function () { return query(parts.concat([F.startAfter.apply(null, arguments)])); },
        get: () => F.getDocsFromServer(make(parts)).then((q) => ({ docs: q.docs.map(snap) })),
        onSnapshot: (cb, err, meta) => (meta
          ? F.onSnapshot(make(parts), { includeMetadataChanges: true }, (q) => cb({ docs: q.docs.map(snap), metadata: { fromCache: q.metadata.fromCache, hasPendingWrites: q.metadata.hasPendingWrites } }), (e) => { if (err) err(e); })
          : F.onSnapshot(make(parts), (q) => cb({ docs: q.docs.map(snap) }), (e) => { if (err) err(e); }))
      });
      return Object.assign(query([]), { add: (o) => counted(() => F.addDoc(col, prep(o))).then((r) => ({ id: r.id })) });
    }
    // ---------- 수업을 맡은 PC 창(lessons/hub의 pc): docs/CLASS-STABILITY.md ----------
    // 같은 계정의 PC 창은 보안 규칙으로 구별되지 않아서(같은 UID), 잠금은 이 문서 하나로 해요. 두 거래 모두 hub를 읽고 쓰기 때문에,
    // 그 사이 다른 창이 hub를 바꾸면 Firestore가 거래를 다시 돌려요. 그래서 ‘확인했는데 그 순간 넘어간’ 쓰기가 생기지 않아요.
    // 거래는 끊긴 동안 모아 두었다 나중에 보내지 않아요. 넘겨준 PC의 오래된 쓰기가 다시 이어진 뒤 서버에 닿는 일이 없어요.
    const hubRef = F.doc(fb.fs, base + "lessons/hub");
    const nope = (c) => Object.assign(new Error(c), { code: c });
    const readHub = (tx) => tx.get(hubRef).catch((e) => { throw e && e.code === "permission-denied" ? nope("hub-denied") : e; });
    const running = async (tx, sid) => { const s = await tx.get(F.doc(fb.fs, base + "sessions/" + sid)), d = s.exists() ? s.data() : null; return !!(d && d.started && !d.ended); };
    // 맡기: 교사의 행동이 있을 때만 불러요. expect가 있으면 화면에서 본 그 PC(또는 빈자리)에서만 넘겨받고,
    // 없으면 다른 PC가 켜져 있을 때 거절해요. live가 없으면 진행 중인 수업 위로는 맡지 않아요. run은 있던 값을 그대로 둬요
    function claim(me, state, o) {
      o = o || {};
      return F.runTransaction(fb.fs, async (tx) => {
        const h = await readHub(tx), d = h.exists() ? h.data() : null, pc = (d && d.pc) || "";
        if (o.expect !== undefined) { if (pc !== o.expect) throw nope("moved"); }
        else if (pc && pc !== me && d.on) throw nope("held");
        if (!o.live && o.sid && await running(tx, o.sid)) throw nope("live");
        const run = (d && d.run) || state.run;
        tx.set(hubRef, prep(Object.assign({}, state, { run })), { merge: true });
        return { run };
      }, { maxAttempts: 4 });
    }
    // 맡은 창의 쓰기: 서버의 hub.pc가 이 창일 때만 한 번에 적용해요. 아니면 { code: "lost" }. calm: 그 수업이 진행 중이면 { code: "live" }.
    // req: 휴대폰의 그 요청이 아직 서버에 있을 때만(휴대폰이 취소했으면 { code: "gone" }). until: 이 창의 시계로 그때까지만 승인해요({ code: "late" })
    function held(me, list, o) {
      writes += list.length; window.__naviWrites = writes;
      return F.runTransaction(fb.fs, async (tx) => {
        const h = await readHub(tx);
        if (!h.exists() || h.data().pc !== me) throw nope("lost");
        if (o && o.req) {
          const r = h.data().startReq, a = h.data().startAck;
          if (!r || r.id !== o.req) {
            // 이 거래가 이미 서버에 닿았는데 응답만 잃어 다시 시도한 경우: 요청 대신 자기가 쓴 승인이 있어요. 다시 쓰지 않고 된 것으로 봐요
            if (a && a.id === o.req && a.ok === true) return "again";
            throw nope("gone");
          }
          if (o.until && Date.now() > o.until) throw nope("late");
        }
        if (o && o.calm && await running(tx, o.calm)) throw nope("live");
        // merge(서버의 지금 문서) → { op, data } 또는 { skip }: 끊긴 동안 쌓인 PC 쓰기를 서버의 지금 수업과 맞춰 봐요(수업 시계, docs/CLASS-CLOCK.md).
        // 읽기는 쓰기보다 먼저라서 문서마다 한 번 읽고, 앞 쓰기의 결과를 이 안에서 이어 붙여 다음 쓰기가 봐요. 거래가 다시 돌면 같은 함수를 다시 불러요(순수 함수)
        const cur = {};
        for (const w of list) if (w.merge && !(w.path in cur)) { const s = await tx.get(F.doc(fb.fs, base + w.path)); cur[w.path] = s.exists() ? unpack(s.data()) : null; }
        return list.map((w) => {
          const ref = F.doc(fb.fs, base + w.path);
          let op = w.op, data = w.data, kept = "", lost = null;
          if (w.merge) {
            const r = w.merge(cur[w.path]) || { skip: "skip" };
            if (r.skip) return { skip: r.skip, kept: r.kept || "", lost: r.lost || null };
            op = r.op; data = r.data; kept = r.kept || ""; lost = r.lost || null;
            cur[w.path] = op === "set" ? Object.assign({}, data) : cur[w.path] && applied(cur[w.path], data);
          }
          if (op === "set") tx.set(ref, prep(data)); else tx.update(ref, prep(data));
          return { op, data, kept, lost };
        });
      }, { maxAttempts: 4 });
    }
    // 이 거래 안에서 앞 쓰기가 남긴 모양(arrayUnion은 같은 값이 없을 때만 덧붙여요)
    function applied(d, p) {
      const o = Object.assign({}, d);
      Object.keys(p).forEach((k) => {
        const v = p[k];
        if (v && v.__append) { const a = Array.isArray(o[k]) ? o[k].slice() : []; v.__append.forEach((x) => { if (!a.some((y) => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); o[k] = a; }
        else o[k] = v;
      });
      return o;
    }
    // 휴대폰이 요청을 기다리다 그만둘 때: PC의 답이 먼저 왔으면 그 답을, 아니면 요청을 서버에서 지워요. 거래 하나라서 PC의 승인(held의 req)과
    // 둘 중 하나만 일어나요. live: 서버가 아는 지금 상태(수업이 진행 중인지). 답을 놓쳤어도 실제로 시작된 수업을 실패로 말하지 않게 봐요
    function settle(id) {
      return F.runTransaction(fb.fs, async (tx) => {
        const h = await tx.get(hubRef), d = h.exists() ? h.data() : null, r = d && d.startReq, a = d && d.startAck;
        if (r && r.id === id) tx.update(hubRef, { startReq: null });
        return { ack: a && a.id === id ? a : null, live: !!(d && d.live) };
      }, { maxAttempts: 3 });
    }
    // 휴대폰이 잠들었다 깨거나 인터넷이 돌아오면, 끊긴 걸 늦게 알아채지 않도록 연결을 한 번 다시 열어요(읽기만, 쓰기 없음)
    let hiddenAt = 0;
    const reopen = () => F.disableNetwork(fb.fs).then(() => F.enableNetwork(fb.fs)).catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5000) { hiddenAt = 0; reopen(); }
    });
    window.addEventListener("online", reopen);
    const out = {
      scope: ["sessions", "lessons"],
      // name: 구글 계정 이름(처음 로그인할 때 표시 이름의 기본값). 표시 이름은 profile/me에 둬요
      account: { email: user.email || "", uid: user.uid, device: !!dev, sid: dev ? dev.sid : "", name: dev ? "" : user.displayName || "" },
      doc, collection, settle,
      append: function () { return { __append: Array.prototype.slice.call(arguments) }; }
    };
    if (!dev) { out.claim = claim; out.held = held; }
    if (!dev && cfg.pin) out.pair = pairing(fb, user, prep, ownerHash);
    return out;
  }

  // ---------- PIN 4자리로 연결: 교사 PC 쪽 (docs/UX-1-1.md 9) ----------
  // PIN 자리 pins/{PIN}은 ‘휴대폰 연결’을 연 동안(3분) 이 교사가 맡아요. 같은 PIN을 다른 교사가 맡고 있으면 열리지 않아요(taken).
  // 휴대폰은 요청 하나만 남기고, 교사 PC가 허용해야 teachers/{교사}/devices/{휴대폰} 문서가 생겨 그 수업만 읽고 넘길 수 있어요.
  // 수업이 끝나거나 ‘연결 끊기’면 지워요.
  const PIN_MS = 3 * 60 * 1000, DEVICE_MS = 3 * 60 * 60 * 1000;
  function pairing(fb, user, prepOut, owner) {
    const F = fb.F, mine = "teachers/" + user.uid + "/devices";
    const pinRef = (pin) => F.doc(fb.fs, "pins/" + pin);
    // 구글로 가입한 교사는 누구나 PIN 자리를 열어요(2026-11-11, 승인 목록 없음). 보안 규칙이 한 계정에 자기 설정의 PIN 하나만 열게 해요
    const out = {
      PIN_MS, PIN_ASKS, tag: owner.slice(0, 8),
      // 이 PIN 자리를 새 lease로 맡아요. 남이 맡고 있으면(열려 있고 시간 전) 규칙이 거절해요 → { code: "taken" }
      // 거절이 와도 정말 다른 교사가 열어 둔 자리인지 한 번 읽어 확인해요. 아니면 잠깐 뒤 한 번만 다시 해요(PIN을 괜히 바꾸지 않게)
      async open(pin, again) {
        const lease = rid(), exp = Date.now() + PIN_MS, sid = "s" + pin;
        try { await F.setDoc(pinRef(pin), { owner, sid, lease, exp, open: true, asks: 0, no: 0 }); }
        catch (e) {
          if (!e || e.code !== "permission-denied") throw e;
          let d = null;
          try { const s = await F.getDoc(pinRef(pin)); d = s.exists() ? s.data() : null; } catch (x) {}
          if (d && d.owner !== owner && d.open && d.exp > Date.now()) throw Object.assign(new Error("taken"), { code: "taken" });
          if (!again) { await new Promise((r) => setTimeout(r, 800)); return this.open(pin, true); }
          throw e;
        }
        return { pin, sid, lease, exp };
      },
      close: (l) => F.updateDoc(pinRef(l.pin), { open: false }).catch(() => {}),
      // 자리(열림 · 끝나는 시각 · 요청 수)와 이 lease로 온 요청들: [{ id, at, kind, ok, no, gone }]
      watch(l, onPin, onAsks) {
        const a = F.onSnapshot(pinRef(l.pin), (s) => onPin(s.exists() ? s.data() : null), () => onPin(null));
        const b = F.onSnapshot(F.query(F.collection(fb.fs, "pins/" + l.pin + "/asks"), F.where("lease", "==", l.lease)),
          (q) => onAsks(q.docs.map((d) => Object.assign({ id: d.id }, d.data()))), () => onAsks([]));
        return () => { a(); b(); };
      },
      // 허용: 기기 문서 + 요청에 답 + 자리 닫기를 한 번에(한 번 열면 한 대만)
      // run: 이번 수업 하나의 id. 휴대폰은 이 수업(run)에만 묶여서, 같은 PIN을 다음 수업에 다시 써도 새 수업에는 못 들어와요.
      // 같은 한 번의 쓰기로 PC 준비 상태 · 수업 문서에도 run을 적어요(fresh: 끝난 수업이면 빈 수업으로 바꿔 지난 기록을 보이지 않게)
      allow(l, id, run, fresh) {
        const b = F.writeBatch(fb.fs), base = "teachers/" + user.uid + "/";
        b.set(F.doc(fb.fs, base + "lessons/hub"), { run }, { merge: true });
        if (fresh) b.set(F.doc(fb.fs, base + "sessions/" + l.sid), prepOut(fresh));
        else b.set(F.doc(fb.fs, base + "sessions/" + l.sid), { run }, { merge: true });
        b.set(F.doc(fb.fs, mine + "/" + id), { sid: l.sid, run, exp: Date.now() + DEVICE_MS, at: Date.now() });
        b.update(F.doc(fb.fs, "pins/" + l.pin + "/asks/" + id), { ok: true, teacher: user.uid, sid: l.sid });
        b.update(pinRef(l.pin), { open: false });
        return b.commit();
      },
      // 거절: 요청에 ‘거절’ + 그 자리의 거절 수 +1을 한 번에. 그만큼 기다리는 자리가 다시 비어요(모르는 요청이 자리를 채워도 내 휴대폰이 들어올 수 있게)
      deny(l, id) {
        const b = F.writeBatch(fb.fs);
        b.update(F.doc(fb.fs, "pins/" + l.pin + "/asks/" + id), { no: true });
        b.update(pinRef(l.pin), { no: F.increment(1) });
        return b.commit();
      },
      // 허용한 휴대폰들: [{ id, sid, exp, at }]
      devices: (cb) => F.onSnapshot(F.collection(fb.fs, mine), (q) => cb(q.docs.map((d) => Object.assign({ id: d.id }, d.data()))), () => cb([])),
      revoke: (id) => F.deleteDoc(F.doc(fb.fs, mine + "/" + id)),
      async revokeAll() {
        const q = await F.getDocs(F.collection(fb.fs, mine));
        if (!q.size) return;
        const b = F.writeBatch(fb.fs);
        q.docs.forEach((d) => b.delete(d.ref));
        return b.commit();
      }
    };
    return out;
  }

  window.claude = {
    // 한 페이지에서는 한 번만 열어요(로그인 확인 · 저장소 준비). 다시 불러도 같은 결과를 돌려줘요
    use: (name) => name !== "db" ? Promise.resolve(null) : (opening || (opening = openDb())),
  };
  let opening = null;
  async function openDb() {
    {
      let fb;
      try { fb = await boot(); } catch (e) {
        st.error = "Firebase를 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 지금은 이 기기에서만 수업해요.";
        emit();
        return null;
      }
      await fb.auth.authStateReady();
      const user = fb.auth.currentUser;
      if (!user) { hint.set(""); device.set(null); window.naviAuth.signedIn = false; emit(); return null; }
      // 익명 로그인은 PIN 연결로 교사 PC가 허용한 휴대폰일 때만 써요
      const dev = user.isAnonymous ? device.get() : null;
      if (user.isAnonymous && (!cfg.pin || !dev || dev.uid !== user.uid)) { hint.set(""); device.set(null); window.naviAuth.signedIn = false; emit(); return null; }
      // 로그인이 확인된 뒤에만(authStateReady) 계정의 문서를 열어요. 구글로 가입한 교사는 승인 없이 자기 자리(teachers/{UID})를 써요(2026-11-11).
      // 남의 자리 · 허용받지 않은 휴대폰은 보안 규칙이 막아요
      st.email = user.email || ""; st.uid = dev ? "" : user.uid; st.name = dev ? "" : user.displayName || "";
      emit();
      const owner = cfg.pin && !dev ? await sha256hex(user.uid).catch(() => "") : "";
      return makeDb(fb, user, dev, owner);
    }
  }
})();
