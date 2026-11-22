// 시험용 파일 만들기: node tests/fixtures/make-fixtures.js
// lesson.pdf (4:3, 3장), lesson.pptx (같은 3장 + 발표자 노트), picture.png (서랍에 넣을 그림)
// 가져오기 시험(2026-11-14, docs/SLIDE-IMPORT.md): 모두 시험용으로 직접 만든 파일이에요(실제 수업 자료 아님)
//   table.pptx   표 · 묶은 도형 · 쪽 번호가 있는 2장(표 안 글자를 읽는지)
//   hidden.pptx  lesson.pptx의 3장 사이에 숨긴 장 1장(PDF는 숨긴 장을 빼고 저장되니 lesson.pdf와 맞아요)
//   other.pptx   다른 자료 4장(장 수가 달라요)
//   swapped.pptx lesson.pptx와 같은 3장인데 순서가 달라요(장 수는 같고, 장마다의 글자가 다른 장에 있어요)
//   edited.pptx  lesson.pptx에서 둘째 장만 고쳤어요(PDF로 저장한 뒤 고친 것처럼)
//   shapes.pdf · shapes.pptx  글자 없는 도형만 있는 3장(같은 자료인지 글자로 알 수 없어요)
//   우리 고장 문제 찾기.pdf · .pptx  교사 자료처럼 서식 · 활동 제목 · 쪽 번호가 되풀이되는 18장(장면 이름이 겹치지 않는지)
// 이미 있는 lesson.pdf · picture.png는 만들 때마다 날짜가 바뀌어서, 없을 때만 새로 만들어요
import { writeFileSync, existsSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import { chromium } from "@playwright/test";

const dir = new URL("./", import.meta.url);
const SLIDES = [
  { title: "식물의 한살이", body: ["씨앗이 자라는 순서를 알아봐요"], notes: "씨앗을 직접 보여 주며 시작해요." },
  { title: "씨앗은 어떻게 싹이 틀까요?", body: ["물", "알맞은 온도", "공기"], notes: "조건 세 가지를 칠판에 적어요." },
  { title: "오늘 배운 것 정리", body: ["한 문장으로 써 봐요"], notes: "" }
];

// a zip writer small enough to read: deflate each entry, then the central directory
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8"), data = Buffer.from(f.data), comp = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10); head.writeUInt16LE(0, 12); head.writeUInt16LE(0x21, 14); head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(comp.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, name, comp);
    central.push(head, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const paras = (lines) => lines.map((l) => "<a:p><a:r><a:t>" + xmlEsc(l) + "</a:t></a:r></a:p>").join("");
const shape = (id, ph, lines) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="s' + id + '"/><p:cNvSpPr/><p:nvPr>' + ph + "</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>" + paras(lines) + "</p:txBody></p:sp>";
const rels = (list) => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  list.map((r) => '<Relationship Id="' + r[0] + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + r[1] + '" Target="' + r[2] + '"/>').join("") + "</Relationships>";
// a table as PowerPoint keeps it: a graphic frame holding rows of cells
const table = (id, rows) => '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="t' + id + '"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/>' +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid/>' +
  rows.map((r) => "<a:tr>" + r.map((c) => "<a:tc><a:txBody><a:bodyPr/>" + paras([c]) + "</a:txBody></a:tc>").join("") + "</a:tr>").join("") + "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>";
const group = (id, inner) => '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="' + id + '" name="g' + id + '"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + inner + "</p:grpSp>";

// slides: { title, body, notes, hidden, table: [[...]], group: [...], num: "3" }
function pptx(slides) {
  const files = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      slides.map((s, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>').join("") + "</Types>" },
    { name: "_rels/.rels", data: rels([["rId1", "officeDocument", "ppt/presentation.xml"]]) },
    { name: "ppt/presentation.xml", data: '<?xml version="1.0" encoding="UTF-8"?><p:presentation ' + NS + "><p:sldIdLst>" + slides.map((s, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 1) + '"/>').join("") + '</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>' },
    { name: "ppt/_rels/presentation.xml.rels", data: rels(slides.map((s, i) => ["rId" + (i + 1), "slide", "slides/slide" + (i + 1) + ".xml"])) }
  ];
  slides.forEach((s, i) => {
    const n = i + 1;
    // head · foot: a school template's header and footer, plain text boxes on every slide (not PowerPoint's footer placeholders)
    // box: a plain text box with the slide's number (not PowerPoint's slide-number placeholder), as teachers' decks often have
    const tree = (s.head ? shape(7, "", [s.head]) : "") + (s.title ? shape(2, '<p:ph type="title"/>', [s.title]) : "") + (s.body && s.body.length ? shape(3, '<p:ph idx="1"/>', s.body) : "") + (s.foot ? shape(8, "", [s.foot]) : "") +
      (s.box ? shape(9, "", [s.box]) : "") +
      (s.table ? table(4, s.table) : "") + (s.group ? group(5, s.group.map((g, k) => shape(10 + k, "", [g])).join("")) : "") +
      (s.num ? shape(6, '<p:ph type="sldNum" sz="quarter" idx="12"/>', [s.num]) : "");
    files.push({ name: "ppt/slides/slide" + n + ".xml", data: '<?xml version="1.0" encoding="UTF-8"?><p:sld ' + NS + (s.hidden ? ' show="0"' : "") + "><p:cSld><p:spTree>" + tree + "</p:spTree></p:cSld></p:sld>" });
    files.push({ name: "ppt/slides/_rels/slide" + n + ".xml.rels", data: rels([["rId1", "notesSlide", "../notesSlides/notesSlide" + n + ".xml"]]) });
    // notes: one paragraph, or a list of paragraphs (lines in PowerPoint's notes box)
    files.push({ name: "ppt/notesSlides/notesSlide" + n + ".xml", data: '<?xml version="1.0" encoding="UTF-8"?><p:notes ' + NS + "><p:cSld><p:spTree>" + shape(2, '<p:ph type="sldImg"/>', []) + shape(3, '<p:ph type="body" idx="1"/>', Array.isArray(s.notes) ? s.notes : s.notes ? [s.notes] : []) + "</p:spTree></p:cSld></p:notes>" });
  });
  return zip(files);
}
const put = (name, data) => writeFileSync(new URL(name, dir), data);

const browser = await chromium.launch();
const page = await browser.newPage();
const pdfPage = (sections) => page.setContent('<style>@page{size:1024px 768px;margin:0}body{margin:0;font-family:"Malgun Gothic",sans-serif}section{width:1024px;height:768px;box-sizing:border-box;padding:80px;break-after:page;position:relative}h1{font-size:56px;margin:0 0 30px}li{font-size:34px}i{position:absolute;display:block}</style>' + sections);
if (!existsSync(new URL("lesson.pdf", dir))) {
  await pdfPage(SLIDES.map((s) => "<section><h1>" + s.title + "</h1><ul>" + s.body.map((b) => "<li>" + b + "</li>").join("") + "</ul></section>").join(""));
  put("lesson.pdf", await page.pdf({ width: "1024px", height: "768px", printBackground: true }));
}
if (!existsSync(new URL("shapes.pdf", dir))) {
  // pictures only: no word on any page
  const COL = [["#F2C94C", "#2D9CDB"], ["#6FCF97", "#EB5757"], ["#9B51E0", "#F2994A"]];
  await pdfPage(COL.map((c) => '<section><i style="left:120px;top:140px;width:360px;height:360px;border-radius:50%;background:' + c[0] + '"></i><i style="left:560px;top:220px;width:320px;height:240px;background:' + c[1] + '"></i></section>').join(""));
  put("shapes.pdf", await page.pdf({ width: "1024px", height: "768px", printBackground: true }));
}
// a made-up school template (no real school or person): the same header and footer on every slide of two different lessons
const HEAD = "햇살초등학교 4학년 · 2학기 과학 수업 자료 · 우리 반 함께 배워요", FOOT = "수업 중 휴대폰은 가방에 넣어요 · 모르는 것은 손을 들고 물어봐요";
const TX = [["물의 세 가지 상태", ["얼음 · 물 · 수증기"]], ["증발", ["빨래가 마르는 까닭"]], ["끓음", ["거품이 생겨요"]], ["응결", ["컵 바깥 물방울"]], ["물의 순환", ["하늘과 땅을 돌아요"]], ["정리", ["오늘 배운 것"]]];
const TY = [["자석의 성질", ["철을 끌어당겨요"]], ["N극과 S극", ["다른 극끼리 붙어요"]], ["나침반", ["북쪽을 가리켜요"]], ["자석 놀이", ["클립 낚시"]], ["생활 속 자석", ["냉장고 문"]], ["정리", ["오늘 배운 것"]]];
if (!existsSync(new URL("template-x.pdf", dir))) {
  // lesson X as PowerPoint would save it: header, title, lines, footer and a page number on every page
  await page.setContent('<style>@page{size:1024px 768px;margin:0}body{margin:0;font-family:"Malgun Gothic",sans-serif}section{width:1024px;height:768px;box-sizing:border-box;padding:40px 80px;break-after:page;position:relative}small{display:block;font-size:20px;color:#456}h1{font-size:56px;margin:30px 0}li{font-size:34px}footer{position:absolute;bottom:30px;left:80px;right:80px;font-size:18px;color:#678;display:flex;justify-content:space-between}</style>' +
    TX.map((s, i) => "<section><small>" + HEAD + "</small><h1>" + s[0] + "</h1><ul>" + s[1].map((x) => "<li>" + x + "</li>").join("") + "</ul><footer><span>" + FOOT + "</span><span>" + (i + 1) + " / " + TX.length + "</span></footer></section>").join(""));
  put("template-x.pdf", await page.pdf({ width: "1024px", height: "768px", printBackground: true }));
}
// 교사 자료처럼 되풀이되는 서식(2026-11-15): 내용 장마다 같은 학습 목표 머리글, 활동 이름을 여러 장의 제목으로 되풀이,
// 쪽 번호 글상자, 활동을 여는 구분 장, 본문 없이 제목만 있는 장, 글자가 하나도 없는 마지막 장. 실제 자료의 모양만 본떠 직접 만든 가짜 수업이에요
const GOAL = "우리 고장의 문제를 찾고 해결 방법을 이야기할 수 있다";
const ACT1 = "활동1. 문제 찾기 지도 만들기", ACT2 = "활동2. 해결 방법 이야기하기", INTRO = "도입. 우리 고장 둘러보기", END = "정리. 오늘 배운 것";
const CLASS = [
  { title: "우리 고장의 문제를 찾아요", body: ["4학년 사회 · 검증용으로 직접 만든 자료"], notes: "표지. 인사하고 오늘 주제를 말해요." },
  { head: GOAL, title: INTRO, body: ["사진 속 장소는 어디일까요?"], box: "2", notes: "2장: 학교 앞 사진을 보여 줘요." },
  { head: GOAL, title: INTRO, body: ["불편했던 경험 떠올리기", "짝과 이야기하기"], box: "3", notes: "3장: 짝과 1분 이야기해요." },
  { head: GOAL, title: INTRO, body: ["오늘 할 일 알아보기"], box: "4", notes: "4장: 활동 순서를 칠판에 적어요." },
  { head: GOAL, title: "학습 목표", body: [GOAL], box: "5", notes: "5장: 학습 목표를 함께 읽어요." },
  { title: "활동 1", body: ["문제 찾기 지도 만들기"], notes: "" },
  { head: GOAL, title: ACT1, body: ["모둠 활동 · 10분", "역할 나누기"], box: "7", notes: "7장: 기록 · 발표 · 시간 지킴이를 정해요." },
  { head: GOAL, title: ACT1, body: ["모둠 활동 · 10분", "지도에 붙임 쪽지 붙이기"], box: "8", notes: "8장: 쪽지 하나에 문제 하나만 써요." },
  { head: GOAL, title: ACT1, body: ["모둠 활동 · 10분", "가장 급한 문제 고르기"], box: "9", notes: "9장: 붙임 딱지로 투표해요." },
  { head: GOAL, title: ACT1, box: "10", notes: "10장: 모둠 지도 사진을 띄워요(본문 없음)." },
  { head: GOAL, title: ACT1, body: ["모둠별로 발표하기"], box: "11", notes: "11장: 모둠마다 1분씩 발표해요." },
  { title: "활동 2", body: ["해결 방법 이야기하기"], notes: "" },
  { head: GOAL, title: ACT2, body: ["누가 도울 수 있을까요?"], box: "13", notes: "13장: 주민 · 구청 · 학생을 나눠 생각해요." },
  { head: GOAL, title: ACT2, body: ["해결 방법 문장 카드 쓰기"], box: "14", notes: "14장: 카드 한 장에 한 문장." },
  { head: GOAL, title: ACT2, body: ["카드 나누어 읽기"], box: "15", notes: "15장: 다른 모둠 카드를 읽어요." },
  { head: GOAL, title: END, body: ["오늘 찾은 문제 한 가지"], box: "16", notes: "16장: 한 사람씩 말해요." },
  { head: GOAL, title: END, body: ["다음 시간 예고"], box: "17", notes: "17장: 다음 시간에는 해결 방법을 고쳐 써요." },
  { notes: "18장: 마무리 그림(글자 없음)." }
];
if (!existsSync(new URL("우리 고장 문제 찾기.pdf", dir))) {
  // the same deck as PowerPoint would save it to PDF: header, title, lines and the number box; the last page only a picture
  await page.setContent('<style>@page{size:1024px 768px;margin:0}body{margin:0;font-family:"Malgun Gothic",sans-serif}section{width:1024px;height:768px;box-sizing:border-box;padding:40px 80px;break-after:page;position:relative}small{display:block;font-size:20px;color:#555;margin-bottom:24px}h1{font-size:48px;margin:0 0 28px}li{font-size:32px}b.n{position:absolute;right:48px;bottom:32px;font-size:20px;color:#777}i{position:absolute;display:block}</style>' +
    CLASS.map((s) => "<section>" + (s.head ? "<small>" + s.head + "</small>" : "") + (s.title ? "<h1>" + s.title + "</h1>" : "") + (s.body ? "<ul>" + s.body.map((x) => "<li>" + x + "</li>").join("") + "</ul>" : "") + (s.box ? '<b class="n">' + s.box + "</b>" : "") +
      (s.title ? "" : '<i style="left:200px;top:160px;width:420px;height:420px;border-radius:50%;background:#6FCF97"></i><i style="left:560px;top:260px;width:300px;height:220px;background:#2D9CDB"></i>') + "</section>").join(""));
  put("우리 고장 문제 찾기.pdf", await page.pdf({ width: "1024px", height: "768px", printBackground: true }));
}
if (!existsSync(new URL("picture.png", dir))) {
  await page.setViewportSize({ width: 480, height: 320 });
  await page.setContent('<div style="width:480px;height:320px;background:linear-gradient(135deg,#5FD3B4,#1F5FBF);display:flex;align-items:center;justify-content:center;font:700 44px sans-serif;color:#fff">입자 그림</div><style>body{margin:0}</style>');
  put("picture.png", await page.screenshot());
}
await browser.close();
put("lesson.pptx", pptx(SLIDES));
put("table.pptx", pptx([
  { title: "상태 변화 정리", table: [["상태 변화", "예", "열"], ["증발", "빨래가 마름", "흡수"], ["응결", "컵 바깥 물방울", "방출"]], num: "1", notes: "표의 빈칸을 가리고 먼저 말해 보게 해요." },
  { title: "물의 순환 단계", group: ["증발", "응결", "강수"], num: "2", notes: "" }
]));
put("hidden.pptx", pptx([SLIDES[0], { title: "숨긴 장: 지난 시간 복습", body: ["교사만 보는 장"], notes: "숨긴 장의 노트", hidden: true }, SLIDES[1], SLIDES[2]]));
put("other.pptx", pptx([
  { title: "분수의 덧셈", body: ["분모가 같은 분수"], notes: "피자 그림으로 시작해요." },
  { title: "분모가 같을 때", body: ["분자끼리 더해요"], notes: "" },
  { title: "연습 문제", body: ["2/5 + 1/5"], notes: "칠판에 함께 풀어요." },
  { title: "정리", body: ["오늘 배운 것"], notes: "" }
]));
put("swapped.pptx", pptx([SLIDES[2], SLIDES[0], SLIDES[1]]));
// 발표자 노트가 여러 줄이고 긴 PPTX(교사가 실제로 쓰는 노트처럼 줄마다 할 일, 400자 넘게)
put("longnotes.pptx", pptx([{ title: "긴 노트가 있는 장", body: ["노트 줄바꿈 확인"], notes: [
  "1. 도입(3분): 지난 시간에 심은 씨앗 화분을 교실 앞에 두고, 무엇이 달라졌는지 먼저 말해 보게 해요. 손을 든 학생이 적으면 짝과 30초 이야기한 뒤 다시 물어요.",
  "2. 관찰(5분): 모둠마다 돋보기를 나눠 주고 떡잎 · 본잎 · 줄기를 찾아 관찰 기록장에 그리게 해요. 그림을 잘 못 그리는 학생에게는 낱말로 써도 된다고 말해요.",
  "3. 비교(5분): 햇빛이 드는 창가 화분과 그늘 화분을 나란히 놓고 키와 잎 색을 비교해요. 차이가 생긴 까닭을 한 문장으로 쓰게 하고, 두세 명만 발표시켜요.",
  "4. 정리(2분): 오늘 관찰한 것 중 가장 놀라웠던 것을 한 낱말로 말하며 마쳐요. 다음 시간까지 물 주기 당번을 정해 칠판 오른쪽에 적어 둬요.",
  "5. 남는 시간이 있으면: 씨앗이 싹 트는 데 필요한 조건을 지난 시간 실험 결과와 이어서 한 번 더 묻고, 대답이 엇갈리면 다음 시간에 다시 다룬다고 칠판 구석에 적어 둬요."
] }]));
// 같은 서식의 두 수업: X(물의 상태 변화)와 Y(자석), 6장씩. 같은 머리글 · 바닥글이 글자의 대부분이에요
const tpl = (list, tag) => list.map((s, i) => ({ head: HEAD, foot: FOOT, title: s[0], body: s[1], notes: tag + " " + (i + 1) + "장 노트" }));
put("template-x.pptx", pptx(tpl(TX, "물 수업")));
put("template-y.pptx", pptx(tpl(TY, "자석 수업")));
// X와 같은 자료인데 파일 이름이 다르고 셋째 장 글자만 고친 것(PDF로 저장한 뒤 고친 것처럼)
put("물의 상태 변화(수정본).pptx", pptx(tpl(TX.map((s, i) => i === 2 ? ["끓음", ["보글보글 거품이 올라와요"]] : s), "물 수업")));
put("우리 고장 문제 찾기.pptx", pptx(CLASS));
// PDF로 저장한 뒤 둘째 장만 고친 PPTX(장 수 · 순서는 같고 한 장의 글자가 달라요)
put("edited.pptx", pptx([SLIDES[0], { title: "싹이 트는 조건 실험 계획", body: ["준비물 정하기", "관찰할 날짜 정하기"], notes: "실험 계획을 모둠별로 세워요." }, SLIDES[2]]));
put("shapes.pptx", pptx([{ notes: "노란 원부터 가리켜요." }, { notes: "초록 원과 빨간 네모를 비교해요." }, { notes: "보라 원으로 마무리해요." }]));
console.log("시험용 파일을 만들었어요: lesson.pptx, table.pptx, hidden.pptx, other.pptx, swapped.pptx, shapes.pptx (+ 없던 PDF · 그림)");
