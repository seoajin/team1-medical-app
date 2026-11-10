/* =========================================================
   서해보건ON - 설정 파일 (팀이 직접 고치는 곳은 여기뿐이에요)
   ========================================================= */

const APP_CONFIG = {
  // ① Firebase 설정값
  //    Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"에 나오는
  //    firebaseConfig 내용을 그대로 붙여 넣어 주세요. (README.md 2단계 참고)
  //    비워 두면(null) 인터넷 연결 없이 "이 기기에만" 저장돼요.
  firebase: null,
  /* 예시 모양:
  firebase: {
    apiKey: "....",
    authDomain: "....firebaseapp.com",
    projectId: "....",
    storageBucket: "....appspot.com",
    messagingSenderId: "....",
    appId: "...."
  },
  */

  // ② 선생님 로그인 이메일 (Firebase 콘솔에서 만든 선생님 계정과 똑같이)
  //    firestore.rules 파일 안의 이메일도 똑같이 바꿔 주세요.
  teacherEmail: "teacher@seohae-on.app",

  // ③ 보건실 침대 개수
  totalBeds: 4,

  // ④ 침대 한 번 쓸 수 있는 시간 (분)
  bedLimitMinutes: 60
};
