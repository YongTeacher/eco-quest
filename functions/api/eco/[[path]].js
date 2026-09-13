const COOKIE_NAME = "eco_session";
const SESSION_SECONDS = 60 * 60 * 10;
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const CATEGORIES = new Set(["plant", "insect", "bird", "animal", "water", "fungi", "etc"]);
const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"]
]);

export async function onRequest(context) {
  try {
    return await route(context);
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status);
    console.error("eco-api", error);
    return json({ ok: false, error: "서버 처리 중 오류가 발생했습니다." }, 500);
  }
}

async function route(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/eco\/?/, "").replace(/\/$/, "");
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method === "GET" && path === "health") return health(env);
  requireBindings(env, ["ECO_DB"]);

  if (method === "POST" && path === "auth/student") return studentLogin(context);
  if (method === "POST" && path === "auth/teacher") return teacherLogin(context);
  if (method === "POST" && path === "auth/logout") return logout(context);

  const user = await requireUser(context);
  if (method === "GET" && path === "me") return json({ ok: true, user: publicUser(user) });
  if (method === "GET" && path === "observations") return listObservations(context, user);
  if (method === "POST" && path === "observations") return createObservation(context, user);

  const photoMatch = path.match(/^photos\/([0-9a-f-]{36})$/i);
  if (method === "GET" && photoMatch) return getPhoto(context, photoMatch[1]);

  if (method === "GET" && path === "guides") return listGuides(context, user);
  if (method === "POST" && path === "guides") return createGuide(context, user);
  if (method === "GET" && path === "admin/overview") return adminOverview(context, user);
  if (method === "POST" && path === "admin/sync") return retrySheetSync(context, user);

  const guideLimitMatch = path.match(/^admin\/students\/([0-9a-f-]{36})\/guide-limit$/i);
  if (method === "PATCH" && guideLimitMatch) return updateGuideLimit(context, user, guideLimitMatch[1]);

  return json({ ok: false, error: "요청한 API를 찾을 수 없습니다." }, 404);
}

function health(env) {
  const bindings = {
    database: Boolean(env.ECO_DB),
    photos: Boolean(env.ECO_PHOTOS),
    classCode: Boolean(env.ECO_CLASS_CODE),
    authPepper: Boolean(env.ECO_AUTH_PEPPER),
    adminPassword: Boolean(env.ECO_ADMIN_PASSWORD),
    sheetsUrl: Boolean(env.ECO_SHEETS_WEBHOOK_URL),
    sheetsSecret: Boolean(env.ECO_SHEETS_WEBHOOK_SECRET)
  };
  return json({ ok: true, service: "eco-quest-api", ready: Object.values(bindings).every(Boolean), bindings });
}

async function studentLogin(context) {
  const { request, env } = context;
  requireBindings(env, ["ECO_DB", "ECO_CLASS_CODE", "ECO_AUTH_PEPPER"]);
  const body = await readJson(request);
  const classNumber = integer(body.class_number, 1, 9, "반");
  const studentNumber = integer(body.student_number, 1, 99, "번호");
  const groupNumber = integer(body.group_number, 1, 20, "모둠");
  const studentName = text(body.student_name, 2, 30, "이름");
  const pin = String(body.pin || "");
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: "PIN은 숫자 4자리로 입력해 주세요." }, 400);
  if (!(await secretsEqual(String(body.class_code || ""), env.ECO_CLASS_CODE))) {
    return json({ ok: false, error: "수업 코드가 올바르지 않습니다." }, 401);
  }

  const now = new Date().toISOString();
  let student = await env.ECO_DB.prepare(
    "SELECT * FROM students WHERE class_number = ? AND student_number = ?"
  ).bind(classNumber, studentNumber).first();

  if (student) {
    if (student.status !== "active") return json({ ok: false, error: "사용이 중지된 계정입니다." }, 403);
    const pinHash = await hashPin(pin, student.pin_salt, env.ECO_AUTH_PEPPER);
    if (!(await secretsEqual(pinHash, student.pin_hash))) {
      return json({ ok: false, error: "PIN이 올바르지 않습니다." }, 401);
    }
    await env.ECO_DB.prepare(
      "UPDATE students SET group_number = ?, last_login_at = ?, updated_at = ? WHERE id = ?"
    ).bind(groupNumber, now, now, student.id).run();
    student = { ...student, group_number: groupNumber, last_login_at: now, updated_at: now };
  } else {
    const id = crypto.randomUUID();
    const salt = randomHex(16);
    const pinHash = await hashPin(pin, salt, env.ECO_AUTH_PEPPER);
    await env.ECO_DB.prepare(
      "INSERT INTO students (id, class_number, student_number, student_name, group_number, pin_salt, pin_hash, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, classNumber, studentNumber, studentName, groupNumber, salt, pinHash, now, now, now).run();
    student = {
      id, class_number: classNumber, student_number: studentNumber, student_name: studentName,
      group_number: groupNumber, guide_limit: 3, status: "active", created_at: now,
      updated_at: now, last_login_at: now
    };
  }

  const sync = makeSyncEvent("student.upsert", student.id, studentSheetData(student));
  await putSyncEvent(env.ECO_DB, sync);
  context.waitUntil(syncSheetEvent(env, sync));
  const session = await createSession(env.ECO_DB, "student", student.id);
  return withSession(json({ ok: true, user: publicUser({ ...student, role: "student" }) }), session.token);
}

async function teacherLogin({ request, env }) {
  requireBindings(env, ["ECO_DB", "ECO_ADMIN_PASSWORD"]);
  const body = await readJson(request);
  if (!(await secretsEqual(String(body.password || ""), env.ECO_ADMIN_PASSWORD))) {
    return json({ ok: false, error: "관리자 비밀번호가 올바르지 않습니다." }, 401);
  }
  const session = await createSession(env.ECO_DB, "teacher", null);
  return withSession(json({ ok: true, user: { role: "teacher", name: "교사 관리자" } }), session.token);
}

async function logout({ request, env }) {
  if (env.ECO_DB) {
    const token = readCookie(request.headers.get("Cookie") || "", COOKIE_NAME);
    if (token) await env.ECO_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  return withExpiredSession(json({ ok: true }));
}

async function requireUser({ request, env }) {
  const token = readCookie(request.headers.get("Cookie") || "", COOKIE_NAME);
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  const now = new Date().toISOString();
  const session = await env.ECO_DB.prepare(
    "SELECT s.role, s.student_id, s.expires_at, st.class_number, st.student_number, st.student_name, st.group_number, st.guide_limit, st.status FROM sessions s LEFT JOIN students st ON st.id = s.student_id WHERE s.token_hash = ?"
  ).bind(await sha256(token)).first();
  if (!session || session.expires_at <= now || (session.role === "student" && session.status !== "active")) {
    throw new HttpError(401, "로그인이 만료되었습니다.");
  }
  return session.role === "teacher"
    ? { role: "teacher", name: "교사 관리자" }
    : { role: "student", id: session.student_id, class_number: session.class_number, student_number: session.student_number, student_name: session.student_name, group_number: session.group_number, guide_limit: session.guide_limit };
}

async function listObservations({ request, env }, user) {
  const url = new URL(request.url);
  const requestedClass = url.searchParams.get("class");
  const category = url.searchParams.get("category");
  const clauses = [];
  const values = [];
  if (requestedClass && requestedClass !== "all") {
    clauses.push("class_number = ?");
    values.push(integer(requestedClass, 1, 9, "반"));
  }
  if (category && category !== "all") {
    if (!CATEGORIES.has(category)) return json({ ok: false, error: "생물 분류가 올바르지 않습니다." }, 400);
    clauses.push("category = ?");
    values.push(category);
  }
  const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
  const result = await env.ECO_DB.prepare(
    "SELECT id, class_number, group_number, student_id, student_name, latitude, longitude, place_name, category, species_name, scientific_name, features, identification_status, review_status, created_at, updated_at FROM observations" + where + " ORDER BY created_at DESC LIMIT 1000"
  ).bind(...values).all();
  const origin = new URL(request.url).origin;
  return json({ ok: true, observations: result.results.map(function (row) { return { ...row, photo_url: origin + "/api/eco/photos/" + row.id }; }), viewer: user.role });
}

async function createObservation(context, user) {
  const { request, env } = context;
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  requireBindings(env, ["ECO_PHOTOS", "ECO_SHEETS_WEBHOOK_URL", "ECO_SHEETS_WEBHOOK_SECRET"]);
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) return json({ ok: false, error: "대표 사진을 선택해 주세요." }, 400);
  if (photo.size > PHOTO_MAX_BYTES) return json({ ok: false, error: "대표 사진은 8MB 이하여야 합니다." }, 413);
  const extension = PHOTO_TYPES.get(photo.type);
  if (!extension) return json({ ok: false, error: "JPG, PNG, WEBP 또는 HEIC 사진만 등록할 수 있습니다." }, 400);

  const latitude = decimal(form.get("latitude"), -90, 90, "위도");
  const longitude = decimal(form.get("longitude"), -180, 180, "경도");
  const placeName = text(form.get("place_name"), 2, 100, "구체적인 장소");
  const category = String(form.get("category") || "");
  if (!CATEGORIES.has(category)) return json({ ok: false, error: "생물 분류를 선택해 주세요." }, 400);
  const speciesName = text(form.get("species_name"), 1, 80, "생물 이름");
  const scientificName = optionalText(form.get("scientific_name"), 120, "학명");
  const features = text(form.get("features"), 5, 1000, "관찰 특징");
  const reason = text(form.get("identification_reason"), 5, 1500, "동정 근거");
  const source = text(form.get("source"), 2, 500, "참고 자료");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const photoKey = "observations/" + id + "." + extension;

  await env.ECO_PHOTOS.put(photoKey, photo.stream(), {
    httpMetadata: { contentType: photo.type },
    customMetadata: { observationId: id, studentId: user.id }
  });

  const origin = new URL(request.url).origin;
  const observation = {
    id,
    observation_id: id,
    created_at: now,
    updated_at: now,
    class_number: user.class_number,
    group_number: user.group_number,
    student_id: user.id,
    student_name: user.student_name,
    latitude,
    longitude,
    place_name: placeName,
    category,
    species_name: speciesName,
    scientific_name: scientificName,
    features,
    identification_reason: reason,
    source,
    photo_url: origin + "/api/eco/photos/" + id,
    identification_status: "학생 동정",
    review_status: "정상"
  };
  const sync = makeSyncEvent("observation.upsert", id, observation);
  try {
    await env.ECO_DB.batch([
      env.ECO_DB.prepare(
        "INSERT INTO observations (id, class_number, group_number, student_id, student_name, latitude, longitude, place_name, category, species_name, scientific_name, features, identification_reason, source, photo_key, photo_mime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, user.class_number, user.group_number, user.id, user.student_name, latitude, longitude, placeName, category, speciesName, scientificName, features, reason, source, photoKey, photo.type, now, now),
      syncStatement(env.ECO_DB, sync)
    ]);
  } catch (error) {
    await env.ECO_PHOTOS.delete(photoKey);
    throw error;
  }
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, observation }, 201);
}

async function getPhoto({ env }, id) {
  requireBindings(env, ["ECO_PHOTOS"]);
  const record = await env.ECO_DB.prepare("SELECT photo_key, photo_mime FROM observations WHERE id = ?").bind(id).first();
  if (!record) return json({ ok: false, error: "사진을 찾을 수 없습니다." }, 404);
  const object = await env.ECO_PHOTOS.get(record.photo_key);
  if (!object) return json({ ok: false, error: "사진 파일을 찾을 수 없습니다." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata && object.httpMetadata.contentType || record.photo_mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function listGuides({ request, env }, user) {
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  const result = await env.ECO_DB.prepare(
    "SELECT g.*, o.species_name, o.scientific_name, o.category FROM field_guides g JOIN observations o ON o.id = g.observation_id WHERE g.student_id = ? ORDER BY g.updated_at DESC"
  ).bind(user.id).all();
  const origin = new URL(request.url).origin;
  return json({ ok: true, guides: result.results.map(function (row) { return { ...row, photo_url: origin + "/api/eco/photos/" + row.observation_id }; }), guide_limit: user.guide_limit });
}

async function createGuide(context, user) {
  const { request, env } = context;
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  const body = await readJson(request);
  const observationId = String(body.observation_id || "");
  const observation = await env.ECO_DB.prepare("SELECT * FROM observations WHERE id = ?").bind(observationId).first();
  if (!observation) return json({ ok: false, error: "공동 관찰 기록을 찾을 수 없습니다." }, 404);
  const existing = await env.ECO_DB.prepare("SELECT id FROM field_guides WHERE student_id = ? AND observation_id = ?").bind(user.id, observationId).first();
  const count = await env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM field_guides WHERE student_id = ?").bind(user.id).first();
  if (!existing && Number(count.count) >= Number(user.guide_limit)) {
    return json({ ok: false, error: "허용된 생물도감 수를 모두 작성했습니다." }, 409);
  }
  const now = new Date().toISOString();
  const id = existing ? existing.id : crypto.randomUUID();
  const data = {
    guide_id: id,
    created_at: now,
    updated_at: now,
    student_id: user.id,
    class_number: user.class_number,
    student_number: user.student_number,
    student_name: user.student_name,
    observation_id: observationId,
    species_name: observation.species_name,
    scientific_name: observation.scientific_name,
    category: observation.category,
    habitat: text(body.habitat, 5, 1000, "서식지"),
    key_features: text(body.key_features, 5, 1500, "주요 특징"),
    ecological_role: text(body.ecological_role, 5, 1500, "생태계 역할"),
    report: text(body.report, 20, 5000, "조사 내용"),
    source: text(body.source, 2, 500, "참고 자료"),
    photo_url: new URL(request.url).origin + "/api/eco/photos/" + observationId,
    status: "완료"
  };
  const sync = makeSyncEvent("guide.upsert", id, data);
  await env.ECO_DB.batch([
    env.ECO_DB.prepare(
      "INSERT INTO field_guides (id, student_id, observation_id, habitat, key_features, ecological_role, report, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '완료', ?, ?) ON CONFLICT(student_id, observation_id) DO UPDATE SET habitat = excluded.habitat, key_features = excluded.key_features, ecological_role = excluded.ecological_role, report = excluded.report, source = excluded.source, status = '완료', updated_at = excluded.updated_at"
    ).bind(id, user.id, observationId, data.habitat, data.key_features, data.ecological_role, data.report, data.source, now, now),
    syncStatement(env.ECO_DB, sync)
  ]);
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, guide: data }, existing ? 200 : 201);
}

async function adminOverview({ env }, user) {
  requireTeacher(user);
  const [students, observations, guides, pending] = await Promise.all([
    env.ECO_DB.prepare("SELECT class_number, COUNT(*) AS count FROM students WHERE status = 'active' GROUP BY class_number").all(),
    env.ECO_DB.prepare("SELECT class_number, COUNT(*) AS count FROM observations GROUP BY class_number").all(),
    env.ECO_DB.prepare("SELECT st.class_number, COUNT(*) AS count FROM field_guides g JOIN students st ON st.id = g.student_id WHERE g.status = '완료' GROUP BY st.class_number").all(),
    env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM sheet_sync_queue WHERE status != 'synced'").first()
  ]);
  const classes = Array.from({ length: 9 }, function (_, index) {
    const classNumber = index + 1;
    return {
      class_number: classNumber,
      students: countFor(students.results, classNumber),
      observations: countFor(observations.results, classNumber),
      guides: countFor(guides.results, classNumber)
    };
  });
  return json({ ok: true, classes, pending_sync: Number(pending.count || 0) });
}

async function updateGuideLimit(context, user, studentId) {
  const { request, env } = context;
  requireTeacher(user);
  const body = await readJson(request);
  const limit = Number(body.guide_limit) === 5 ? 5 : Number(body.guide_limit) === 3 ? 3 : 0;
  if (!limit) return json({ ok: false, error: "도감 허용 수는 3 또는 5만 가능합니다." }, 400);
  const now = new Date().toISOString();
  const result = await env.ECO_DB.prepare("UPDATE students SET guide_limit = ?, updated_at = ? WHERE id = ?").bind(limit, now, studentId).run();
  if (!result.meta.changes) return json({ ok: false, error: "학생을 찾을 수 없습니다." }, 404);
  const student = await env.ECO_DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first();
  const sync = makeSyncEvent("student.upsert", studentId, studentSheetData(student));
  await putSyncEvent(env.ECO_DB, sync);
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, guide_limit: limit });
}

async function retrySheetSync(context, user) {
  requireTeacher(user);
  const result = await context.env.ECO_DB.prepare(
    "SELECT * FROM sheet_sync_queue WHERE status != 'synced' ORDER BY created_at LIMIT 50"
  ).all();
  let synced = 0;
  for (const row of result.results) {
    const event = { event_id: row.event_id, type: row.event_type, target_id: row.target_id, data: JSON.parse(row.payload) };
    if (await syncSheetEvent(context.env, event)) synced += 1;
  }
  return json({ ok: true, attempted: result.results.length, synced });
}

async function createSession(db, role, studentId) {
  const token = randomHex(32);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_SECONDS * 1000);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()),
    db.prepare("INSERT INTO sessions (token_hash, role, student_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), role, studentId, now.toISOString(), expires.toISOString())
  ]);
  return { token, expires };
}

function makeSyncEvent(type, targetId, data) {
  return { event_id: crypto.randomUUID(), type, target_id: targetId, data };
}

function syncStatement(db, event) {
  const now = new Date().toISOString();
  return db.prepare("INSERT INTO sheet_sync_queue (event_id, event_type, target_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(event.event_id, event.type, event.target_id, JSON.stringify(event.data), now, now);
}

async function putSyncEvent(db, event) {
  await syncStatement(db, event).run();
}

async function syncSheetEvent(env, event) {
  if (!env.ECO_SHEETS_WEBHOOK_URL || !env.ECO_SHEETS_WEBHOOK_SECRET) return false;
  try {
    const response = await fetch(env.ECO_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.ECO_SHEETS_WEBHOOK_SECRET, event_id: event.event_id, type: event.type, data: event.data }),
      redirect: "follow"
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Google Sheets 응답 오류");
    await env.ECO_DB.prepare("UPDATE sheet_sync_queue SET status = 'synced', attempts = attempts + 1, last_error = '', updated_at = ? WHERE event_id = ?")
      .bind(new Date().toISOString(), event.event_id).run();
    return true;
  } catch (error) {
    await env.ECO_DB.prepare("UPDATE sheet_sync_queue SET status = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE event_id = ?")
      .bind(String(error.message || error).slice(0, 500), new Date().toISOString(), event.event_id).run();
    console.error("sheet-sync", event.event_id, error);
    return false;
  }
}

function studentSheetData(student) {
  return {
    student_id: student.id,
    class_number: student.class_number,
    student_number: student.student_number,
    student_name: student.student_name,
    group_number: student.group_number,
    guide_limit: student.guide_limit || 3,
    status: student.status === "disabled" ? "중지" : "활동",
    created_at: student.created_at,
    last_login_at: student.last_login_at
  };
}

function publicUser(user) {
  if (user.role === "teacher") return { role: "teacher", name: user.name };
  return {
    role: "student",
    id: user.id,
    class_number: Number(user.class_number),
    student_number: Number(user.student_number),
    student_name: user.student_name,
    group_number: Number(user.group_number),
    guide_limit: Number(user.guide_limit || 3)
  };
}

function requireTeacher(user) {
  if (user.role !== "teacher") throw new HttpError(403, "교사 관리자 권한이 필요합니다.");
}

function requireBindings(env, names) {
  const missing = names.filter(function (name) { return !env[name]; });
  if (missing.length) throw new HttpError(503, "서버 설정이 아직 완료되지 않았습니다: " + missing.join(", "));
}

async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "JSON 요청만 허용됩니다.");
  try { return await request.json(); } catch (_error) { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
}

function text(value, min, max, label) {
  const result = String(value || "").trim();
  if (result.length < min || result.length > max) throw new HttpError(400, label + "을(를) " + min + "~" + max + "자로 입력해 주세요.");
  return result;
}

function optionalText(value, max, label) {
  const result = String(value || "").trim();
  if (result.length > max) throw new HttpError(400, label + "은(는) " + max + "자 이하여야 합니다.");
  return result;
}

function integer(value, min, max, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, label + " 값이 올바르지 않습니다.");
  return number;
}

function decimal(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, label + " 값이 올바르지 않습니다.");
  return number;
}

function countFor(rows, classNumber) {
  const item = rows.find(function (row) { return Number(row.class_number) === classNumber; });
  return item ? Number(item.count) : 0;
}

function json(value, status) {
  return new Response(JSON.stringify(value), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function withSession(response, token) {
  response.headers.append("Set-Cookie", COOKIE_NAME + "=" + token + "; Path=/; Max-Age=" + SESSION_SECONDS + "; HttpOnly; Secure; SameSite=Strict");
  return response;
}

function withExpiredSession(response) {
  response.headers.append("Set-Cookie", COOKIE_NAME + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
  return response;
}

function readCookie(header, name) {
  const prefix = name + "=";
  const item = header.split(";").map(function (part) { return part.trim(); }).find(function (part) { return part.startsWith(prefix); });
  return item ? item.slice(prefix.length) : "";
}

async function hashPin(pin, salt, pepper) {
  return sha256(salt + ":" + pin + ":" + pepper);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return hex(new Uint8Array(digest));
}

async function secretsEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return hex(values);
}

function hex(values) {
  return Array.from(values, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
