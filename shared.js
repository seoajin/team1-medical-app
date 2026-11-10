/* =========================================================
   서해보건ON - 학생용·선생님용이 함께 쓰는 도우미
   (데이터 저장은 db.js, 설정은 config.js 에 있어요)
   ========================================================= */

// 선생님 상태 4가지
const TEACHER_STATES = {
  in:   { icon: "🟢", text: "자리에 계세요",   sub: "학생들이 바로 와도 돼요",    cls: "" },
  busy: { icon: "🟠", text: "진료 중이에요",   sub: "조금 기다려야 해요",         cls: "busy" },
  away: { icon: "🟡", text: "잠시 자리 비움", sub: "곧 돌아와요",                cls: "busy" },
  out:  { icon: "🔴", text: "오늘 안 계세요", sub: "출장·연수 등으로 안 계세요", cls: "out" }
};

// 예약 시간
const SLOTS = [
  { label: "1교시 후", time: "09:50" },
  { label: "2교시 후", time: "10:50" },
  { label: "3교시 후", time: "11:50" },
  { label: "점심시간", time: "12:40" },
  { label: "5교시 후", time: "14:20" },
  { label: "6교시 후", time: "15:20" }
];

// 예약할 때 고르는 증상
const SYMPTOMS = ["🤕 두통", "🤢 복통", "🩹 상처", "🌡️ 열이 나요", "😵 어지러워요", "💬 기타"];

/* ---------- 침대 사용 시간 (허용된 때부터 bedLimitMinutes 분) ---------- */
const BED_LIMIT_MIN = APP_CONFIG.bedLimitMinutes;
function bedStartTime(r) { return r.decidedAt || r.time; }
function bedEndTime(r) { return bedStartTime(r) + BED_LIMIT_MIN * 60 * 1000; }
function bedMinutesLeft(r) { return Math.ceil((bedEndTime(r) - Date.now()) / 60000); }
function isBedOverdue(r) { return r.status === "approved" && Date.now() >= bedEndTime(r); }

function timeText(ms) {
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function isToday(ms) { return ms && todayKey(new Date(ms)) === todayKey(); }

// 입력한 글자가 HTML로 실행되지 않게 막아요
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------- 화면 도우미 ---------- */
const $ = (id) => document.getElementById(id);

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.hidden = true;
  if (!document.querySelector(".modal:not([hidden])")) document.body.style.overflow = "";
  if (modal.id === "videoModal" && typeof stopVideo === "function") stopVideo();
}

let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

// 알림 팝업. buttons: [{ text, cls, onClick }]
function showAlert({ icon, title, text, buttons }) {
  $("alertIcon").textContent = icon;
  $("alertTitle").textContent = title;
  $("alertText").innerHTML = text;
  $("alertActions").innerHTML = buttons
    .map((b, i) => `<button class="big-btn ${b.cls || ""}" data-i="${i}">${b.text}</button>`).join("");
  $("alertActions").onclick = (e) => {
    const btn = e.target.closest("[data-i]");
    if (!btn) return;
    closeModal($("alertModal"));
    const fn = buttons[+btn.dataset.i].onClick;
    if (fn) fn();
  };
  openModal("alertModal");
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]); // 휴대폰이면 진동
}

// 저장이 실패했을 때 알려 줘요
function failToast(e) {
  console.warn(e);
  showToast("저장하지 못했어요. 인터넷 연결을 확인해 주세요.");
}
