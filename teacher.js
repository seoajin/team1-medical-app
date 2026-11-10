/* =========================================================
   서해보건ON - 선생님용 화면 동작 (같은 index.html 안에 있어요)
   ========================================================= */

const QUICK_MEMOS = [
  "10분 뒤에 돌아와요",
  "점심 식사 중이에요",
  "교무실에 있어요",
  "급하면 교무실로 오세요",
  "예약한 학생 먼저 봐요"
];

const REJECT_REASONS = [
  "먼저 보건실로 와서 확인받아요",
  "침대가 모두 차 있어요",
  "증상이 가벼워서 교실에서 쉬어요",
  "담임 선생님과 먼저 이야기해요"
];

// 예약 학생 처치 내용 (전자 보건확인증에 들어가요)
const TREATMENTS = [
  "휴식 후 교실 복귀",
  "약 복용 후 교실 복귀",
  "상처 소독·처치",
  "냉찜질",
  "상담",
  "조퇴(귀가) 조치"
];

const T = {
  status: { state: "in", memo: "", time: null, usedBeds: [] },
  beds: [],          // 대기·사용 중 침대 요청
  resv: [],          // 오늘 예약 (공개 부분)
  resvInfo: []       // 오늘 예약 (학번·이름·증상)
};
let teacherUnsubs = [];
let openRejectId = null;   // 거부 사유를 고르는 중인 요청
const pickedTreat = {};    // 예약마다 고른 처치 내용

/* ---------- 선생님 상태 ---------- */
function renderStates() {
  $("stateGrid").innerHTML = Object.entries(TEACHER_STATES).map(([key, s]) => `
    <button class="state ${T.status.state === key ? "on" : ""}" data-state="${key}" aria-pressed="${T.status.state === key}">
      <span class="s-icon">${s.icon}</span>
      <span><b>${s.text}</b><span class="s-sub">${s.sub}</span></span>
    </button>`).join("");
}

function renderPreview() {
  const s = TEACHER_STATES[T.status.state] || TEACHER_STATES.in;
  const el = $("previewState");
  el.className = "stat-value teacher " + s.cls;
  el.innerHTML = `<span class="dot"></span>${s.text}`;
  const lines = [];
  if (T.status.memo) lines.push(`<b>💬 선생님 메모:</b> ${escapeHtml(T.status.memo)}`);
  if (T.status.state !== "in") lines.push("💡 급하지 않으면 아래 <b>응급처치 영상</b>을 먼저 보거나 예약해 두세요.");
  $("previewMemo").innerHTML = lines.join("<br>");
  $("previewMemo").hidden = lines.length === 0;
  $("changed").textContent = T.status.time ? `마지막으로 바꾼 시간: ${timeText(T.status.time)}` : "";
}

function renderTeacherView() {
  renderStates();
  renderPreview();
  if (document.activeElement !== $("memoInput")) $("memoInput").value = T.status.memo || "";
}

function saveTeacher(change, message) {
  DB.saveStatus(change).then(() => showToast(message), failToast);
}

$("stateGrid").onclick = (e) => {
  const b = e.target.closest("[data-state]");
  if (!b) return;
  const change = { state: b.dataset.state };
  if (change.state === "in") change.memo = ""; // 자리로 돌아오면 메모는 지워요
  saveTeacher(change, `"${TEACHER_STATES[change.state].text}"(으)로 바꿨어요. 학생 화면에 바로 보여요.`);
};

$("chips").innerHTML = QUICK_MEMOS.map((m) => `<button class="chip">${m}</button>`).join("");
$("chips").onclick = (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  $("memoInput").value = c.textContent;
  $("memoInput").focus();
};

$("memoSave").onclick = () => {
  const memo = $("memoInput").value.trim();
  saveTeacher({ memo }, memo ? "메모를 학생 화면에 올렸어요." : "메모를 비웠어요.");
};
$("memoInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("memoSave").click(); });
$("memoClear").onclick = () => { $("memoInput").value = ""; saveTeacher({ memo: "" }, "메모를 지웠어요."); };


/* ---------- 침대 사용 요청 ---------- */
function renderRequests() {
  const pending = T.beds.filter((r) => r.status === "pending").sort((a, b) => a.time - b.time);
  const using = T.beds.filter((r) => r.status === "approved").sort((a, b) => a.bed - b.bed);
  const free = DB.freeBeds(T.status);

  $("tBedFree").textContent = free;
  $("tBedTotal").textContent = APP_CONFIG.totalBeds;
  $("limitText").textContent = BED_LIMIT_MIN % 60 ? `${BED_LIMIT_MIN}분` : `${BED_LIMIT_MIN / 60}시간`;
  $("pendingCount").textContent = pending.length;
  $("pendingCount").hidden = pending.length === 0;

  $("cleanList").innerHTML = using.filter(isBedOverdue).map((r) => `
    <div class="clean-card">
      <div><b>🧹 ${r.bed}번 침대 정리가 필요해요</b>
        <span>${escapeHtml(r.studentNo)} ${escapeHtml(r.name)} · 사용 시간 끝 (${Math.max(0, -bedMinutesLeft(r))}분 지남)</span></div>
      <button class="act approve" data-act="done" data-id="${r.id}" data-bed="${r.bed}">정리 완료</button>
    </div>`).join("");

  $("requestList").innerHTML = pending.length
    ? pending.map((r) => `
      <div class="req-card">
        <div class="req-top">
          <b>${escapeHtml(r.studentNo)} ${escapeHtml(r.name)}</b>
          <span class="req-time">${timeText(r.time)} 요청</span>
        </div>
        <p class="req-symptom">🤒 ${escapeHtml(r.symptom)}</p>
        ${openRejectId === r.id ? `
          <div class="reject-box">
            <p>거부하는 이유를 골라 주세요 (학생에게 보여요)</p>
            <div class="chips">${REJECT_REASONS.map((m) => `<button class="chip" data-reason="${m}" data-id="${r.id}">${m}</button>`).join("")}</div>
            <button class="ghost-btn" data-act="cancelReject">취소</button>
          </div>` : `
          <div class="req-actions">
            <button class="act approve" data-act="approve" data-id="${r.id}" ${free === 0 ? "disabled" : ""}>✅ 허용</button>
            <button class="act reject" data-act="reject" data-id="${r.id}">❌ 거부</button>
          </div>
          ${free === 0 ? `<p class="full-note">빈 침대가 없어서 지금은 허용할 수 없어요.</p>` : ""}`}
      </div>`).join("")
    : `<p class="empty">새로운 요청이 없어요 👍</p>`;

  // 요청과 연결되지 않은 침대 번호(기록이 꼬인 경우)도 비울 수 있게 보여 줘요
  const linked = using.map((r) => r.bed);
  const orphan = (T.status.usedBeds || []).filter((n) => !linked.includes(n));
  const rows = using.map((r) => `
    <li class="${isBedOverdue(r) ? "late" : ""}"><span class="bed-no">${r.bed}번</span> ${escapeHtml(r.studentNo)} ${escapeHtml(r.name)}
      <small>${timeText(bedStartTime(r))}~${timeText(bedEndTime(r))} · ${isBedOverdue(r) ? "⏰ 시간 끝" : `남은 시간 ${bedMinutesLeft(r)}분`}</small>
      <button class="act small" data-act="done" data-id="${r.id}" data-bed="${r.bed}">침대 비우기</button></li>`)
    .concat(orphan.map((n) => `
    <li><span class="bed-no">${n}번</span> 사용 중으로 표시됨
      <button class="act small" data-act="clearBed" data-bed="${n}">비우기</button></li>`));
  $("usingList").innerHTML = rows.length ? `<ul class="using">${rows.join("")}</ul>` : `<p class="empty">지금 침대를 쓰는 학생이 없어요</p>`;
}

$("bedPanel").addEventListener("click", (e) => {
  const reasonBtn = e.target.closest("[data-reason]");
  if (reasonBtn) {
    const r = T.beds.find((x) => x.id === reasonBtn.dataset.id);
    openRejectId = null;
    DB.rejectBedRequest(reasonBtn.dataset.id, reasonBtn.dataset.reason)
      .then(() => showToast(`${r ? r.name : ""} 학생의 요청을 거부했어요.`), failToast);
    renderRequests();
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  const r = T.beds.find((x) => x.id === id);

  if (act === "approve") {
    DB.approveBedRequest(id).then((bed) =>
      showToast(bed ? `${r.name} 학생에게 ${bed}번 침대를 허용했어요.` : "빈 침대가 없어요"), failToast);
  }
  if (act === "reject") openRejectId = id;
  if (act === "cancelReject") openRejectId = null;
  if (act === "done") DB.finishBed(id, +b.dataset.bed).then(() => showToast(`${b.dataset.bed}번 침대를 비웠어요.`), failToast);
  if (act === "clearBed") DB.clearBedNumber(+b.dataset.bed).then(() => showToast(`${b.dataset.bed}번 침대를 비웠어요.`), failToast);
  renderRequests();
});

// 사용 시간이 지난 침대가 생기면 "침대 정리" 알림 (침대마다 한 번만)
function checkTeacherBedTime() {
  if ($("teacherView").hidden || !$("alertModal").hidden) return;
  const r = T.beds.find((x) => isBedOverdue(x) && !x.teacherAlerted);
  if (!r) return;
  DB.markTeacherAlerted(r.id).catch(() => {});
  showAlert({
    icon: "🧹",
    title: `${r.bed}번 침대 정리 요청`,
    text: `<b>${escapeHtml(r.studentNo)} ${escapeHtml(r.name)}</b> 학생이 침대를 ${BED_LIMIT_MIN}분 동안 썼어요.<br>학생 상태를 확인하고 침대를 정리해 주세요.`,
    buttons: [
      { text: "정리 완료", onClick: () => DB.finishBed(r.id, r.bed).then(() => showToast(`${r.bed}번 침대를 비웠어요.`), failToast) },
      { text: "나중에", cls: "light" }
    ]
  });
}


/* ---------- 오늘 예약 ---------- */
function renderResv() {
  const infoById = Object.fromEntries(T.resvInfo.map((x) => [x.id, x]));
  const list = T.resv.map((r) => ({ ...(infoById[r.id] || {}), ...r }))
    .sort((a, b) => (a.status === "done") - (b.status === "done") || a.slot - b.slot || a.createdAt - b.createdAt);
  const waiting = list.filter((r) => r.status === "waiting");
  $("resvCount").textContent = waiting.length;
  $("resvCount").hidden = waiting.length === 0;

  $("resvList").innerHTML = list.length ? list.map((r) => {
    const slot = SLOTS[r.slot] || {};
    if (r.status === "done") {
      return `<div class="req-card done-card">
        <div class="req-top"><b>${escapeHtml(r.studentNo)} ${escapeHtml(r.name)}</b><span class="req-time">✅ 확인증 발급됨</span></div>
        <p class="small" style="margin:4px 0 0">예약 ${slot.label || ""} (${slot.time || ""}) ~ 진료 완료 ${r.doneAt ? timeText(r.doneAt) : ""} · ${escapeHtml([r.symptom, r.treatment].filter(Boolean).join(" · "))}</p>
      </div>`;
    }
    const picked = pickedTreat[r.id];
    return `<div class="req-card">
      <div class="req-top"><b>${escapeHtml(r.studentNo)} ${escapeHtml(r.name)}</b><span class="req-time">예약 ${slot.label || ""} (${slot.time || ""})</span></div>
      <p class="req-symptom">${escapeHtml(r.symptom)}</p>
      <p class="treat-label">처치 내용 (골라도 되고 안 골라도 돼요)</p>
      <div class="chips">${TREATMENTS.map((m) => `<button class="chip ${picked === m ? "on" : ""}" data-treat="${m}" data-id="${r.id}">${m}</button>`).join("")}</div>
      <div class="req-actions">
        <button class="act approve" data-ract="done" data-id="${r.id}">🩺 진료 완료</button>
        <button class="act reject" data-ract="delete" data-id="${r.id}">🗑️ 안 옴·삭제</button>
      </div>
    </div>`;
  }).join("") : `<p class="empty">오늘 예약이 없어요</p>`;
}

$("resvPanel").addEventListener("click", (e) => {
  const t = e.target.closest("[data-treat]");
  if (t) {
    // 처치 내용은 한 번 더 누르면 선택이 풀려요
    pickedTreat[t.dataset.id] = pickedTreat[t.dataset.id] === t.dataset.treat ? null : t.dataset.treat;
    renderResv();
    return;
  }
  const b = e.target.closest("[data-ract]");
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.ract === "done") {
    const r = T.resvInfo.find((x) => x.id === id) || {};
    const treat = pickedTreat[id];
    // 진료 완료 → 학생 휴대폰에 전자 보건확인증 발급 (예약 시간 ~ 지금)
    DB.completeReservation(id)
      .then(() => (treat ? DB.setTreatment(id, treat) : null))
      .then(() => { delete pickedTreat[id]; showToast(`${r.name || ""} 학생 진료 완료! 전자 보건확인증이 발급됐어요.`); }, failToast);
  }
  if (b.dataset.ract === "delete") {
    showAlert({
      icon: "🗑️", title: "예약을 지울까요?", text: "학생이 오지 않았거나 잘못된 예약이면 지워 주세요.",
      buttons: [
        { text: "지우기", onClick: () => DB.deleteReservation(id).then(() => showToast("예약을 지웠어요"), failToast) },
        { text: "그대로 두기", cls: "light" }
      ]
    });
  }
});


/* ---------- 선생님 데이터 연결 (로그인한 동안만) ---------- */
function startTeacherData() {
  stopTeacherData();
  teacherUnsubs = [
    DB.watchStatus((st) => { T.status = st; renderTeacherView(); renderRequests(); }),
    DB.watchOpenBedRequests((list) => { T.beds = list; if (!openRejectId) renderRequests(); checkTeacherBedTime(); }),
    DB.watchTodayReservationsTeacher((list) => { T.resv = list; renderResv(); }),
    DB.watchTodayReservationInfoTeacher((list) => { T.resvInfo = list; renderResv(); })
  ];
}
function stopTeacherData() {
  teacherUnsubs.forEach((off) => { try { off && off(); } catch (e) {} });
  teacherUnsubs = [];
}
// 남은 시간 표시와 시간 끝 알림은 30초마다 다시 확인해요
setInterval(() => {
  if ($("teacherView").hidden) return;
  if (!openRejectId) renderRequests();
  checkTeacherBedTime();
}, 30000);


/* ---------- 학생용 ↔ 선생님용 바꾸기 (선생님용은 암호 필요) ---------- */
let teacherUnlocked = false; // 새로고침하면 다시 잠겨요

function setMode(mode) {
  if (mode === "teacher" && !teacherUnlocked) { openPinModal(); return; }
  const teacher = mode === "teacher";
  $("studentView").hidden = teacher;
  $("teacherView").hidden = !teacher;
  document.querySelectorAll(".mode [data-mode]").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
  });
  $("slogan").textContent = teacher ? "선생님용 화면" : "기다리지 말고, 확인하고, 예약하세요";
  $("meBtn").hidden = teacher;
  document.title = teacher ? "서해보건ON · 선생님용" : "서해보건ON";

  if (teacher) { renderTeacherView(); renderRequests(); renderResv(); }
  else { renderBedStatus(); checkStudentBedTime(); }
  window.scrollTo(0, 0);
}

document.querySelector(".mode").onclick = (e) => {
  const b = e.target.closest("[data-mode]");
  if (b) setMode(b.dataset.mode);
};

$("lockBtn").onclick = async () => {
  teacherUnlocked = false;
  stopTeacherData();
  await DB.teacherLogout();
  setMode("student");
  showToast("🔒 선생님 모드를 잠갔어요");
};

/* ---------- 암호 입력 (숫자 키패드) ---------- */
let pinEntry = "";
let wrongCount = 0;
let lockedUntil = 0;   // 5번 틀리면 30초 동안 못 눌러요
let checking = false;

function renderPinDots() {
  const len = Math.max(4, pinEntry.length);
  $("pinDots").innerHTML = Array.from({ length: len }, (_, i) =>
    `<span class="${i < pinEntry.length ? "fill" : ""}"></span>`).join("");
}

function openPinModal() {
  pinEntry = "";
  $("pinMsg").textContent = "";
  $("pinMsg").className = "pin-msg";
  renderPinDots();
  openModal("pinModal");
}

async function checkPin() {
  if (Date.now() < lockedUntil || checking || pinEntry.length < 4) {
    if (pinEntry.length < 4) $("pinMsg").textContent = "암호를 4자리 이상 눌러 주세요";
    return;
  }
  checking = true;
  $("pinMsg").className = "pin-msg ok";
  $("pinMsg").textContent = "확인하는 중…";
  await APP_READY;
  const res = await DB.teacherLogin(pinEntry);
  checking = false;
  $("pinMsg").className = "pin-msg";
  if (res.ok) {
    teacherUnlocked = true;
    wrongCount = 0;
    closeModal($("pinModal"));
    startTeacherData();
    setMode("teacher");
    showToast("🔓 선생님 모드로 들어왔어요");
    return;
  }
  pinEntry = "";
  renderPinDots();
  if (res.error === "network") { $("pinMsg").textContent = "인터넷 연결을 확인해 주세요"; return; }
  if (res.error === "tooMany") { $("pinMsg").textContent = "너무 많이 틀렸어요. 잠시 뒤에 다시 해 주세요"; return; }
  const dots = $("pinDots");
  dots.classList.remove("shake"); void dots.offsetWidth; dots.classList.add("shake");
  wrongCount++;
  if (wrongCount >= 5) { lockedUntil = Date.now() + 30000; wrongCount = 0; lockKeypad(); }
  else $("pinMsg").textContent = `암호가 틀렸어요 (${wrongCount} / 5번)`;
}

function lockKeypad() {
  const buttons = $("keypad").querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  const tick = setInterval(() => {
    const left = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(tick);
      buttons.forEach((b) => (b.disabled = false));
      $("pinMsg").textContent = "";
      return;
    }
    $("pinMsg").textContent = `5번 틀려서 ${left}초 뒤에 다시 할 수 있어요`;
  }, 250);
}

function pressKey(k) {
  if (Date.now() < lockedUntil || checking) return;
  if (k === "del") pinEntry = pinEntry.slice(0, -1);
  else if (k === "ok") { checkPin(); return; }
  else if (pinEntry.length < 8) pinEntry += k;
  $("pinMsg").textContent = "";
  renderPinDots();
}

$("keypad").onclick = (e) => {
  const b = e.target.closest("[data-k]");
  if (b) pressKey(b.dataset.k);
};

document.addEventListener("keydown", (e) => {
  if ($("pinModal").hidden) return;
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  if (e.key === "Backspace") pressKey("del");
  if (e.key === "Enter") pressKey("ok");
});

/* ---------- 암호 바꾸기 ---------- */
function pinChangeMsg(text, ok = false) {
  $("pinChangeMsg").textContent = text;
  $("pinChangeMsg").className = "pin-msg" + (ok ? " ok" : "");
}

$("pinChangeBtn").onclick = async () => {
  const now = $("pinNow").value.trim();
  const next = $("pinNew").value.trim();
  const next2 = $("pinNew2").value.trim();
  if (!/^[0-9]{4,8}$/.test(next)) return pinChangeMsg("새 암호는 숫자 4~8자리로 정해 주세요.");
  if (next === now) return pinChangeMsg("지금 암호와 다른 암호로 정해 주세요.");
  if (next !== next2) return pinChangeMsg("새 암호 두 개가 서로 달라요.");
  pinChangeMsg("바꾸는 중…", true);
  const res = await DB.changeTeacherPin(now, next);
  if (!res.ok) {
    return pinChangeMsg(res.error === "network" ? "인터넷 연결을 확인해 주세요."
      : res.error === "tooMany" ? "너무 많이 시도했어요. 잠시 뒤에 다시 해 주세요."
      : "지금 암호가 맞지 않아요.");
  }
  ["pinNow", "pinNew", "pinNew2"].forEach((id) => ($(id).value = ""));
  pinChangeMsg("✅ 암호를 바꿨어요. 다음부터 새 암호로 들어오세요.", true);
  showToast("암호를 바꿨어요");
};

// 처음에는 항상 학생용으로 시작해요 (주소 끝에 #teacher 를 붙이면 암호 창이 바로 떠요)
setMode("student");
if (location.hash === "#teacher") openPinModal();
