/* =========================================================
   서해보건ON - 학생용 화면 동작
   (응급처치 영상은 videos.js, 데이터 저장은 db.js)
   ========================================================= */

const APP_READY = DB.init();
const STUDENT = {
  status: null,          // 보건실 상황 (선생님 상태, 사용 중인 침대)
  todayResv: [],         // 오늘 예약 순서 (공개)
  myResvInfo: [],        // 내 예약 자세한 정보
  myBeds: []             // 내 침대 요청
};

/* ---------- 1. 내 정보 (학번·이름은 이 기기에 저장) ---------- */
const ME_KEY = "seohaeON-me";

function getMe() {
  try { return JSON.parse(localStorage.getItem(ME_KEY)) || null; } catch (e) { return null; }
}

function renderMe() {
  const me = getMe();
  $("meBtn").innerHTML = me
    ? `👤 ${escapeHtml(me.no)} ${escapeHtml(me.name)} <small>바꾸기</small>`
    : "👤 내 정보 입력";
}

let afterMeSaved = null;
// 학번·이름이 없으면 먼저 입력받고, 다 되면 next() 실행
function needMe(next) {
  if (getMe()) { next(); return; }
  afterMeSaved = next;
  openMeModal();
}

function openMeModal() {
  const me = getMe() || {};
  $("meNo").value = me.no || "";
  $("meName").value = me.name || "";
  $("meMsg").textContent = "";
  openModal("meModal");
  setTimeout(() => $("meNo").focus(), 50);
}

$("meBtn").onclick = () => {
  if (!$("teacherView").hidden) return; // 선생님 화면에서는 안 써요
  afterMeSaved = null;
  openMeModal();
};

// 학번·이름 확인. 틀리면 안내 문구, 맞으면 null
function checkMe(no, name) {
  if (!/^[1-3][0-9]{4}$/.test(no)) return "학번 5자리를 적어 주세요. 예) 1학년 3반 5번 → 10305";
  if (name.length < 2) return "이름을 적어 주세요.";
  return null;
}
function saveMe(no, name) {
  try { localStorage.setItem(ME_KEY, JSON.stringify({ no, name })); } catch (e) {}
  renderMe();
}

$("meSave").onclick = () => {
  const no = $("meNo").value.trim();
  const name = $("meName").value.trim();
  const problem = checkMe(no, name);
  if (problem) { $("meMsg").textContent = problem; return; }
  saveMe(no, name);
  closeModal($("meModal"));
  showToast("내 정보를 저장했어요");
  const next = afterMeSaved; afterMeSaved = null;
  if (next) next();
};
$("meName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("meSave").click(); });


/* ---------- 2. 실시간 현황 ---------- */
let lastUpdate = 0;

function waitingList() {
  return STUDENT.todayResv
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.slot - b.slot || a.createdAt - b.createdAt);
}

function renderStatusBoard() {
  const st = STUDENT.status;
  if (st) {
    const info = TEACHER_STATES[st.state] || TEACHER_STATES.in;
    const el = $("teacher");
    el.className = "stat-value teacher " + info.cls;
    el.innerHTML = `<span class="dot"></span>${info.text}`;

    const lines = [];
    if (st.memo) lines.push(`<b>💬 선생님 메모:</b> ${escapeHtml(st.memo)}`);
    if (st.state !== "in") lines.push("💡 급하지 않으면 아래 <b>응급처치 영상</b>을 먼저 보거나 예약해 두세요.");
    $("teacherMemo").innerHTML = lines.join("<br>");
    $("teacherMemo").hidden = lines.length === 0;

    const free = DB.freeBeds(st);
    $("beds").textContent = free;
    $("bedFreeInModal").textContent = free;
  }
  $("bedsTotal").textContent = APP_CONFIG.totalBeds;
  const waiting = waitingList().length;
  $("waiting").textContent = waiting;
  $("waitTime").textContent = waiting * 5; // 한 명당 약 5분이라고 가정
}

setInterval(() => {
  if (!lastUpdate) return;
  const sec = Math.floor((Date.now() - lastUpdate) / 1000);
  $("updated").textContent = sec < 5 ? "방금 업데이트" : sec < 60 ? `${sec}초 전 업데이트` : `${Math.floor(sec / 60)}분 전 업데이트`;
}, 1000);

function renderQueue() {
  const list = waitingList();
  $("queueList").innerHTML = list.length
    ? list.map((r, i) => {
        const mine = r.uid === DB.uid;
        return `<li class="${mine ? "me-row" : ""}"><span><b>${i + 1}번</b> &nbsp;${SLOTS[r.slot]?.label || ""}</span>
          <span>${mine ? "👤 나" : "대기 중"}</span></li>`;
      }).join("")
    : `<li><span>오늘 기다리는 예약이 없어요 👍</span></li>`;
}


/* ---------- 3. 예약 ---------- */
let pickedSlot = null;
let pickedSymptom = null;

function myWaitingResv() {
  const mine = STUDENT.todayResv.find((r) => r.uid === DB.uid && r.status === "waiting");
  if (!mine) return null;
  const info = STUDENT.myResvInfo.find((x) => x.id === mine.id) || {};
  return { ...mine, ...info, id: mine.id, status: mine.status };
}

function renderMyResv() {
  const r = myWaitingResv();
  const box = $("myResv");
  if (!r) { box.hidden = true; return; }
  const order = waitingList().findIndex((x) => x.id === r.id) + 1;
  box.innerHTML = `<div class="bs-title">📅 오늘 내 예약</div>
    <p><b>${SLOTS[r.slot]?.label} (${SLOTS[r.slot]?.time})</b>에 보건실로 오세요. 지금 <b>${order}번째</b>예요.</p>
    ${r.symptom ? `<p class="my-symptom">증상: ${escapeHtml(r.symptom)}</p>` : ""}
    <button class="ghost-btn" data-resv="cancel">예약 취소하기</button>`;
  box.hidden = false;
}

$("myResv").onclick = (e) => {
  if (!e.target.closest('[data-resv="cancel"]')) return;
  const r = myWaitingResv();
  if (!r) return;
  showAlert({
    icon: "📅", title: "예약을 취소할까요?", text: `${SLOTS[r.slot]?.label} 예약을 취소해요.`,
    buttons: [
      { text: "예약 취소", onClick: () => DB.cancelReservation(r.id).then(() => showToast("예약을 취소했어요"), failToast) },
      { text: "그대로 둘게요", cls: "light" }
    ]
  });
};

function renderReserve() {
  pickedSlot = null;
  pickedSymptom = null;
  $("reserveForm").hidden = false;
  $("reserveDone").hidden = true;
  $("reserveBtn").disabled = true;
  $("slotList").innerHTML = SLOTS.map(
    (s, i) => `<button class="choice" data-slot="${i}">${s.label}<small>${s.time}</small></button>`).join("");
  $("symptomList").innerHTML = SYMPTOMS.map(
    (s, i) => `<button class="choice" data-symptom="${i}">${s}</button>`).join("");
  // 전에 적은 학번·이름이 있으면 미리 채워 둬요
  const me = getMe() || {};
  $("resvNo").value = me.no || "";
  $("resvName").value = me.name || "";
  $("resvMsg").textContent = "";
}

function pick(listId, btn) {
  $(listId).querySelectorAll(".choice").forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  $("reserveBtn").disabled = !(pickedSlot !== null && pickedSymptom !== null);
}

$("slotList").onclick = (e) => {
  const b = e.target.closest("[data-slot]");
  if (!b) return;
  pickedSlot = +b.dataset.slot;
  pick("slotList", b);
};

$("symptomList").onclick = (e) => {
  const b = e.target.closest("[data-symptom]");
  if (!b) return;
  pickedSymptom = +b.dataset.symptom;
  pick("symptomList", b);
};

$("reserveBtn").onclick = async () => {
  const no = $("resvNo").value.trim();
  const name = $("resvName").value.trim();
  const problem = checkMe(no, name);
  if (problem) { $("resvMsg").textContent = problem; $("resvNo").focus(); return; }
  if (myWaitingResv()) { showToast("오늘 이미 예약했어요"); return; }
  saveMe(no, name);
  const slot = SLOTS[pickedSlot];
  const symptom = SYMPTOMS[pickedSymptom];
  $("reserveBtn").disabled = true;
  try {
    await DB.createReservation({ slot: pickedSlot, studentNo: no, name, symptom });
    $("reserveSummary").innerHTML = `<b>${escapeHtml(no)} ${escapeHtml(name)}</b><br><b>${slot.label} (${slot.time})</b>에 보건실로 오세요.<br>증상: ${symptom}`;
    $("reserveForm").hidden = true;
    $("reserveDone").hidden = false;
  } catch (e) {
    $("reserveBtn").disabled = false;
    failToast(e);
  }
};


/* ---------- 4. 전자 보건확인증 (선생님이 "완료"한 오늘 방문 기록) ---------- */
function renderPass() {
  const me = getMe();
  const visits = [];
  // 예약 → 선생님이 "진료 완료"를 누른 것
  STUDENT.myResvInfo.filter((r) => r.doneAt && isToday(r.doneAt)).forEach((r) => {
    const slot = SLOTS[r.slot] || {};
    visits.push({
      at: r.doneAt, kind: "예약 진료",
      rows: [
        ["예약 시간", slot.time ? `${slot.label} (${slot.time})` : timeText(r.createdAt)],
        ["진료 완료", timeText(r.doneAt)],
        ["보건실 이용", `${slot.time || timeText(r.createdAt)} ~ ${timeText(r.doneAt)}`],
        ["내용", [r.symptom, r.treatment].filter(Boolean).join(" · ")]
      ],
      no: r.studentNo, name: r.name
    });
  });
  // 침대 사용 → 선생님이 침대를 비운 것
  STUDENT.myBeds.filter((b) => b.status === "done" && isToday(b.doneAt)).forEach((b) =>
    visits.push({
      at: b.doneAt, kind: "침대 휴식",
      rows: [
        ["보건실 이용", `${timeText(bedStartTime(b))} ~ ${timeText(b.doneAt)}`],
        ["내용", `침대 휴식 (${b.bed}번 침대)`]
      ],
      no: b.studentNo, name: b.name
    }));
  visits.sort((a, b) => b.at - a.at);

  if (!visits.length) {
    $("passBody").innerHTML = `<div class="empty pass-empty">
      <p>📭 오늘 보건실 방문 기록이 아직 없어요.</p>
      <p class="small">보건실에 다녀오면 선생님이 확인을 눌러 주고, 여기에 확인증이 생겨요.</p></div>`;
    return;
  }
  $("passBody").innerHTML = visits.map((v) => `
    <div class="pass">
      <div class="pass-top">보건실 방문 확인 · ${v.kind} <span class="pass-ok">발급 ✓</span></div>
      <dl>
        <dt>학생</dt><dd>${escapeHtml(v.no || me?.no || "")} ${escapeHtml(v.name || me?.name || "")}</dd>
        <dt>날짜</dt><dd>${new Date(v.at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</dd>
        ${v.rows.map(([k, val]) => `<dt>${k}</dt><dd>${escapeHtml(val)}</dd>`).join("")}
      </dl>
    </div>`).join("") +
    `<p class="small">교과 선생님께 이 화면을 보여 주세요. 종이 확인증은 필요 없어요.</p>`;
}


/* ---------- 5. 침대 사용 요청 ---------- */
const MIN_SYMPTOM = 5;

function myBedRequest() {
  return STUDENT.myBeds.filter((r) => isToday(r.time)).sort((a, b) => b.time - a.time)[0] || null;
}

function renderBedStatus() {
  const r = myBedRequest();
  const box = $("bedStatus");
  const cta = $("bedCta");

  if (!r || r.status === "done") {
    box.hidden = true;
    cta.hidden = false;
    return;
  }

  const symptom = `<p class="my-symptom">내가 적은 증상: ${escapeHtml(r.symptom)}</p>`;
  if (r.status === "pending") {
    box.className = "bed-status pending";
    box.innerHTML = `<div class="bs-title">⏳ 선생님이 요청을 확인하고 있어요</div>
      <p>${timeText(r.time)}에 보냈어요. 허용되면 이 화면에 바로 알려 줄게요.</p>${symptom}
      <button class="ghost-btn" data-bed="cancel">요청 취소하기</button>`;
  } else if (r.status === "approved" && isBedOverdue(r)) {
    box.className = "bed-status overdue";
    box.innerHTML = `<div class="bs-title">⏰ 침대 사용 시간이 끝났어요</div>
      <p><b>${r.bed}번 침대</b>를 정리하고 교실로 돌아가 주세요.<br>계속 아프면 보건 선생님께 말해요.</p>${symptom}`;
  } else if (r.status === "approved") {
    box.className = "bed-status approved";
    box.innerHTML = `<div class="bs-title">✅ 침대 사용이 허용됐어요!</div>
      <p><b>${r.bed}번 침대</b>를 쓰세요. 보건실로 오세요.</p>
      <p class="time-left">⏱️ <b>${timeText(bedEndTime(r))}</b>까지 쓸 수 있어요 (남은 시간 ${bedMinutesLeft(r)}분)</p>${symptom}`;
  } else if (r.status === "rejected") {
    box.className = "bed-status rejected";
    box.innerHTML = `<div class="bs-title">❌ 이번에는 침대를 쓰기 어려워요</div>
      <p>선생님 답변: <b>${escapeHtml(r.reason || "보건실로 와서 확인받아요")}</b></p>${symptom}
      <button class="big-btn" data-bed="retry">다시 요청하기</button>`;
  }
  box.hidden = false;
  cta.hidden = true;
}

function openBedModal() {
  $("symptomInput").value = "";
  updateSymptomCount();
  openModal("bedModal");
  setTimeout(() => $("symptomInput").focus(), 50);
}

function updateSymptomCount() {
  const len = $("symptomInput").value.trim().length;
  $("symptomCount").textContent =
    len < MIN_SYMPTOM ? `${MIN_SYMPTOM}글자 이상 적어 주세요 (${len} / 150)` : `좋아요! (${len} / 150)`;
  $("symptomCount").classList.toggle("ok", len >= MIN_SYMPTOM);
  $("bedSubmit").disabled = len < MIN_SYMPTOM;
}

$("bedCta").onclick = () => {
  const r = myBedRequest();
  if (r && (r.status === "pending" || r.status === "approved")) { showToast("이미 보낸 요청이 있어요"); return; }
  needMe(openBedModal);
};

$("symptomInput").addEventListener("input", updateSymptomCount);

$("bedSubmit").onclick = async () => {
  const symptom = $("symptomInput").value.trim();
  const me = getMe();
  if (symptom.length < MIN_SYMPTOM || !me) return;
  $("bedSubmit").disabled = true;
  try {
    await DB.createBedRequest({ studentNo: me.no, name: me.name, symptom });
    closeModal($("bedModal"));
    showToast("요청을 보냈어요. 선생님이 확인할 때까지 기다려 주세요.");
  } catch (e) {
    $("bedSubmit").disabled = false;
    failToast(e);
  }
};

$("bedStatus").onclick = (e) => {
  const b = e.target.closest("[data-bed]");
  if (!b) return;
  const r = myBedRequest();
  if (b.dataset.bed === "cancel" && r) DB.cancelBedRequest(r.id).then(() => showToast("요청을 취소했어요"), failToast);
  if (b.dataset.bed === "retry") needMe(openBedModal);
};

// 선생님이 허용/거부하면 알려 줘요
let lastBedState = null;
function noticeBedChange() {
  const r = myBedRequest();
  const now = r ? `${r.id}:${r.status}` : "";
  if (lastBedState !== null && r && lastBedState === `${r.id}:pending`) {
    if (r.status === "approved") showToast(`✅ 침대 사용이 허용됐어요! ${r.bed}번 침대로 가세요`);
    if (r.status === "rejected") showToast("선생님이 답변을 보냈어요");
  }
  lastBedState = now;
}

// 허용된 지 정해진 시간이 지나면 "침대에서 나와요" 알림 (한 번만)
function checkStudentBedTime() {
  if ($("studentView").hidden || !$("alertModal").hidden) return;
  const r = myBedRequest();
  if (!r || !isBedOverdue(r) || r.studentAlerted) return;
  DB.markStudentAlerted(r.id).catch(() => {});
  showAlert({
    icon: "⏰",
    title: "침대 사용 시간이 끝났어요",
    text: `<b>${r.bed}번 침대</b>를 쓴 지 ${BED_LIMIT_MIN}분이 지났어요.<br>침대를 정리하고 교실로 돌아가 주세요.<br><small>계속 아프면 보건 선생님께 말해요.</small>`,
    buttons: [{ text: "알겠어요" }]
  });
}


/* ---------- 6. 버튼 연결 ---------- */
document.querySelector(".features").onclick = (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  if (action === "status") { renderQueue(); openModal("statusModal"); }
  if (action === "reserve") {
    if (myWaitingResv()) { showToast("오늘 이미 예약했어요. 아래에서 확인하세요"); $("myResv").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    renderReserve(); openModal("reserveModal");
  }
  if (action === "video") { $("videos").scrollIntoView({ behavior: "smooth" }); }
  if (action === "pass") { renderPass(); openModal("passModal"); }
};

// ✕ 버튼, 확인 버튼, 바깥 어두운 곳을 누르면 닫혀요
document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-close]")) closeModal(m);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal:not([hidden])").forEach(closeModal);
});


/* ---------- 7. 시작: 데이터 연결 ---------- */
function renderConn() {
  const text = DB.mode === "firebase"
    ? "🟢 온라인 연결됨 · 학생 휴대폰과 선생님 기기가 실시간으로 이어져요"
    : DB.connectError
      ? "⚠️ 인터넷(Firebase)에 연결하지 못해서 이 기기에만 저장 중이에요"
      : "⚪ 아직 Firebase 설정 전이라 이 기기에만 저장돼요 (README.md 참고)";
  document.querySelectorAll("[data-conn]").forEach((el) => (el.textContent = text));
}

renderMe();
renderStatusBoard();

APP_READY.then(() => {
  renderConn();
  DB.watchStatus((st) => { STUDENT.status = st; lastUpdate = Date.now(); renderStatusBoard(); });
  DB.watchTodayReservations((list) => {
    STUDENT.todayResv = list; lastUpdate = Date.now();
    renderStatusBoard(); renderMyResv();
    if (!$("statusModal").hidden) renderQueue();
  });
  DB.watchMyReservationInfo((list) => {
    STUDENT.myResvInfo = list; renderMyResv();
    if (!$("passModal").hidden) renderPass();
  });
  DB.watchMyBedRequests((list) => {
    STUDENT.myBeds = list;
    noticeBedChange(); renderBedStatus(); checkStudentBedTime();
    if (!$("passModal").hidden) renderPass();
  });
  // 남은 시간 표시와 시간 끝 알림은 30초마다 다시 확인해요
  setInterval(() => { renderBedStatus(); checkStudentBedTime(); }, 30000);
});
