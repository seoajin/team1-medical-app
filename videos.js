/* =========================================================
   서해보건ON - 자가 응급처치 영상 + 사용법 영상
   영상 파일은 videos 폴더에 있어요.
   영상 속 단계 시간: 제목 4초 → 단계마다 7초 → 마무리 4초
   ========================================================= */

const VIDEO_INTRO = 4;
const VIDEO_STEP = 7;

const VIDEOS = [
  {
    id: "nosebleed", title: "코피가 날 때", icon: "👃", color: "#ffe3e3",
    summary: "고개를 앞으로, 콧방울 꾹!",
    steps: [
      { icon: "🪑", text: "의자에 앉아서 고개를 살짝 앞으로 숙여요.", tip: "⚠️ 고개를 뒤로 젖히면 피가 목으로 넘어가요" },
      { icon: "🤏", text: "콧방울(코의 말랑한 부분)을 엄지와 검지로 꾹 잡아요." },
      { icon: "⏱️", text: "10분 동안 손을 떼지 말고 계속 눌러요.", tip: "입으로 천천히 숨 쉬어요" },
      { icon: "🧊", text: "콧등에 차가운 수건을 대면 도움이 돼요." },
      { icon: "🙋", text: "20분이 지나도 안 멈추면 바로 선생님께 알려요." }
    ]
  },
  {
    id: "scrape", title: "넘어져서 긁혔을 때", icon: "🩹", color: "#fff1d6",
    summary: "씻고, 누르고, 덮기",
    steps: [
      { icon: "🧼", text: "먼저 비누로 내 손을 깨끗이 씻어요." },
      { icon: "🚰", text: "흐르는 물로 상처의 흙과 모래를 씻어 내요." },
      { icon: "🤲", text: "깨끗한 거즈로 상처를 살살 눌러 피를 멈춰요." },
      { icon: "🩹", text: "연고를 바르고 밴드나 거즈로 덮어요." },
      { icon: "🙋", text: "상처가 깊거나 유리 조각이 박혔으면 만지지 말고 선생님께!" }
    ]
  },
  {
    id: "sprain", title: "발목을 삐었을 때", icon: "🦶", color: "#dff3ff",
    summary: "쉬고, 차갑게, 높이",
    steps: [
      { icon: "🛑", text: "바로 멈추고 앉아요. 아픈 발로 걷지 않아요." },
      { icon: "🧊", text: "얼음주머니를 수건에 싸서 15~20분 대요.", tip: "⚠️ 얼음을 피부에 바로 대지 않아요" },
      { icon: "🎗️", text: "붕대로 너무 세지 않게 감아 붓기를 막아요." },
      { icon: "🦵", text: "의자나 쿠션 위에 발을 심장보다 높게 올려요." },
      { icon: "🙋", text: "발을 디딜 수 없을 만큼 아프면 선생님께 알려요." }
    ]
  },
  {
    id: "burn", title: "뜨거운 것에 데었을 때", icon: "🔥", color: "#ffe8dc",
    summary: "시원한 물에 오래 식히기",
    steps: [
      { icon: "🚰", text: "시원한 흐르는 물에 15~20분 동안 식혀요.", tip: "⚠️ 얼음을 직접 대지 않아요" },
      { icon: "💍", text: "붓기 전에 반지·시계를 빼요." },
      { icon: "🫧", text: "물집은 터뜨리지 말고 그대로 두어요." },
      { icon: "🩹", text: "깨끗한 거즈로 살짝 덮어요. 치약·된장은 바르지 않아요." },
      { icon: "🙋", text: "넓게 데었거나 물집이 크면 바로 선생님께!" }
    ]
  }
];

// 영상 길이 / 단계 시작 시간 계산
VIDEOS.forEach((v) => {
  v.src = `videos/${v.id}.mp4`;
  v.poster = `videos/${v.id}.jpg`;
  v.steps.forEach((s, i) => (s.at = VIDEO_INTRO + i * VIDEO_STEP));
  const sec = VIDEO_INTRO + v.steps.length * VIDEO_STEP + 4;
  v.length = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
});

/* ---------- 영상 목록 ---------- */
function renderVideoList() {
  $("videoList").innerHTML = VIDEOS.map((v, i) => `
    <button class="video-card" data-video="${i}" aria-label="${v.title} 영상 재생">
      <div class="thumb" style="background:${v.color}">
        ${v.icon}
        <span class="len">${v.length}</span>
        <span class="play">▶</span>
      </div>
      <div class="video-info"><b>${v.title}</b><span>${v.summary}</span></div>
    </button>`).join("");
}

/* ---------- 영상 플레이어 (단계 목록을 누르면 그 장면으로 이동) ---------- */
let currentVideo = null;

function openVideo(index) {
  const v = (currentVideo = VIDEOS[index]);
  $("playerTitle").textContent = "🎬 " + v.title;
  $("playerBody").innerHTML = `
    <video class="fa-video" id="faVideo" controls playsinline preload="auto" poster="${v.poster}" src="${v.src}"></video>
    <p class="video-error" id="videoError" hidden>영상을 불러오지 못했어요. 아래 순서를 보고 따라 하세요.</p>
    <ol class="chapters" id="chapters">
      ${v.steps.map((s, i) => `
        <li><button data-at="${s.at}">
          <span class="ch-no">${i + 1}</span>
          <span class="ch-icon">${s.icon}</span>
          <span class="ch-text">${s.text}${s.tip ? `<small>${s.tip}</small>` : ""}</span>
        </button></li>`).join("")}
    </ol>`;
  const video = $("faVideo");
  video.addEventListener("timeupdate", markChapter);
  video.addEventListener("error", () => ($("videoError").hidden = false));
  video.addEventListener("ended", () => showToast("영상이 끝났어요. 그래도 아프면 보건실을 예약하세요!"));
  $("chapters").onclick = (e) => {
    const b = e.target.closest("[data-at]");
    if (!b) return;
    video.currentTime = +b.dataset.at;
    video.play().catch(() => {});
  };
  openModal("videoModal");
  video.play().catch(() => {}); // 자동 재생이 막히면 재생 버튼을 누르면 돼요
}

function markChapter() {
  const v = $("faVideo");
  if (!v || !currentVideo) return; // 영상 창을 닫은 뒤에 오는 신호는 무시해요
  const t = v.currentTime;
  const items = $("chapters").querySelectorAll("li");
  currentVideo.steps.forEach((s, i) => items[i].classList.toggle("on", t >= s.at && t < s.at + VIDEO_STEP));
}

function stopVideo() {
  const v = document.querySelector("#playerBody video");
  if (v) v.pause();
  $("playerBody").innerHTML = "";
  currentVideo = null;
}

$("videoList").onclick = (e) => {
  const card = e.target.closest("[data-video]");
  if (card) openVideo(+card.dataset.video);
};

/* ---------- 맨 위 사용법 영상 ---------- */
const GUIDE_KEY = "seohaeON-guide-closed";

function renderGuide() {
  let closed = false;
  try { closed = localStorage.getItem(GUIDE_KEY) === "1"; } catch (e) {}
  const g = $("guide");
  g.hidden = false;
  g.innerHTML = closed
    ? `<button class="guide-open" data-guide="open">▶ 서해보건ON 사용법 영상 보기</button>`
    : `<div class="guide-head"><h2>▶ 서해보건ON 사용법</h2>
         <button class="ghost-btn" data-guide="close">접기</button></div>
       <video class="guide-video" controls playsinline preload="metadata"
         poster="videos/guide.jpg" src="videos/guide.mp4"></video>
       <p class="small">예약, 침대 요청, 확인증, 응급처치 영상, 선생님용 사용법을 약 1분 동안 보여 줘요.</p>`;
}

$("guide").onclick = (e) => {
  const b = e.target.closest("[data-guide]");
  if (!b) return;
  const close = b.dataset.guide === "close";
  if (close) { const v = $("guide").querySelector("video"); if (v) v.pause(); }
  try { localStorage.setItem(GUIDE_KEY, close ? "1" : "0"); } catch (err) {}
  renderGuide();
};

renderVideoList();
renderGuide();
