// Google Drive · Slides로 PPTX를 원래 모양으로 바꾸기 (2026-11-15, docs/PPTX-GOOGLE.md)
// - 교사가 화면의 안내를 읽고 ‘동의하고 바꾸기’를 누를 때만 불러요. 열쇠(drive.file, 1시간)는 shim이 이 창의 메모리에만 둬요.
// - drive.file: 이 앱이 만든 파일만 보고 고쳐요. 교사 Drive의 다른 파일은 보지 못해요.
// - 만든 파일은 교사 Drive의 ‘수업 내비 변환 파일’ 폴더에만 두고, 누구와도 공유하지 않아요(권한을 더하지 않아요).
// - 앱 표시(appProperties): navi = "deck"(변환 파일, 보통 바로 휴지통) · "pdf"(수업이 쓰는 PDF 사본), src = 원본 PPTX 지문, fid = 수업 파일 지문(같은 계정 휴대폰이 이 지문으로 찾아요)
// - Google Slides가 주는 그림 주소(contentUrl)는 잠깐 쓰는 주소라 저장하지 않고, 이 창의 메모리에서만 써요.
(function () {
  const API = "https://www.googleapis.com/drive/v3/", UP = "https://www.googleapis.com/upload/drive/v3/files", SLIDES = "https://slides.googleapis.com/v1/presentations/";
  const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation", GS = "application/vnd.google-apps.presentation", DIR = "application/vnd.google-apps.folder";
  const DIR_NAME = "수업 내비 변환 파일";
  const enc = encodeURIComponent;
  // a failed call keeps Google's reason (e.g. exportSizeLimitExceeded, insufficientPermissions) so the screen can say what happened
  async function call(tok, url, o) {
    o = o || {};
    const r = await fetch(url, Object.assign({}, o, { headers: Object.assign({ Authorization: "Bearer " + tok }, o.headers || {}) }));
    if (r.ok) return r;
    let reason = "";
    try { const j = await r.json(); reason = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ""; } catch (e) {}
    const e = new Error("google " + r.status + " " + reason);
    e.status = r.status; e.reason = reason;
    throw e;
  }
  const json = async (p) => (await p).json();
  const list = (tok, q, fields) => json(call(tok, API + "files?spaces=drive&pageSize=100&orderBy=createdTime%20desc&q=" + enc(q + " and trashed=false") + "&fields=" + enc("files(" + fields + ")")));
  async function folder(tok) {
    const r = await list(tok, "mimeType='" + DIR + "' and appProperties has { key='navi' and value='folder' }", "id");
    if (r.files && r.files[0]) return r.files[0].id;
    const c = await json(call(tok, API + "files?fields=id", { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ name: DIR_NAME, mimeType: DIR, appProperties: { navi: "folder" } }) }));
    return c.id;
  }
  window.naviDrive = {
    // PPTX → Google Slides (Drive converts it). props: more app marks (src). Returns the new file's id
    async upload(tok, file, props) {
      const dir = await folder(tok);
      const meta = { name: String(file.name || "수업").replace(/\.pptx$/i, "").slice(0, 100), mimeType: GS, parents: [dir], appProperties: Object.assign({ navi: "deck" }, props || {}) };
      const s = await call(tok, UP + "?uploadType=resumable&fields=id", { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": PPTX, "X-Upload-Content-Length": String(file.size) }, body: JSON.stringify(meta) });
      const at = s.headers.get("Location");
      if (!at) { const e = new Error("no upload address"); e.reason = "noLocation"; throw e; }
      const r = await fetch(at, { method: "PUT", headers: { "Content-Type": PPTX }, body: file });
      if (!r.ok) { const e = new Error("upload " + r.status); e.status = r.status; e.reason = r.status === 413 ? "tooBig" : "upload"; throw e; }
      return (await r.json()).id;
    },
    // a copy of the PDF the lesson uses (the same bytes): what the phone draws from, so it shows exactly what the class sees
    async uploadPdf(tok, blob, name, props) {
      const dir = await folder(tok);
      const meta = { name: String(name || "수업.pdf").slice(0, 100), mimeType: "application/pdf", parents: [dir], appProperties: Object.assign({ navi: "pdf" }, props || {}) };
      const s = await call(tok, UP + "?uploadType=resumable&fields=id", { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/pdf", "X-Upload-Content-Length": String(blob.size) }, body: JSON.stringify(meta) });
      const at = s.headers.get("Location");
      if (!at) { const e = new Error("no upload address"); e.reason = "noLocation"; throw e; }
      const r = await fetch(at, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: blob });
      if (!r.ok) { const e = new Error("upload " + r.status); e.status = r.status; throw e; }
      return (await r.json()).id;
    },
    async download(tok, id) { return (await call(tok, API + "files/" + enc(id) + "?alt=media")).blob(); },
    // the slides as one PDF, drawn by Google (Google makes PDFs up to 10MB: exportSizeLimitExceeded beyond that)
    async pdf(tok, id) { return (await call(tok, API + "files/" + enc(id) + "/export?mimeType=" + enc("application/pdf"))).blob(); },
    async mark(tok, id, props) { await call(tok, API + "files/" + enc(id) + "?fields=id", { method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ appProperties: props }) }); },
    // to the Drive trash (the teacher can still take it back there for 30 days); the original PPTX on the PC is never touched
    async trash(tok, id) { await call(tok, API + "files/" + enc(id) + "?fields=id", { method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ trashed: true }) }); },
    // this app's converted files in this account (only what this app made: drive.file)
    async files(tok) { return (await list(tok, "(appProperties has { key='navi' and value='deck' } or appProperties has { key='navi' and value='pdf' })", "id,name,createdTime,appProperties")).files || []; },
    async byFid(tok, fid) { return ((await list(tok, "appProperties has { key='fid' and value='" + String(fid).replace(/[^0-9a-z-]/gi, "") + "' }", "id,name,mimeType,createdTime")).files || [])[0] || null; },
    // the slides' ids, in order (for pictures on a phone)
    async slides(tok, id) { const r = await json(call(tok, SLIDES + enc(id) + "?fields=" + enc("slides(objectId)"))); return (r.slides || []).map((s) => s.objectId); },
    // one slide's picture: a short-lived address from Google, for an <img> in this window only (never saved, never sent on)
    async thumb(tok, id, pageId, size) {
      const r = await json(call(tok, SLIDES + enc(id) + "/pages/" + enc(pageId) + "/thumbnail?thumbnailProperties.thumbnailSize=" + (size || "MEDIUM")));
      return { url: r.contentUrl, w: r.width, h: r.height };
    }
  };
})();
