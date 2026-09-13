/**
 * ECO QUEST master spreadsheet receiver.
 *
 * Install this as a bound Apps Script from the teacher-owned spreadsheet.
 * Run setupEcoQuest() once, then deploy as a web app that executes as the owner.
 * The webhook secret and spreadsheet ID stay in Apps Script Properties and must
 * never be committed to GitHub or exposed to the browser.
 */

const ECO_QUEST_VERSION = "1.0.0";

const ECO_SHEETS = Object.freeze({
  DASHBOARD: {
    name: "전체 현황",
    headers: []
  },
  STUDENTS: {
    name: "학생",
    headers: [
      "student_id", "반", "번호", "이름", "모둠", "가입일", "마지막 접속", "허용 도감 수", "상태", "동기화 시각"
    ]
  },
  OBSERVATIONS: {
    name: "공동 관찰",
    headers: [
      "observation_id", "제출 시각", "반", "모둠", "발견자 ID", "발견자", "위도", "경도",
      "구체적인 장소", "생물 분류", "최종 이름", "학명", "관찰 특징", "동정 근거", "참고 자료",
      "대표 사진", "동정 상태", "검토 상태", "수정 시각", "동기화 시각"
    ]
  },
  GUIDES: {
    name: "개인 생물도감",
    headers: [
      "guide_id", "제출 시각", "student_id", "반", "번호", "이름", "observation_id", "생물 이름",
      "학명", "생물 분류", "서식지", "주요 특징", "생태계 역할", "조사 내용", "참고 자료",
      "대표 사진", "제출 상태", "수정 시각", "동기화 시각"
    ]
  },
  SUBMISSIONS: {
    name: "제출 현황",
    headers: [
      "student_id", "반", "번호", "이름", "기본 도감 수", "허용 도감 수", "완성 도감 수",
      "최근 제출", "제출 상태", "동기화 시각"
    ]
  },
  REVIEWS: {
    name: "검토 필요",
    headers: [
      "review_id", "생성 시각", "유형", "대상 ID", "반", "학생·모둠", "내용", "처리 상태",
      "처리 교사", "처리 시각", "동기화 시각"
    ]
  },
  AUDIT: {
    name: "시스템 기록",
    headers: ["event_id", "수신 시각", "이벤트", "대상 ID", "처리 결과"]
  }
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("ECO QUEST")
    .addItem("마스터 시트 초기 설정", "setupEcoQuest")
    .addItem("동기화 비밀키 확인", "showEcoQuestWebhookSecret")
    .addItem("현황 새로고침", "refreshEcoQuestDashboard")
    .addToUi();
}

function setupEcoQuest() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("스프레드시트에서 확장 프로그램 → Apps Script로 실행해 주세요.");

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("ECO_SPREADSHEET_ID", spreadsheet.getId());
  properties.setProperty("ECO_VERSION", ECO_QUEST_VERSION);
  if (!properties.getProperty("ECO_WEBHOOK_SECRET")) {
    properties.setProperty("ECO_WEBHOOK_SECRET", createSecret_());
  }

  Object.keys(ECO_SHEETS).forEach(function (key) {
    const definition = ECO_SHEETS[key];
    if (key === "DASHBOARD") {
      ensureSheet_(spreadsheet, definition.name);
    } else {
      prepareDataSheet_(spreadsheet, definition);
    }
  });

  const defaultSheet = spreadsheet.getSheetByName("시트1") || spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && spreadsheet.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    spreadsheet.deleteSheet(defaultSheet);
  }

  const audit = spreadsheet.getSheetByName(ECO_SHEETS.AUDIT.name);
  if (audit && !audit.isSheetHidden()) audit.hideSheet();
  refreshDashboard_(spreadsheet);
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName(ECO_SHEETS.DASHBOARD.name));
  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    "ECO QUEST 설정 완료",
    "마스터 시트 탭과 동기화 비밀키를 만들었습니다. 다음으로 웹 앱을 배포해 주세요.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showEcoQuestWebhookSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty("ECO_WEBHOOK_SECRET");
  if (!secret) {
    SpreadsheetApp.getUi().alert("먼저 ‘마스터 시트 초기 설정’을 실행해 주세요.");
    return;
  }
  SpreadsheetApp.getUi().alert(
    "Cloudflare 비밀 변수용 값",
    secret + "\n\n이 값은 학생이나 공개 GitHub에 공유하지 마세요.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function refreshEcoQuestDashboard() {
  refreshDashboard_(getEcoSpreadsheet_());
  SpreadsheetApp.getActiveSpreadsheet().toast("전체 현황을 새로고침했습니다.", "ECO QUEST");
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "eco-quest-sheets",
    version: ECO_QUEST_VERSION,
    configured: Boolean(PropertiesService.getScriptProperties().getProperty("ECO_SPREADSHEET_ID"))
  });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = parseBody_(event);
    verifySecret_(body.secret);
    const result = handleEvent_(body);
    appendAudit_(body.event_id || Utilities.getUuid(), body.type, result.id || "", "완료");
    refreshDashboard_(getEcoSpreadsheet_());
    return jsonResponse_({ ok: true, result: result, version: ECO_QUEST_VERSION });
  } catch (error) {
    try {
      appendAudit_(Utilities.getUuid(), "error", "", String(error.message || error));
    } catch (ignored) {}
    return jsonResponse_({ ok: false, error: String(error.message || error) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function handleEvent_(body) {
  if (!body || !body.type || !body.data) throw new Error("이벤트 형식이 올바르지 않습니다.");
  const now = new Date();
  const data = body.data;

  switch (body.type) {
    case "student.upsert":
      requireFields_(data, ["student_id", "class_number", "student_number", "student_name"]);
      upsertRow_(ECO_SHEETS.STUDENTS, data.student_id, [
        data.student_id, data.class_number, data.student_number, safeCell_(data.student_name), data.group_number || "",
        toDate_(data.created_at), toDate_(data.last_login_at), normalizeGuideLimit_(data.guide_limit), data.status || "활동", now
      ]);
      refreshSubmission_(data.student_id, now);
      return { id: data.student_id, sheet: ECO_SHEETS.STUDENTS.name };

    case "observation.upsert":
      requireFields_(data, ["observation_id", "class_number", "group_number", "latitude", "longitude", "place_name"]);
      upsertRow_(ECO_SHEETS.OBSERVATIONS, data.observation_id, [
        data.observation_id, toDate_(data.created_at), data.class_number, data.group_number,
        data.student_id || "", safeCell_(data.student_name || ""), data.latitude, data.longitude,
        safeCell_(data.place_name), safeCell_(data.category || ""), safeCell_(data.species_name || ""),
        safeCell_(data.scientific_name || ""), safeCell_(data.features || ""), safeCell_(data.identification_reason || ""),
        safeCell_(data.source || ""), safeUrl_(data.photo_url || ""), safeCell_(data.identification_status || "학생 동정"),
        safeCell_(data.review_status || "정상"), toDate_(data.updated_at), now
      ]);
      return { id: data.observation_id, sheet: ECO_SHEETS.OBSERVATIONS.name };

    case "guide.upsert":
      requireFields_(data, ["guide_id", "student_id", "class_number", "student_number", "student_name"]);
      upsertRow_(ECO_SHEETS.GUIDES, data.guide_id, [
        data.guide_id, toDate_(data.created_at), data.student_id, data.class_number, data.student_number,
        safeCell_(data.student_name), data.observation_id || "", safeCell_(data.species_name || ""),
        safeCell_(data.scientific_name || ""), safeCell_(data.category || ""), safeCell_(data.habitat || ""),
        safeCell_(data.key_features || ""), safeCell_(data.ecological_role || ""), safeCell_(data.report || ""),
        safeCell_(data.source || ""), safeUrl_(data.photo_url || ""), safeCell_(data.status || "완료"),
        toDate_(data.updated_at), now
      ]);
      refreshSubmission_(data.student_id, now);
      return { id: data.guide_id, sheet: ECO_SHEETS.GUIDES.name };

    case "review.upsert":
      requireFields_(data, ["review_id", "target_id", "review_type"]);
      upsertRow_(ECO_SHEETS.REVIEWS, data.review_id, [
        data.review_id, toDate_(data.created_at), safeCell_(data.review_type), data.target_id,
        data.class_number || "", safeCell_(data.owner_label || ""), safeCell_(data.message || ""),
        safeCell_(data.status || "확인 필요"), safeCell_(data.teacher_name || ""), toDate_(data.resolved_at), now
      ]);
      return { id: data.review_id, sheet: ECO_SHEETS.REVIEWS.name };

    default:
      throw new Error("지원하지 않는 이벤트입니다: " + body.type);
  }
}

function prepareDataSheet_(spreadsheet, definition) {
  const sheet = ensureSheet_(spreadsheet, definition.name);
  if (sheet.getMaxColumns() < definition.headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), definition.headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, definition.headers.length)
    .setBackground("#173f35")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sheet.getDataRange().setVerticalAlignment("middle");
  sheet.autoResizeColumns(1, definition.headers.length);
  sheet.setColumnWidth(1, 170);
}

function ensureSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function upsertRow_(definition, id, values) {
  const sheet = getEcoSpreadsheet_().getSheetByName(definition.name);
  if (!sheet) throw new Error(definition.name + " 시트가 없습니다. 초기 설정을 다시 실행해 주세요.");
  const row = findRowById_(sheet, id);
  const targetRow = row || sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, definition.headers.length).setValues([values]);
}

function findRowById_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function refreshSubmission_(studentId, now) {
  const spreadsheet = getEcoSpreadsheet_();
  const students = spreadsheet.getSheetByName(ECO_SHEETS.STUDENTS.name);
  const studentRow = findRowById_(students, studentId);
  if (!studentRow) return;
  const student = students.getRange(studentRow, 1, 1, ECO_SHEETS.STUDENTS.headers.length).getValues()[0];
  const guides = spreadsheet.getSheetByName(ECO_SHEETS.GUIDES.name);
  const guideValues = guides.getLastRow() < 2 ? [] : guides.getRange(2, 1, guides.getLastRow() - 1, ECO_SHEETS.GUIDES.headers.length).getValues();
  const mine = guideValues.filter(function (row) { return String(row[2]) === String(studentId) && String(row[16]) === "완료"; });
  const allowed = normalizeGuideLimit_(student[7]);
  const latest = mine.reduce(function (result, row) {
    const value = row[17] || row[1];
    return !result || value > result ? value : result;
  }, "");
  upsertRow_(ECO_SHEETS.SUBMISSIONS, studentId, [
    studentId, student[1], student[2], student[3], 3, allowed, mine.length, latest,
    mine.length >= 3 ? "기본 완료" : "작성 중", now
  ]);
}

function refreshDashboard_(spreadsheet) {
  const sheet = ensureSheet_(spreadsheet, ECO_SHEETS.DASHBOARD.name);
  const studentRows = dataRowCount_(spreadsheet.getSheetByName(ECO_SHEETS.STUDENTS.name));
  const observationRows = dataRowCount_(spreadsheet.getSheetByName(ECO_SHEETS.OBSERVATIONS.name));
  const guideRows = dataRowCount_(spreadsheet.getSheetByName(ECO_SHEETS.GUIDES.name));
  const reviewSheet = spreadsheet.getSheetByName(ECO_SHEETS.REVIEWS.name);
  const pendingReviews = reviewSheet && reviewSheet.getLastRow() > 1
    ? reviewSheet.getRange(2, 8, reviewSheet.getLastRow() - 1, 1).getValues().filter(function (row) { return row[0] !== "완료"; }).length
    : 0;

  sheet.clear();
  sheet.getRange("A1:F1").merge().setValue("ECO QUEST · 우리 마을 생태지도");
  sheet.getRange("A1:F1").setBackground("#173f35").setFontColor("#ffffff").setFontSize(18).setFontWeight("bold");
  sheet.getRange("A3:D3").setValues([["참여 학생", "공동 관찰", "완성 도감", "검토 필요"]]);
  sheet.getRange("A4:D4").setValues([[studentRows, observationRows, guideRows, pendingReviews]]);
  sheet.getRange("A3:D3").setBackground("#d7e9b9").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("A4:D4").setFontSize(20).setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("A6:F6").setValues([["반", "학생", "공동 관찰", "완성 도감", "기본 완료 학생", "업데이트"]]);
  sheet.getRange("A6:F6").setBackground("#f2c94c").setFontWeight("bold");

  const students = rows_(spreadsheet.getSheetByName(ECO_SHEETS.STUDENTS.name), ECO_SHEETS.STUDENTS.headers.length);
  const observations = rows_(spreadsheet.getSheetByName(ECO_SHEETS.OBSERVATIONS.name), ECO_SHEETS.OBSERVATIONS.headers.length);
  const guides = rows_(spreadsheet.getSheetByName(ECO_SHEETS.GUIDES.name), ECO_SHEETS.GUIDES.headers.length);
  const submissions = rows_(spreadsheet.getSheetByName(ECO_SHEETS.SUBMISSIONS.name), ECO_SHEETS.SUBMISSIONS.headers.length);
  const updatedAt = new Date();
  const classRows = [];
  for (let classNumber = 1; classNumber <= 9; classNumber += 1) {
    classRows.push([
      classNumber + "반",
      students.filter(function (row) { return Number(row[1]) === classNumber; }).length,
      observations.filter(function (row) { return Number(row[2]) === classNumber; }).length,
      guides.filter(function (row) { return Number(row[3]) === classNumber && String(row[16]) === "완료"; }).length,
      submissions.filter(function (row) { return Number(row[1]) === classNumber && Number(row[6]) >= 3; }).length,
      updatedAt
    ]);
  }
  sheet.getRange(7, 1, classRows.length, classRows[0].length).setValues(classRows);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 6, 120);
  sheet.setColumnWidth(1, 150);
  sheet.getRange("F7:F15").setNumberFormat("yyyy-mm-dd hh:mm");
}

function rows_(sheet, width) {
  return !sheet || sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function dataRowCount_(sheet) {
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function appendAudit_(eventId, type, targetId, result) {
  const spreadsheet = getEcoSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(ECO_SHEETS.AUDIT.name);
  if (sheet) sheet.appendRow([eventId, new Date(), safeCell_(type || ""), targetId || "", safeCell_(result || "")]);
}

function getEcoSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("ECO_SPREADSHEET_ID");
  if (!id) throw new Error("초기 설정이 필요합니다.");
  return SpreadsheetApp.openById(id);
}

function parseBody_(event) {
  if (!event || !event.postData || !event.postData.contents) throw new Error("요청 본문이 없습니다.");
  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error("JSON 요청만 허용됩니다.");
  }
}

function verifySecret_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty("ECO_WEBHOOK_SECRET");
  if (!expected || !provided || String(provided) !== String(expected)) throw new Error("인증에 실패했습니다.");
}

function requireFields_(data, fields) {
  fields.forEach(function (field) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      throw new Error(field + " 값이 필요합니다.");
    }
  });
}

function safeCell_(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function safeUrl_(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return /^https:\/\//i.test(text) ? text : "";
}

function toDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? "" : date;
}

function createSecret_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function normalizeGuideLimit_(value) {
  return Number(value) === 5 ? 5 : 3;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
