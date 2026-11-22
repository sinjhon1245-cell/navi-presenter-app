// 직접 제작한 예시 수업 · 수업 화면 그림 · 예시 수업 기록
// 화면 코드(index.html)와 따로 관리해요. 출판사 자료나 교과서 본문을 옮기지 않았어요.
// id는 바꾸지 않아요. 수업 기록과 편집 내용이 id로 이어져요.
(function () {
  "use strict";

  // ---------- pictures for the student screen (static SVG, shown with <img>) ----------
  const F = "Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif";
  const svg = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" font-family="' + F + '"><rect width="1600" height="900" fill="#FFFFFF"/>' +
    '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1F2A44"/></marker></defs>' + body + "</svg>";
  const t = (x, y, s, size, w, fill, anchor) => '<text x="' + x + '" y="' + y + '" font-size="' + (size || 40) + '" font-weight="' + (w || 600) + '" fill="' + (fill || "#1F2A44") + '" text-anchor="' + (anchor || "middle") + '">' + s + "</text>";
  const box = (x, y, w, h, fill, label, size) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="24" fill="' + fill + '" stroke="#1F2A44" stroke-width="4"/>' + t(x + w / 2, y + h / 2 + (size || 48) / 3, label, size || 48, 700);
  const arrow = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#1F2A44" stroke-width="6" marker-end="url(#ar)"/>';
  const dots = (pts, r, fill) => pts.map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + fill + '"/>').join("");

  const PICS = {
    "frac-equal": svg(t(800, 110, "똑같이 나눈 것만 분수로 나타내요", 60, 700) +
      '<circle cx="450" cy="470" r="230" fill="#FFFFFF" stroke="#1F2A44" stroke-width="6"/><path d="M450 470L450 240A230 230 0 0 1 680 470Z" fill="#F0B54A"/>' +
      '<line x1="220" y1="470" x2="680" y2="470" stroke="#1F2A44" stroke-width="6"/><line x1="450" y1="240" x2="450" y2="700" stroke="#1F2A44" stroke-width="6"/>' +
      '<circle cx="1150" cy="470" r="230" fill="#FFFFFF" stroke="#1F2A44" stroke-width="6"/><line x1="1060" y1="258" x2="1060" y2="682" stroke="#1F2A44" stroke-width="6"/><line x1="934" y1="560" x2="1366" y2="560" stroke="#1F2A44" stroke-width="6"/>' +
      t(450, 790, "○ 똑같이 4로 나눔", 46, 700, "#13664E") + t(450, 850, "색칠한 부분 = 4분의 1", 40, 500) +
      t(1150, 790, "✕ 크기가 다른 4조각", 46, 700, "#B4441B") + t(1150, 850, "분수로 말할 수 없어요", 40, 500)),
    "frac-parts": svg(t(800, 120, "분수를 읽고 써요", 60, 700) +
      [0, 1, 2, 3].map((i) => '<rect x="' + (100 + i * 190) + '" y="330" width="190" height="220" fill="' + (i === 0 ? "#F0B54A" : "#FFFFFF") + '" stroke="#1F2A44" stroke-width="6"/>').join("") +
      t(480, 640, "전체를 똑같이 4칸으로 나누고 1칸을 색칠했어요", 36, 500) +
      t(1060, 400, "1", 170, 700) + '<line x1="980" y1="440" x2="1140" y2="440" stroke="#1F2A44" stroke-width="10"/>' + t(1060, 610, "4", 170, 700) +
      t(1180, 350, "분자 · 색칠한 칸 수", 36, 700, "#1F4E97", "start") + t(1180, 590, "분모 · 나눈 칸 수", 36, 700, "#13664E", "start") +
      t(1060, 760, "읽기: 4분의 1", 48, 700)),
    "particles": svg(t(800, 110, "물 알갱이 사이의 거리", 60, 700) +
      '<rect x="120" y="200" width="400" height="420" rx="20" fill="#EEF4FB" stroke="#1F2A44" stroke-width="5"/>' +
      dots([0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => [190 + c * 65, 280 + r * 65])), 26, "#5B8FE6") +
      '<rect x="600" y="200" width="400" height="420" rx="20" fill="#EEF4FB" stroke="#1F2A44" stroke-width="5"/>' +
      dots([[660, 520], [720, 560], [790, 530], [860, 570], [930, 520], [690, 450], [760, 480], [835, 455], [905, 470], [720, 380], [800, 400], [880, 390], [950, 420], [650, 580], [960, 580]], 26, "#5B8FE6") +
      '<rect x="1080" y="200" width="400" height="420" rx="20" fill="#EEF4FB" stroke="#1F2A44" stroke-width="5"/>' +
      dots([[1150, 260], [1390, 300], [1260, 380], [1420, 470], [1140, 520], [1300, 570]], 26, "#5B8FE6") +
      t(320, 690, "얼음 · 고체", 50, 700) + t(320, 750, "촘촘하고 움직이지 않아요", 34, 500) +
      t(800, 690, "물 · 액체", 50, 700) + t(800, 750, "가깝지만 자리를 바꿔요", 34, 500) +
      t(1280, 690, "수증기 · 기체", 50, 700) + t(1280, 750, "멀리 떨어져 날아다녀요", 34, 500)),
    "bubble": svg(t(800, 100, "거품 속에는 무엇이 있을까요?", 60, 700) +
      '<path d="M260 330H860V760Q860 800 820 800H300Q260 800 260 760Z" fill="#DCEBFB" stroke="#1F2A44" stroke-width="6"/>' +
      '<rect x="230" y="300" width="660" height="40" rx="12" fill="#5B6575"/>' +
      '<circle cx="420" cy="700" r="34" fill="#FFFFFF" stroke="#1F4E97" stroke-width="5"/><circle cx="560" cy="610" r="44" fill="#FFFFFF" stroke="#1F4E97" stroke-width="5"/>' +
      '<circle cx="700" cy="690" r="28" fill="#FFFFFF" stroke="#1F4E97" stroke-width="5"/><circle cx="640" cy="470" r="52" fill="#FFFFFF" stroke="#1F4E97" stroke-width="5"/>' +
      '<line x1="690" y1="450" x2="1010" y2="380" stroke="#1F2A44" stroke-width="4" stroke-dasharray="14 10"/>' +
      '<circle cx="1200" cy="420" r="210" fill="#FFFFFF" stroke="#1F4E97" stroke-width="8"/>' + dots([[1110, 340], [1290, 360], [1180, 470], [1300, 520], [1100, 520]], 22, "#5B8FE6") +
      t(1200, 690, "거품 안 = 수증기", 56, 700, "#1F4E97") + t(1200, 760, "물이 기체로 변한 것이에요", 38, 500) + t(560, 860, "물을 끓이는 냄비", 36, 500)),
    "food-chain": svg(t(800, 110, "먹이 사슬", 64, 700) +
      box(90, 360, 280, 150, "#E2F5EE", "벼") + box(490, 360, 280, 150, "#FFF3DC", "메뚜기") + box(890, 360, 280, 150, "#FFF3DC", "개구리") + box(1290, 360, 260, 150, "#FBE5DB", "뱀") +
      arrow(380, 435, 480, 435) + arrow(780, 435, 880, 435) + arrow(1180, 435, 1280, 435) +
      t(230, 580, "생산자", 38, 600, "#13664E") + t(630, 580, "1차 소비자", 38, 600) + t(1030, 580, "2차 소비자", 38, 600) + t(1420, 580, "3차 소비자", 38, 600) +
      t(800, 760, "화살표는 먹이에서 먹는 생물 쪽으로 그려요", 44, 700, "#1F4E97")),
    "food-web": svg(t(800, 70, "먹이 그물", 56, 700) +
      [["매", 800, 150], ["뱀", 520, 360], ["여우", 1090, 360], ["개구리", 250, 360], ["메뚜기", 250, 580], ["쥐", 800, 580], ["토끼", 1350, 580], ["벼", 450, 800], ["풀", 1150, 800]]
        .map((n) => box(n[1] - 120, n[2] - 55, 240, 110, n[0] === "벼" || n[0] === "풀" ? "#E2F5EE" : "#FFF3DC", n[0], 44)).join("") +
      [[450, 745, 280, 635], [450, 745, 760, 635], [1150, 745, 300, 635], [1150, 745, 840, 635], [1150, 745, 1330, 635], [250, 525, 250, 415], [330, 360, 400, 360],
        [760, 525, 560, 415], [840, 525, 1060, 415], [1330, 525, 1130, 415], [560, 305, 740, 205], [800, 525, 800, 205]].map((a) => arrow(a[0], a[1], a[2], a[3])).join("") +
      t(60, 80, "화살표: 먹이 → 먹는 생물", 32, 600, "#1F4E97", "start")),
    "cardnews": svg(t(800, 90, "예시 카드뉴스 (수업용으로 만든 것)", 48, 700) +
      '<rect x="110" y="150" width="420" height="640" rx="28" fill="#FFF3DC" stroke="#1F2A44" stroke-width="5"/>' +
      '<rect x="590" y="150" width="420" height="640" rx="28" fill="#E7EEFB" stroke="#1F2A44" stroke-width="5"/>' +
      '<rect x="1070" y="150" width="420" height="640" rx="28" fill="#F3F4F8" stroke="#1F2A44" stroke-width="5"/>' +
      t(320, 240, "주장", 40, 700, "#855409") + t(320, 420, "아침밥,", 64, 800) + t(320, 510, "꼭 먹어요!", 64, 800) +
      t(800, 240, "근거 1", 40, 700, "#1F4E97") + t(800, 380, "우리 반 28명 중", 40, 600) + t(800, 440, "20명이", 40, 600) + t(800, 500, "‘아침을 먹은 날", 40, 600) + t(800, 560, "덜 피곤했어요’", 40, 600) +
      t(800, 720, "출처 · 우리 반 설문", 32, 500, "#5B6575") +
      t(1280, 240, "근거 2", 40, 700, "#5B6575") + t(1280, 420, "누구나", 46, 700) + t(1280, 490, "아는 사실이에요!", 42, 700) + t(1280, 720, "출처 · 없음", 32, 500, "#B4441B")),
    "flow-umbrella": svg(t(800, 70, "우산 챙기기 알고리즘", 54, 700) +
      '<ellipse cx="600" cy="150" rx="150" ry="55" fill="#E2F5EE" stroke="#1F2A44" stroke-width="5"/>' + t(600, 165, "시작", 40, 700) +
      '<rect x="420" y="250" width="360" height="100" rx="12" fill="#FFFFFF" stroke="#1F2A44" stroke-width="5"/>' + t(600, 315, "창밖을 본다", 40, 600) +
      '<path d="M600 420L800 510L600 600L400 510Z" fill="#FFF3DC" stroke="#1F2A44" stroke-width="5"/>' + t(600, 525, "비가 오나요?", 38, 700) +
      '<rect x="1000" y="460" width="380" height="100" rx="12" fill="#FFFFFF" stroke="#1F2A44" stroke-width="5"/>' + t(1190, 525, "우산을 챙긴다", 40, 600) +
      '<ellipse cx="600" cy="790" rx="150" ry="55" fill="#E2F5EE" stroke="#1F2A44" stroke-width="5"/>' + t(600, 805, "끝", 40, 700) +
      arrow(600, 205, 600, 245) + arrow(600, 350, 600, 415) + arrow(800, 510, 995, 510) + arrow(600, 600, 600, 730) +
      '<path d="M1190 560V790H760" fill="none" stroke="#1F2A44" stroke-width="6" marker-end="url(#ar)"/>' +
      t(900, 490, "예", 36, 700, "#13664E") + t(640, 670, "아니요", 36, 700, "#B4441B", "start"))
  };

  // ---------- lessons ----------
  // page: { id, stage, label, layout, eye, title, sub?, rows?, choices?, items?, defs?, min, concepts, say, notes }
  // res (수업 자료): { id, scene, t: 보충|영상|활동|발문|평가, lv: red|yellow|green (어떤 신호에 맞는 자료인지), title, note, card? }
  //   card는 수업 화면에 보여 줄 내용이에요. { pic } 또는 슬라이드와 같은 { layout, title, items … }
  const LESSONS = [
    {
      id: "ex-m3-fraction", grade: 3, subject: "수학", unit: "분수", period: "1차시", total: 38,
      title: "분수를 그림으로 나타내 볼까요?",
      pages: [
        { id: "s1", stage: "도입", label: "표지", layout: "cover", min: 1, concepts: ["똑같이 나누기"],
          say: ["오늘은 똑같이 나눈 것 중의 얼마를 수로 나타내 볼 거예요.", "피자 한 판을 네 명이 똑같이 나눠 먹는다고 생각해 볼까요?"], notes: "" },
        { id: "s2", stage: "도입", label: "생각 열기", layout: "question", eye: "생각 열기", title: "피자를 네 명이 나눠 먹으면 한 사람은 얼마를 먹을까?", sub: "짝과 30초 동안 이야기해 보세요.", min: 4,
          concepts: ["나누어 먹기"], say: ["한 사람이 먹는 양을 어떻게 말하면 좋을까요?", "똑같이 나누지 않으면 어떤 일이 생길까요?"],
          notes: "‘반의 반’ 같은 학생 말을 칠판에 남겨 두면 분수와 이어 말할 수 있어요." },
        { id: "s3", stage: "전개", label: "똑같이 나누기", layout: "choices", eye: "확인", title: "똑같이 나눈 것은 어느 것일까요?", choices: ["① 크기가 다른 4조각", "② 크기가 같은 4조각", "③ 크기가 같은 3조각"], min: 6,
          concepts: ["똑같이 나누기", "부분과 전체"], say: ["네 조각으로 나눈 것 중에서 똑같이 나눈 것을 골라 볼까요?", "왜 그렇게 생각했는지 말해 볼까요?"],
          notes: "정답은 ②. 조각 수만 세는 학생에게는 조각끼리 크기를 겹쳐 비교하게 해요." },
        { id: "s4", stage: "전개", label: "분모와 분자", layout: "defs", eye: "알아보기", title: "분수를 읽고 써요", min: 7,
          defs: [["분모", "전체를 똑같이 나눈 수 · 아래에 써요"], ["분자", "그중 색칠한 수 · 위에 써요"], ["읽기", "1/4 → 4분의 1"]],
          concepts: ["분모", "분자"], say: ["4분의 1에서 아래에 있는 4는 무엇을 나타낼까요?", "위에 있는 1은 무엇을 나타낼까요?"],
          notes: "분모·분자를 손으로 아래·위를 가리키며 함께 말하게 해요." },
        { id: "s5", stage: "전개", label: "색칠하고 쓰기", layout: "list", eye: "함께 해 보기", title: "색칠하고 분수로 써 봐요", min: 10,
          items: ["원을 똑같이 4로 나누고 1만큼 색칠하기", "직사각형을 3으로 나누고 2만큼 색칠하기", "색칠한 부분을 분수로 쓰고 읽기"],
          concepts: ["색칠한 부분", "전체"], say: ["색칠한 부분은 전체를 똑같이 몇으로 나눈 것 중의 몇일까요?", "짝과 바꿔서 분수로 읽어 볼까요?"],
          notes: "모눈 활동지를 쓰면 똑같이 나누기가 쉬워요." },
        { id: "s6", stage: "전개", label: "생활 속 분수", layout: "table2", eye: "우리 생활에서", title: "생활에서 분수를 찾아볼까요?", min: 6,
          rows: [["케이크 8조각 중 3조각", "8분의 3"], ["색종이를 반으로 접은 한쪽", "2분의 1"], ["초콜릿 6칸 중 5칸", "6분의 5"]],
          concepts: ["생활 속 분수"], say: ["우리 생활에서 똑같이 나누는 때는 언제일까요?", "이 케이크 조각은 분수로 어떻게 말할까요?"], notes: "" },
        { id: "s7", stage: "정리", label: "오늘의 한 문장", layout: "question", eye: "오늘의 한 문장", title: "분수는 무엇을 나타낼까요? 한 문장으로 말해 볼까요?", sub: "다음 시간 · 분수의 크기 비교하기", min: 4,
          concepts: ["분수의 뜻"], say: ["오늘 배운 분수를 한 문장으로 말해 볼까요?", "다음 시간에는 어느 분수가 더 큰지 알아봐요."], notes: "두세 명만 발표하고 마쳐요." }
      ],
      res: [
        { id: "m3-a", scene: "s3", t: "보충", lv: "red", title: "똑같이 나눈 원과 아닌 원", note: "개념 그림", card: { pic: "frac-equal" } },
        { id: "m3-b", scene: "s3", t: "평가", lv: "red", title: "조각 수만 세면 될까요?", note: "오개념 확인",
          card: { layout: "choices", eye: "다시 생각해요", title: "크기가 다른 4조각 중 1조각도 4분의 1일까요?", choices: ["① 네", "② 아니요", "③ 잘 모르겠어요"] } },
        { id: "m3-c", scene: "s4", t: "보충", lv: "red", title: "분모와 분자 그림", note: "개념 그림", card: { pic: "frac-parts" } },
        { id: "m3-d", scene: "s4", t: "발문", lv: "yellow", title: "3분의 2에서 분모와 분자는 각각 무엇일까요?", note: "확인 질문" },
        { id: "m3-e", scene: "s5", t: "활동", lv: "yellow", title: "한 문제 더: 6으로 나누고 1만큼", note: "추가 예시",
          card: { layout: "list", eye: "한 문제 더", title: "색칠하고 분수로 써요", items: ["직사각형을 똑같이 6으로 나누기", "1만큼 색칠하기", "분수로 쓰고 읽기"] } },
        { id: "m3-f", scene: "s5", t: "활동", lv: "green", title: "4분의 3과 8분의 6 그려 비교하기", note: "심화",
          card: { layout: "list", eye: "더 해 볼까요?", title: "두 분수를 그려 비교해요", items: ["원을 4로 나누고 3만큼 색칠하기", "원을 8로 나누고 6만큼 색칠하기", "두 그림에서 무엇을 알 수 있나요?"] } },
        { id: "m3-g", scene: "s6", t: "활동", lv: "green", title: "교실에서 분수 찾기", note: "적용 활동 · 3분" }
      ]
    },
    {
      id: "ex-s4-boiling", oldKeys: ["vivasam-sci4-water-3"], grade: 4, subject: "과학", unit: "물의 상태 변화", period: "3차시", total: 38,
      title: "물이 끓을 때 어떤 변화가 생길까?",
      pages: [
        { id: "s1", stage: "도입", label: "표지", layout: "cover", min: 1,
          concepts: ["물의 상태 변화", "끓음"], say: ["오늘은 물이 끓을 때 어떤 일이 생기는지 알아볼 거예요.", "다 같이 오늘의 질문을 읽어 볼까요?"], notes: "" },
        { id: "s2", stage: "도입", label: "도입 발문", layout: "question", eye: "생각 열기", title: "주전자 물은 끓으면 어디로 갈까?", sub: "짝과 30초 동안 이야기해 보세요.", min: 4,
          concepts: ["수증기"], say: ["주전자 물을 오래 끓이면 물이 줄어 있던 적 있나요?", "그 물은 어디로 갔을까요? 짝과 30초 이야기해 보세요."],
          notes: "답을 바로 정리하지 말고 \"없어진다\"는 답도 칠판에 남겨 두면 뒤에서 다시 써요." },
        { id: "s3", stage: "전개", label: "세 가지 상태", layout: "table", eye: "떠올리기", title: "물은 세 가지 모습으로 있어요", min: 5,
          rows: [["고체", "얼음", "모양이 일정해요"], ["액체", "물", "그릇에 따라 모양이 바뀌어요"], ["기체", "수증기", "눈에 보이지 않고 공기 중으로 퍼져요"]],
          concepts: ["고체", "액체", "기체"], say: ["물은 얼음, 물, 수증기 세 가지 모습으로 있어요.", "이 중에서 눈에 보이지 않는 것은 무엇일까요?"],
          notes: "뒤의 '김' 이야기와 이어지니 수증기는 보이지 않는다는 점을 꼭 짚어요." },
        { id: "s4", stage: "전개", label: "확인 문제", layout: "choices", eye: "확인", title: "물이 끓을 때 바닥에서 생기는 거품은 무엇일까?", choices: ["① 공기", "② 수증기", "③ 물"], min: 5,
          concepts: ["기포 속은 수증기"], say: ["거품 안에 무엇이 들어 있을지 손을 들어 골라 볼까요?", "②를 고른 친구는 왜 그렇게 생각했어요?"],
          notes: "정답은 ② 수증기. '공기'가 많으면 수업 자료의 거품 그림을 띄워요." },
        { id: "s7", stage: "전개", label: "관찰 실험", layout: "list", eye: "함께 관찰", title: "물을 끓이며 관찰해요", min: 12,
          items: ["바닥에서 생기는 기포의 크기와 수", "주전자 입구 근처에 보이는 김", "끓이기 전과 후의 물 높이"],
          concepts: ["기포", "김", "물의 높이"], say: ["바닥에서 기포가 어떻게 생기는지 잘 보세요.", "김은 수증기일까요, 작은 물방울일까요?"],
          notes: "가열 기구 1m 안으로 들어오지 않게 해요. 김은 수증기가 식어 생긴 작은 물방울이에요." },
        { id: "s8", stage: "전개", label: "증발과 끓음", layout: "defs", eye: "정리", title: "증발과 끓음", min: 5,
          defs: [["증발", "물의 표면에서 물이 수증기로 변하는 현상"], ["끓음", "물의 표면과 속에서 물이 수증기로 변하는 현상"]],
          concepts: ["증발", "끓음"], say: ["증발은 물의 표면에서, 끓음은 표면과 속에서 일어나요.", "두 가지의 다른 점을 짝에게 한 문장으로 말해 볼까요?"],
          notes: "차이가 '속에서도'라는 점을 학생 말로 다시 말하게 해요." },
        { id: "s9", stage: "정리", label: "생활 속 예", layout: "table2", eye: "우리 생활에서", title: "어디에서 본 적 있나요?", min: 4,
          rows: [["빨래가 마른다", "증발"], ["라면 물이 보글보글 끓는다", "끓음"], ["찬 컵 겉에 물방울이 맺힌다", "다음 시간 · 응결"]],
          concepts: ["증발", "끓음"], say: ["빨래가 마르는 건 증발일까요, 끓음일까요?", "찬 컵의 물방울은 다음 시간에 알아봐요."], notes: "" },
        { id: "s10", stage: "정리", label: "마무리", layout: "question", eye: "오늘의 한 문장", title: "오늘 새로 알게 된 것을 한 문장으로 써 볼까요?", sub: "다음 시간 · 차가운 컵 겉의 물방울은 어디에서 왔을까?", min: 2,
          concepts: ["오늘의 한 문장"], say: ["오늘 새로 알게 된 것을 한 문장으로 써 볼까요?", "다음 시간에는 차가운 컵 겉의 물방울을 알아봐요."], notes: "두세 명만 발표하고 마쳐요." }
      ],
      res: [
        { id: "r1", scene: "s2", t: "발문", lv: "yellow", title: "수증기는 눈에 보일까? 어떻게 알 수 있을까?", note: "확인 질문" },
        { id: "r3", scene: "s3", t: "보충", lv: "red", title: "입자 그림 카드", note: "개념 그림 · 알갱이 사이의 거리", card: { pic: "particles" } },
        { id: "r4", scene: "s3", t: "활동", lv: "yellow", title: "상태 분류 카드 짝 활동", note: "짧은 활동 · 5분",
          card: { layout: "table2", eye: "짝 활동", title: "어느 상태일까요?", rows: [["고드름", "고체"], ["바다", "액체"], ["목욕탕 안의 따뜻한 공기 속 물", "기체"]] } },
        { id: "r5", scene: "s3", t: "활동", lv: "green", title: "몸으로 표현하는 입자 놀이", note: "적용 활동" },
        { id: "r9", scene: "s4", t: "발문", lv: "red", title: "물속에 공기가 그렇게 많이 있었을까?", note: "오개념 확인 · '공기'라고 답한 학생에게" },
        { id: "r7", scene: "s4", t: "보충", lv: "red", title: "거품 속 들여다보기 그림", note: "개념 그림", card: { pic: "bubble" } },
        { id: "ra", scene: "s4", t: "활동", lv: "green", title: "증발과 끓음 비교표 먼저 보기", note: "다 맞힌 반이라면",
          card: { layout: "table", eye: "먼저 보기", title: "증발과 끓음을 비교해요", rows: [["", "증발", "끓음"], ["어디에서", "물의 표면", "표면과 속"], ["언제", "언제나 천천히", "끓는 온도에서 빠르게"]] } },
        { id: "r11", scene: "s7", t: "발문", lv: "yellow", title: "기포는 어디에서부터 생길까?", note: "확인 질문" },
        { id: "r16", scene: "s7", t: "발문", lv: "green", title: "김은 왜 주전자 입구에서 조금 떨어져서 보일까?", note: "심화 질문" },
        { id: "r14", scene: "s8", t: "발문", lv: "yellow", title: "끓이지 않아도 물이 줄어드는 때는 언제일까?", note: "확인 질문" },
        { id: "r13", scene: "s9", t: "활동", lv: "green", title: "젖은 손수건 두 장, 어느 쪽이 먼저 마를까?", note: "확장 과제" },
        { id: "rc", scene: "", t: "보충", lv: "yellow", title: "다음 차시 예고: 차가운 컵 겉의 물방울", note: "보관함",
          card: { layout: "question", eye: "다음 시간", title: "차가운 컵 겉의 물방울은 어디에서 왔을까?", sub: "집에서 찬물 컵을 관찰해 보세요." } }
      ]
    },
    {
      id: "ex-s5-ecosystem", grade: 5, subject: "과학", unit: "생물과 환경", period: "2차시", total: 38,
      title: "생물들은 서로 어떤 관계일까?",
      pages: [
        { id: "s1", stage: "도입", label: "표지", layout: "cover", min: 1, concepts: ["생태계"],
          say: ["오늘은 생물들이 먹고 먹히는 관계를 알아볼 거예요.", "오늘 아침에 먹은 음식이 어디에서 왔는지 떠올려 볼까요?"], notes: "" },
        { id: "s2", stage: "도입", label: "생각 열기", layout: "question", eye: "생각 열기", title: "논에서 벼가 모두 사라지면 메뚜기와 개구리는 어떻게 될까?", sub: "모둠에서 1분 동안 이야기해 보세요.", min: 4,
          concepts: ["생물 사이의 관계"], say: ["벼가 사라지면 가장 먼저 곤란해지는 생물은 누구일까요?", "그다음에는 어떤 생물이 곤란해질까요?"],
          notes: "정답을 바로 말하지 말고 모둠 예상을 칠판에 남겨요. 마지막 장면에서 다시 봐요." },
        { id: "s3", stage: "전개", label: "생산자·소비자·분해자", layout: "defs", eye: "알아보기", title: "생물은 하는 일에 따라 나눌 수 있어요", min: 7,
          defs: [["생산자", "햇빛으로 스스로 양분을 만들어요 · 벼, 풀"], ["소비자", "다른 생물을 먹어 양분을 얻어요 · 메뚜기, 개구리"], ["분해자", "죽은 생물이나 배설물을 작게 나눠요 · 곰팡이, 세균"]],
          concepts: ["생산자", "소비자", "분해자"], say: ["스스로 양분을 만드는 생물은 무엇이라고 할까요?", "분해자가 없다면 숲은 어떻게 될까요?"],
          notes: "버섯을 식물로 생각하는 학생이 많아요. 분해자라는 점을 짚어요." },
        { id: "s4", stage: "전개", label: "먹이 사슬", layout: "list", eye: "이어 보기", title: "먹이 사슬을 이어 봐요", min: 7,
          items: ["벼 → 메뚜기 → 개구리 → 뱀", "풀 → 토끼 → 여우", "화살표는 먹이에서 먹는 생물 쪽으로"],
          concepts: ["먹이 사슬"], say: ["화살표는 어느 쪽으로 그려야 할까요?", "메뚜기는 무엇을 먹고, 누구에게 먹힐까요?"],
          notes: "화살표를 거꾸로 그리는 학생이 많아요. ‘먹이가 간다’고 말해 줘요." },
        { id: "s5", stage: "전개", label: "먹이 그물", layout: "question", eye: "넓혀 보기", title: "먹이 사슬이 얽히면 먹이 그물이 돼요", sub: "한 생물이 여러 생물을 먹고, 여러 생물에게 먹혀요.", min: 8,
          concepts: ["먹이 그물"], say: ["개구리는 메뚜기만 먹을까요?", "먹이 그물이 먹이 사슬보다 생태계를 더 튼튼하게 하는 까닭은 무엇일까요?"],
          notes: "먹이 그물 그림을 띄우고 한 생물을 손으로 가리며 ‘사라지면?’을 물어요." },
        { id: "s6", stage: "전개", label: "만약에", layout: "choices", eye: "확인", title: "메뚜기가 갑자기 많아지면 먼저 어떻게 될까?", choices: ["① 벼가 줄어요", "② 개구리가 줄어요", "③ 아무 변화 없어요"], min: 6,
          concepts: ["생태계 평형"], say: ["메뚜기가 많아지면 먼저 무엇이 줄어들까요?", "시간이 지나면 개구리 수는 어떻게 될까요?"],
          notes: "정답은 ①. 그다음 개구리가 늘었다가 다시 균형을 찾는 흐름까지 짚어요." },
        { id: "s7", stage: "정리", label: "오늘의 한 문장", layout: "question", eye: "오늘의 한 문장", title: "생물들이 서로 이어져 있다는 것을 한 문장으로 말해 볼까요?", sub: "다음 시간 · 생태계 평형이 깨지는 까닭", min: 5,
          concepts: ["먹이 관계"], say: ["처음에 모둠에서 예상한 답을 다시 볼까요?", "오늘 배운 낱말을 넣어 한 문장으로 말해 볼까요?"], notes: "도입의 예상과 비교하며 마쳐요." }
      ],
      res: [
        { id: "e5-a", scene: "s4", t: "보충", lv: "red", title: "먹이 사슬 그림", note: "개념 그림 · 화살표 방향", card: { pic: "food-chain" } },
        { id: "e5-b", scene: "s4", t: "평가", lv: "red", title: "화살표 방향 다시 보기", note: "오개념 확인",
          card: { layout: "choices", eye: "다시 생각해요", title: "‘메뚜기 → 벼’라고 그리면 맞을까요?", choices: ["① 맞아요", "② 틀려요 · 벼 → 메뚜기", "③ 둘 다 괜찮아요"] } },
        { id: "e5-c", scene: "s5", t: "보충", lv: "yellow", title: "먹이 그물 그림", note: "추가 예시", card: { pic: "food-web" } },
        { id: "e5-d", scene: "s5", t: "발문", lv: "yellow", title: "쥐가 사라지면 뱀과 매는 어떻게 될까요?", note: "확인 질문" },
        { id: "e5-e", scene: "s3", t: "발문", lv: "red", title: "버섯은 생산자일까요, 분해자일까요?", note: "오개념 확인" },
        { id: "e5-f", scene: "s6", t: "활동", lv: "green", title: "우리 학교 화단 먹이 그물 그리기", note: "확장 과제",
          card: { layout: "list", eye: "더 해 볼까요?", title: "우리 학교 화단 먹이 그물", items: ["화단에서 본 생물 3가지 이상 적기", "먹이 관계를 화살표로 잇기", "한 생물이 사라지면 어떻게 될지 쓰기"] } }
      ]
    },
    {
      id: "ex-k6-cardnews", grade: 6, subject: "국어", unit: "주장과 근거", period: "4차시", total: 38,
      title: "카드뉴스의 주장과 근거를 따져 볼까요?",
      pages: [
        { id: "s1", stage: "도입", label: "표지", layout: "cover", min: 1, concepts: ["주장", "근거"],
          say: ["오늘은 카드뉴스를 읽고 주장과 근거가 알맞은지 따져 볼 거예요.", "요즘 본 카드뉴스나 광고가 있었나요?"], notes: "" },
        { id: "s2", stage: "도입", label: "생각 열기", layout: "question", eye: "생각 열기", title: "카드뉴스를 보고 바로 믿어도 될까?", sub: "믿었다가 아니었던 경험을 떠올려 보세요.", min: 4,
          concepts: ["비판하며 읽기"], say: ["카드뉴스를 믿기 전에 무엇을 확인하면 좋을까요?", "짝과 한 가지씩 말해 볼까요?"],
          notes: "학생 경험을 들을 때 친구 이름이나 실제 계정은 말하지 않게 해요." },
        { id: "s3", stage: "전개", label: "주장·근거·출처", layout: "defs", eye: "알아보기", title: "주장과 근거를 나눠 봐요", min: 6,
          defs: [["주장", "글쓴이가 말하고 싶은 생각"], ["근거", "주장을 믿을 수 있게 하는 까닭이나 자료"], ["출처", "근거를 어디에서 가져왔는지"]],
          concepts: ["주장", "근거", "출처"], say: ["주장은 무엇이고, 근거는 무엇일까요?", "근거에 출처가 있으면 무엇이 좋을까요?"], notes: "" },
        { id: "s4", stage: "전개", label: "예시 카드뉴스", layout: "list", eye: "읽어 보기", title: "카드뉴스: 아침밥, 꼭 먹어요!", min: 8,
          items: ["주장 · 아침밥을 먹으면 공부에 도움이 돼요", "근거 1 · 우리 반 28명 중 20명이 아침을 먹은 날 덜 피곤했다고 답했어요", "근거 2 · ‘누구나 아는 사실’이라고만 적혀 있어요"],
          concepts: ["카드뉴스 읽기"], say: ["이 카드뉴스의 주장은 무엇일까요?", "근거 1과 근거 2 중 어느 쪽이 더 믿을 만할까요?"],
          notes: "수업용으로 직접 만든 카드뉴스예요. 수업 자료의 카드뉴스 그림을 띄워 함께 읽어요." },
        { id: "s5", stage: "전개", label: "판단 기준", layout: "table", eye: "기준 세우기", title: "근거를 판단하는 세 가지 기준", min: 7,
          rows: [["관련", "주장과 이어지나요?", "아침밥 ↔ 공부"], ["믿을 만함", "출처가 있나요?", "우리 반 설문"], ["충분함", "근거가 한 가지뿐인가요?", "근거 2는 약해요"]],
          concepts: ["관련성", "신뢰성", "충분성"], say: ["근거가 주장과 이어지는지 먼저 확인해 볼까요?", "출처가 없는 근거는 왜 믿기 어려울까요?"], notes: "" },
        { id: "s6", stage: "전개", label: "골라 보기", layout: "choices", eye: "확인", title: "더 믿을 만한 근거는 어느 것일까요?", choices: ["① 누구나 아는 사실이에요", "② 우리 반 28명 중 20명이 그렇게 답했어요", "③ 내 생각에는 그래요"], min: 6,
          concepts: ["믿을 만한 근거"], say: ["세 가지 중에서 가장 믿을 만한 근거를 골라 볼까요?", "고른 까닭을 기준을 넣어 말해 볼까요?"],
          notes: "정답은 ②. ‘우리 반 28명은 적지 않을까?’까지 나오면 충분함 기준으로 이어 가요." },
        { id: "s7", stage: "정리", label: "오늘의 한 문장", layout: "question", eye: "오늘의 한 문장", title: "카드뉴스를 볼 때 무엇을 먼저 확인할까요?", sub: "다음 시간 · 근거를 넣어 카드뉴스 만들기", min: 6,
          concepts: ["비판하며 읽기"], say: ["오늘 세운 기준 중에서 가장 먼저 확인할 것을 한 문장으로 말해 볼까요?", "다음 시간에는 우리가 직접 카드뉴스를 만들어요."], notes: "" }
      ],
      res: [
        { id: "k6-a", scene: "s4", t: "보충", lv: "red", title: "예시 카드뉴스 그림", note: "수업용으로 만든 카드뉴스", card: { pic: "cardnews" } },
        { id: "k6-b", scene: "s3", t: "보충", lv: "red", title: "주장과 근거 구별 연습", note: "오개념 확인",
          card: { layout: "table2", eye: "다시 볼까요?", title: "주장일까요, 근거일까요?", rows: [["급식을 남기지 말아요", "주장"], ["남은 급식이 하루 30kg이에요", "근거"], ["음식물 쓰레기는 환경을 해쳐요", "근거"]] } },
        { id: "k6-c", scene: "s5", t: "발문", lv: "yellow", title: "근거 2를 믿을 만하게 바꾸려면 무엇을 더하면 될까요?", note: "확인 질문" },
        { id: "k6-d", scene: "s5", t: "평가", lv: "yellow", title: "기준 체크 카드", note: "짧은 활동",
          card: { layout: "list", eye: "체크해 봐요", title: "근거 체크 카드", items: ["주장과 이어지나요?", "출처가 있나요?", "근거가 둘 이상인가요?"] } },
        { id: "k6-e", scene: "s6", t: "활동", lv: "green", title: "근거 고쳐 쓰기", note: "적용 활동",
          card: { layout: "question", eye: "더 해 볼까요?", title: "‘누구나 아는 사실이에요’를 믿을 만한 근거로 고쳐 써 볼까요?", sub: "출처와 숫자를 넣어 보세요." } },
        { id: "k6-f", scene: "s7", t: "발문", lv: "green", title: "같은 근거로 반대 주장을 할 수도 있을까요?", note: "심화 질문" }
      ]
    },
    {
      id: "ex-p6-algorithm", grade: 6, subject: "실과", unit: "소프트웨어와 생활", period: "2차시", total: 40,
      title: "생활 속 문제를 알고리즘으로 해결해 볼까요?",
      pages: [
        { id: "s1", stage: "도입", label: "표지", layout: "cover", min: 1, concepts: ["알고리즘"],
          say: ["오늘은 생활 속 문제를 순서대로 해결하는 방법을 만들어 볼 거예요.", "아침에 학교 올 때 무엇부터 했는지 떠올려 볼까요?"], notes: "" },
        { id: "s2", stage: "도입", label: "생각 열기", layout: "question", eye: "생각 열기", title: "학교 갈 준비를 순서대로 말해 볼까?", sub: "짝과 순서를 비교해 보세요.", min: 4,
          concepts: ["순서"], say: ["순서를 바꾸면 어떤 일이 생길까요?", "짝과 순서가 다른 곳이 있었나요?"],
          notes: "‘양말 신기 전에 신발 신기’ 같은 예를 들면 순서의 중요성이 잘 보여요." },
        { id: "s3", stage: "전개", label: "알고리즘이란", layout: "defs", eye: "알아보기", title: "알고리즘은 문제를 해결하는 순서예요", min: 6,
          defs: [["순차", "차례대로 하나씩 해요"], ["선택", "조건에 따라 다른 일을 해요"], ["반복", "같은 일을 여러 번 해요"]],
          concepts: ["순차", "선택", "반복"], say: ["‘비가 오면 우산을 챙긴다’는 순차, 선택, 반복 중 무엇일까요?", "우리 생활에서 반복하는 일을 찾아볼까요?"], notes: "" },
        { id: "s4", stage: "전개", label: "순서도 기호", layout: "table", eye: "기호 익히기", title: "순서도에 쓰는 기호", min: 6,
          rows: [["타원", "시작과 끝", "시작"], ["직사각형", "하는 일", "손을 씻는다"], ["마름모", "조건 판단", "비가 오나요?"]],
          concepts: ["순서도"], say: ["조건을 물을 때는 어떤 모양을 쓸까요?", "마름모에서는 길이 몇 갈래로 나뉠까요?"], notes: "" },
        { id: "s5", stage: "전개", label: "우산 챙기기", layout: "list", eye: "함께 만들기", title: "우산 챙기기 알고리즘", min: 8,
          items: ["시작 → 창밖을 본다", "비가 오나요? → 예: 우산을 챙긴다", "아니요: 그냥 출발한다 → 끝"],
          concepts: ["선택 구조"], say: ["‘비가 오나요?’ 다음에 길이 두 갈래로 나뉘는 것이 보이나요?", "예일 때와 아니요일 때 무엇이 달라질까요?"],
          notes: "수업 자료의 순서도 그림을 띄워 화살표를 손으로 따라가요." },
        { id: "s6", stage: "전개", label: "모둠 활동", layout: "question", eye: "모둠 활동", title: "급식 줄 서기를 알고리즘으로 바꿔 볼까요?", sub: "순차·선택·반복을 한 번씩 넣어 보세요.", min: 8,
          concepts: ["문제 해결"], say: ["줄을 설 때 꼭 확인해야 하는 조건은 무엇일까요?", "반복되는 일은 어디에 있을까요?"], notes: "모둠마다 큰 종이에 순서도를 그려요." },
        { id: "s7", stage: "전개", label: "서로 확인", layout: "choices", eye: "확인", title: "이 순서도에 빠진 것은 무엇일까요?", choices: ["① 시작", "② 조건 판단", "③ 끝"], min: 4,
          concepts: ["순서도 점검"], say: ["다른 모둠의 순서도를 따라가 보며 빠진 곳을 찾아볼까요?", "빠진 것을 넣으면 어떻게 달라질까요?"], notes: "" },
        { id: "s8", stage: "정리", label: "오늘의 한 문장", layout: "question", eye: "오늘의 한 문장", title: "알고리즘으로 바꾸면 무엇이 좋을까요?", sub: "다음 시간 · 블록 코딩으로 옮겨 보기", min: 3,
          concepts: ["알고리즘"], say: ["오늘 만든 알고리즘으로 무엇이 쉬워졌나요?", "다음 시간에는 이 순서를 블록 코딩으로 옮겨 봐요."], notes: "" }
      ],
      res: [
        { id: "p6-a", scene: "s5", t: "보충", lv: "red", title: "우산 챙기기 순서도 그림", note: "개념 그림", card: { pic: "flow-umbrella" } },
        { id: "p6-b", scene: "s4", t: "보충", lv: "red", title: "기호 다시 보기", note: "오개념 확인",
          card: { layout: "table2", eye: "다시 볼까요?", title: "이 일에는 어떤 기호를 쓸까요?", rows: [["시작", "타원"], ["손을 씻는다", "직사각형"], ["숙제를 다 했나요?", "마름모"]] } },
        { id: "p6-c", scene: "s3", t: "발문", lv: "yellow", title: "‘종이 울릴 때까지 책 읽기’는 어떤 구조일까요?", note: "확인 질문" },
        { id: "p6-d", scene: "s6", t: "활동", lv: "yellow", title: "모둠 순서도 점검표", note: "짧은 활동",
          card: { layout: "list", eye: "점검해요", title: "우리 모둠 순서도 점검표", items: ["시작과 끝이 있나요?", "조건 판단에 예·아니요 길이 있나요?", "반복이 끝나는 조건이 있나요?"] } },
        { id: "p6-e", scene: "s7", t: "활동", lv: "green", title: "반복을 넣어 더 짧게 만들기", note: "확장 과제",
          card: { layout: "question", eye: "더 해 볼까요?", title: "‘비가 그칠 때까지 기다린다’를 넣어 순서도를 바꿔 볼까요?", sub: "반복이 끝나는 조건을 꼭 넣어요." } },
        { id: "p6-f", scene: "s8", t: "발문", lv: "green", title: "컴퓨터가 알고리즘을 따를 때 사람과 다른 점은 무엇일까요?", note: "심화 질문" }
      ]
    }
  ];

  // ---------- example lesson records (not real classes; marked 예시 기록 on screen) ----------
  const day = (s) => new Date(s).getTime();
  const RECORDS = [
    { id: "ex-rec-1", example: true, key: "ex-s4-boiling", title: "물이 끓을 때 어떤 변화가 생길까?", grade: 4, subject: "과학", cls: "4학년 2반",
      at: day("2026-10-14T10:40:00"), totalSec: 2640, plannedMin: 38,
      scenes: [{ label: "표지", min: 1, sec: 60 }, { label: "도입 발문", min: 4, sec: 330, sig: "green" }, { label: "세 가지 상태", min: 5, sec: 300, sig: "green" },
        { label: "확인 문제", min: 5, sec: 540, sig: "red" }, { label: "관찰 실험", min: 12, sec: 780, sig: "yellow" }, { label: "증발과 끓음", min: 5, sec: 330, sig: "yellow" },
        { label: "생활 속 예", min: 4, sec: 200 }, { label: "마무리", min: 2, sec: 100 }],
      sig: { red: 1, yellow: 2, green: 2 }, usedTitles: ["거품 속 들여다보기 그림", "입자 그림 카드"],
      again: ["‘확인 문제’에서 다시 설명이 필요했어요 (기포 속은 수증기). 다음 시간 시작에 다시 짚기", "‘관찰 실험’이 예정보다 3분 길었어요"],
      questions: [{ label: "관찰 실험", text: "김과 수증기가 같은 것인지 묻는 질문이 많았어요" }],
      text: "거품을 ‘공기’라고 답한 학생이 많았어요. 다음 시간 첫 5분에 거품 그림을 다시 보여 줄 것." },
    { id: "ex-rec-2", example: true, key: "ex-m3-fraction", title: "분수를 그림으로 나타내 볼까요?", grade: 3, subject: "수학", cls: "3학년 1반",
      at: day("2026-10-21T09:50:00"), totalSec: 2460, plannedMin: 38,
      scenes: [{ label: "표지", min: 1, sec: 50 }, { label: "생각 열기", min: 4, sec: 260, sig: "green" }, { label: "똑같이 나누기", min: 6, sec: 480, sig: "red" },
        { label: "분모와 분자", min: 7, sec: 450, sig: "yellow" }, { label: "색칠하고 쓰기", min: 10, sec: 640, sig: "green" }, { label: "생활 속 분수", min: 6, sec: 380, sig: "green" },
        { label: "오늘의 한 문장", min: 4, sec: 200 }],
      sig: { red: 1, yellow: 1, green: 3 }, usedTitles: ["똑같이 나눈 원과 아닌 원", "4분의 3과 8분의 6 그려 비교하기"],
      again: ["‘똑같이 나누기’에서 다시 설명이 필요했어요 (똑같이 나누기, 부분과 전체). 다음 시간 시작에 다시 짚기"],
      questions: [{ label: "분모와 분자", text: "분모와 분자 위치가 헷갈린다는 질문" }],
      text: "모눈 활동지가 효과가 좋았어요. 조각 수만 세는 학생 3~4명은 다음 시간에 따로 확인." },
    { id: "ex-rec-3", example: true, key: "ex-k6-cardnews", title: "카드뉴스의 주장과 근거를 따져 볼까요?", grade: 6, subject: "국어", cls: "6학년 3반",
      at: day("2026-10-28T13:30:00"), totalSec: 2280, plannedMin: 38,
      scenes: [{ label: "표지", min: 1, sec: 40 }, { label: "생각 열기", min: 4, sec: 280, sig: "green" }, { label: "주장·근거·출처", min: 6, sec: 330, sig: "yellow" },
        { label: "예시 카드뉴스", min: 8, sec: 520, sig: "green" }, { label: "판단 기준", min: 7, sec: 460, sig: "yellow" }, { label: "골라 보기", min: 6, sec: 380, sig: "green" },
        { label: "오늘의 한 문장", min: 6, sec: 270 }],
      sig: { red: 0, yellow: 2, green: 3 }, usedTitles: ["예시 카드뉴스 그림", "기준 체크 카드"],
      again: ["‘판단 기준’에서 조금 더 확인이 필요했어요 (신뢰성, 충분성)"],
      questions: [{ label: "골라 보기", text: "설문 28명이 충분한지 묻는 좋은 질문이 나왔어요" }],
      text: "다음 시간 카드뉴스 만들기에서 출처 쓰기를 꼭 넣을 것." }
  ];

  window.NAVI_DATA = { pics: PICS, lessons: LESSONS, records: RECORDS };
})();
