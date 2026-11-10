/* =========================================================
   서해보건ON - 데이터 저장소
   - config.js 에 Firebase 설정이 있으면: 인터넷(Firebase)에 저장해서
     학생 휴대폰과 선생님 기기가 실시간으로 연결돼요.
   - 설정이 없으면: 이 기기(브라우저)에만 저장해요.
   화면 코드(script.js, teacher.js)는 아래 DB.xxx 함수만 써요.
   ========================================================= */

const FIREBASE_VERSION = "10.12.2";
const PIN_PREFIX = "seohaeON-"; // Firebase 비밀번호는 6자 이상이라 암호 앞에 붙여요 (예: 1234 → seohaeON-1234)

// 오늘 날짜 "2026-11-03"
function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* =========================================================
   1) 이 기기 저장소 (Firebase 설정 전)
   ========================================================= */
function createLocalAdapter() {
  const KEY = "seohaeON-db";
  const listeners = new Set();

  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  const save = (data) => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 불가 */ }
    listeners.forEach((fn) => fn());
  };
  // 다른 탭에서 바뀌어도 알려 줘요
  window.addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((fn) => fn()); });

  const match = (doc, filters) => filters.every(([f, op, v]) =>
    op === "in" ? v.includes(doc[f]) : doc[f] === v);

  let uid;
  try {
    uid = localStorage.getItem("seohaeON-device");
    if (!uid) { uid = "dev-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("seohaeON-device", uid); }
  } catch (e) { uid = "dev-" + Math.random().toString(36).slice(2, 10); }

  const apply = (data, op) => {
    const col = (data[op.col] = data[op.col] || {});
    if (op.type === "set") col[op.id] = { ...op.data };
    if (op.type === "update" && col[op.id]) Object.assign(col[op.id], op.data);
    if (op.type === "update" && !col[op.id]) col[op.id] = { ...op.data };
    if (op.type === "delete") delete col[op.id];
  };

  return {
    mode: "local",
    uid,
    async init() {},
    newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    watchDoc(scope, col, id, cb) {
      const run = () => { const c = load()[col] || {}; cb(c[id] ? { id, ...c[id] } : null); };
      listeners.add(run); run();
      return () => listeners.delete(run);
    },
    watchQuery(scope, col, filters, cb) {
      const run = () => {
        const c = load()[col] || {};
        cb(Object.entries(c).map(([id, d]) => ({ id, ...d })).filter((d) => match(d, filters)));
      };
      listeners.add(run); run();
      return () => listeners.delete(run);
    },
    async batch(scope, ops) { const data = load(); ops.forEach((op) => apply(data, op)); save(data); },

    // 선생님 암호 (이 기기에 저장)
    async teacherLogin(pin) {
      let saved = "1234";
      try { saved = localStorage.getItem("seohaeON-pin") || "1234"; } catch (e) {}
      return pin === saved ? { ok: true } : { ok: false, error: "wrong" };
    },
    async teacherLogout() {},
    async changeTeacherPin(oldPin, newPin) {
      const r = await this.teacherLogin(oldPin);
      if (!r.ok) return r;
      try { localStorage.setItem("seohaeON-pin", newPin); return { ok: true }; }
      catch (e) { return { ok: false, error: "save" }; }
    }
  };
}

/* =========================================================
   2) Firebase 저장소 (학생 = 익명 로그인, 선생님 = 이메일 로그인)
   ========================================================= */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("load " + src));
    document.head.appendChild(s);
  });
}

function createFirebaseAdapter(cfg) {
  let studentDb, teacherDb, teacherAuth;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

  const dbFor = (scope) => (scope === "teacher" ? teacherDb : studentDb);
  const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const onErr = (err) => console.warn("[서해보건ON] 불러오기 실패:", err && err.code, err && err.message);

  const adapter = {
    mode: "firebase",
    uid: null,
    async init() {
      // 앱 실행 전에 SDK를 불러와요 (이미 있으면 건너뛰어요)
      if (!window.firebase) await loadScript(`${base}/firebase-app-compat.js`);
      if (!firebase.auth) await loadScript(`${base}/firebase-auth-compat.js`);
      if (!firebase.firestore) await loadScript(`${base}/firebase-firestore-compat.js`);

      // 학생용 연결 (기기마다 익명 계정 하나 — 앱을 지우지 않는 한 유지돼요)
      const studentApp = firebase.initializeApp(cfg.firebase);
      studentDb = studentApp.firestore();
      const sAuth = studentApp.auth();
      // 선생님용 연결은 따로 만들어서, 같은 기기에서 바꿔도 학생 기록이 사라지지 않아요
      const teacherApp = firebase.initializeApp(cfg.firebase, "teacher");
      teacherDb = teacherApp.firestore();
      teacherAuth = teacherApp.auth();
      await teacherAuth.setPersistence(firebase.auth.Auth.Persistence.NONE); // 새로고침하면 다시 잠겨요

      if (window.SEOHAE_TEST_HOOK) window.SEOHAE_TEST_HOOK(studentApp, teacherApp); // (테스트용, 평소엔 없음)

      if (!sAuth.currentUser) {
        await new Promise((res) => { const off = sAuth.onAuthStateChanged(() => { off(); res(); }); });
      }
      if (!sAuth.currentUser) await sAuth.signInAnonymously();
      adapter.uid = sAuth.currentUser.uid;
    },
    newId() { return studentDb.collection("_").doc().id; },
    watchDoc(scope, col, id, cb) {
      return dbFor(scope).collection(col).doc(id)
        .onSnapshot((d) => cb(d.exists ? { id: d.id, ...d.data() } : null), onErr);
    },
    watchQuery(scope, col, filters, cb) {
      let q = dbFor(scope).collection(col);
      filters.forEach(([f, op, v]) => { q = q.where(f, op, v); });
      return q.onSnapshot((snap) => cb(toList(snap)), onErr);
    },
    async batch(scope, ops) {
      const db = dbFor(scope);
      const b = db.batch();
      ops.forEach((op) => {
        const ref = db.collection(op.col).doc(op.id);
        if (op.type === "set") b.set(ref, op.data);
        if (op.type === "update") b.set(ref, op.data, { merge: true });
        if (op.type === "delete") b.delete(ref);
      });
      await b.commit();
    },

    async teacherLogin(pin) {
      try {
        await teacherAuth.signInWithEmailAndPassword(cfg.teacherEmail, PIN_PREFIX + pin);
        return { ok: true };
      } catch (e) {
        if (e.code === "auth/too-many-requests") return { ok: false, error: "tooMany" };
        if (e.code === "auth/network-request-failed") return { ok: false, error: "network" };
        return { ok: false, error: "wrong" };
      }
    },
    async teacherLogout() { try { await teacherAuth.signOut(); } catch (e) {} },
    async changeTeacherPin(oldPin, newPin) {
      const user = teacherAuth.currentUser;
      if (!user) return { ok: false, error: "wrong" };
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(cfg.teacherEmail, PIN_PREFIX + oldPin);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(PIN_PREFIX + newPin);
        return { ok: true };
      } catch (e) {
        if (e.code === "auth/too-many-requests") return { ok: false, error: "tooMany" };
        return { ok: false, error: e.code === "auth/network-request-failed" ? "network" : "wrong" };
      }
    }
  };
  return adapter;
}

/* =========================================================
   3) 앱에서 쓰는 기능들
   ========================================================= */
const DB = (() => {
  const cfg = APP_CONFIG;
  let A = cfg.firebase ? createFirebaseAdapter(cfg) : createLocalAdapter();
  let status = { state: "in", memo: "", time: null, usedBeds: [] };

  const api = {
    get mode() { return A.mode; },
    get uid() { return A.uid; },

    async init() {
      try {
        await A.init();
      } catch (e) {
        // 인터넷이 안 되거나 설정이 틀리면 이 기기 저장으로 바꿔요
        console.warn("[서해보건ON] Firebase 연결 실패 → 이 기기에만 저장해요", e);
        A = createLocalAdapter();
        await A.init();
        api.connectError = true;
      }
      A.watchDoc("student", "public", "status", (d) => { if (d) status = { ...status, ...d }; });
    },

    /* ----- 모두가 보는 보건실 상황 ----- */
    watchStatus(cb) {
      return A.watchDoc("student", "public", "status", (d) => {
        status = { state: "in", memo: "", time: null, usedBeds: [], ...(d || {}) };
        cb(status);
      });
    },
    freeBeds(st = status) { return Math.max(0, cfg.totalBeds - (st.usedBeds || []).length); },

    /* ----- 학생: 침대 요청 ----- */
    watchMyBedRequests(cb) { return A.watchQuery("student", "bedRequests", [["uid", "==", A.uid]], cb); },
    createBedRequest({ studentNo, name, symptom }) {
      const now = Date.now();
      return A.batch("student", [{ type: "set", col: "bedRequests", id: A.newId(),
        data: { uid: A.uid, studentNo, name, symptom, status: "pending", time: now, date: todayKey() } }]);
    },
    cancelBedRequest(id) { return A.batch("student", [{ type: "delete", col: "bedRequests", id }]); },
    markStudentAlerted(id) {
      return A.batch("student", [{ type: "update", col: "bedRequests", id, data: { studentAlerted: true } }]);
    },

    /* ----- 학생: 예약 ----- */
    // 오늘 예약 순서 (이름·증상 없이 공개)
    watchTodayReservations(cb) { return A.watchQuery("student", "reservations", [["date", "==", todayKey()]], cb); },
    // 내 예약의 자세한 정보 (학번·이름·증상·처치 내용 — 나와 선생님만)
    watchMyReservationInfo(cb) { return A.watchQuery("student", "reservationInfo", [["uid", "==", A.uid]], cb); },
    createReservation({ slot, studentNo, name, symptom }) {
      const id = A.newId(), now = Date.now(), date = todayKey();
      return A.batch("student", [
        { type: "set", col: "reservations", id, data: { uid: A.uid, date, slot, status: "waiting", createdAt: now } },
        { type: "set", col: "reservationInfo", id, data: { uid: A.uid, date, slot, studentNo, name, symptom, createdAt: now } }
      ]).then(() => id);
    },
    cancelReservation(id) {
      return A.batch("student", [
        { type: "delete", col: "reservations", id },
        { type: "delete", col: "reservationInfo", id }
      ]);
    },

    /* ----- 선생님 ----- */
    teacherLogin(pin) { return A.teacherLogin(pin); },
    teacherLogout() { return A.teacherLogout(); },
    changeTeacherPin(o, n) { return A.changeTeacherPin(o, n); },

    saveStatus(change) {
      return A.batch("teacher", [{ type: "update", col: "public", id: "status", data: { ...change, time: Date.now() } }]);
    },
    watchOpenBedRequests(cb) {
      return A.watchQuery("teacher", "bedRequests", [["status", "in", ["pending", "approved"]]], cb);
    },
    approveBedRequest(id) {
      const used = status.usedBeds || [];
      let bed = null;
      for (let n = 1; n <= cfg.totalBeds; n++) if (!used.includes(n)) { bed = n; break; }
      if (!bed) return Promise.resolve(null);
      return A.batch("teacher", [
        { type: "update", col: "bedRequests", id, data: { status: "approved", bed, decidedAt: Date.now() } },
        { type: "update", col: "public", id: "status", data: { usedBeds: used.concat(bed) } }
      ]).then(() => bed);
    },
    rejectBedRequest(id, reason) {
      return A.batch("teacher", [{ type: "update", col: "bedRequests", id,
        data: { status: "rejected", reason, decidedAt: Date.now() } }]);
    },
    finishBed(id, bed) {
      return A.batch("teacher", [
        { type: "update", col: "bedRequests", id, data: { status: "done", doneAt: Date.now() } },
        { type: "update", col: "public", id: "status", data: { usedBeds: (status.usedBeds || []).filter((n) => n !== bed) } }
      ]);
    },
    // 침대 기록이 꼬였을 때 선생님이 직접 비우기
    clearBedNumber(bed) {
      return A.batch("teacher", [{ type: "update", col: "public", id: "status",
        data: { usedBeds: (status.usedBeds || []).filter((n) => n !== bed) } }]);
    },
    markTeacherAlerted(id) {
      return A.batch("teacher", [{ type: "update", col: "bedRequests", id, data: { teacherAlerted: true } }]);
    },
    watchTodayReservationsTeacher(cb) { return A.watchQuery("teacher", "reservations", [["date", "==", todayKey()]], cb); },
    watchTodayReservationInfoTeacher(cb) { return A.watchQuery("teacher", "reservationInfo", [["date", "==", todayKey()]], cb); },
    // 진료 완료 → 학생 확인증이 생겨요 (예약 시간 ~ 지금)
    completeReservation(id) {
      return A.batch("teacher", [
        { type: "update", col: "reservations", id, data: { status: "done" } },
        { type: "update", col: "reservationInfo", id, data: { doneAt: Date.now() } }
      ]);
    },
    // 처치 내용 적기 (선택)
    setTreatment(id, treatment) {
      return A.batch("teacher", [{ type: "update", col: "reservationInfo", id, data: { treatment } }]);
    },
    deleteReservation(id) {
      return A.batch("teacher", [
        { type: "delete", col: "reservations", id },
        { type: "delete", col: "reservationInfo", id }
      ]);
    }
  };
  return api;
})();
