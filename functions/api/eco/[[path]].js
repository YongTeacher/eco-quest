const COOKIE_NAME = "eco_session";
const SESSION_SECONDS = 60 * 60 * 10;
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const THUMBNAIL_MAX_BYTES = 150 * 1024;
const CATEGORIES = new Set(["plant", "insect", "bird", "animal", "water", "fungi", "etc"]);
let rosterSchemaPromise;
let reflectionSchemaPromise;
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
  const observationEditMatch = path.match(/^observations\/([0-9a-f-]{36})$/i);
  if (method === "PATCH" && observationEditMatch) return updateObservation(context, user, observationEditMatch[1]);

  const photoMatch = path.match(/^photos\/([0-9a-f-]{36})$/i);
  if (method === "GET" && photoMatch) return getPhoto(context, photoMatch[1]);

  if (method === "GET" && path === "guides") return listGuides(context, user);
  if (method === "POST" && path === "guides") return createGuide(context, user);
  if (method === "GET" && path === "reflection") return getReflection(context, user);
  if (method === "POST" && path === "reflection") return saveReflection(context, user);
  if (method === "GET" && path === "admin/overview") return adminOverview(context, user);
  if (method === "GET" && path === "admin/guides") return listAdminGuides(context, user);
  if (method === "GET" && path === "admin/reflections") return listAdminReflections(context, user);
  if (method === "PATCH" && path === "admin/reflections/settings") return updateReflectionSettings(context, user);
  if (method === "GET" && path === "admin/roster") return listRoster(context, user);
  if (method === "POST" && path === "admin/roster/import") return importRoster(context, user);
  if (method === "POST" && path === "admin/roster/groups") return updateRosterGroups(context, user);
  if (method === "DELETE" && path === "admin/test-account") return deleteTestAccount(context, user);
  const rosterGroupMatch = path.match(/^admin\/roster\/([0-9a-f-]{36})\/group$/i);
  if (method === "PATCH" && rosterGroupMatch) return updateRosterGroup(context, user, rosterGroupMatch[1]);
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
  await ensureRosterSchema(env);
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

  const rosterCount = await env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM student_roster WHERE class_number = ? AND status = 'active'").bind(classNumber).first();
  let rosterStudent = null;
  if (Number(rosterCount.count || 0) > 0) {
    rosterStudent = await env.ECO_DB.prepare(
      "SELECT * FROM student_roster WHERE class_number = ? AND student_number = ?"
    ).bind(classNumber, studentNumber).first();
    if (!rosterStudent || rosterStudent.status !== "active" || rosterStudent.normalized_name !== normalizeStudentName(studentName)) {
      return json({ ok: false, error: "사전 등록된 학생 명단과 정보가 일치하지 않습니다. 반·번호·이름·모둠을 다시 확인해 주세요." }, 403);
    }
    if (rosterStudent.group_number === null || rosterStudent.group_number === undefined) {
      return json({ ok: false, error: "아직 모둠이 배정되지 않았습니다. 담당 선생님께 모둠 배정을 요청해 주세요." }, 403);
    }
    if (Number(rosterStudent.group_number) !== groupNumber) {
      return json({ ok: false, error: "사전 등록된 모둠과 입력한 모둠이 다릅니다. 모둠 번호를 다시 확인해 주세요." }, 403);
    }
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
    const canonicalName = rosterStudent ? rosterStudent.student_name : student.student_name;
    const canonicalGroup = rosterStudent ? Number(rosterStudent.group_number) : groupNumber;
    await env.ECO_DB.prepare(
      "UPDATE students SET student_name = ?, group_number = ?, last_login_at = ?, updated_at = ? WHERE id = ?"
    ).bind(canonicalName, canonicalGroup, now, now, student.id).run();
    student = { ...student, student_name: canonicalName, group_number: canonicalGroup, last_login_at: now, updated_at: now };
  } else {
    const id = rosterStudent ? rosterStudent.id : crypto.randomUUID();
    const canonicalName = rosterStudent ? rosterStudent.student_name : studentName;
    const canonicalGroup = rosterStudent ? Number(rosterStudent.group_number) : groupNumber;
    const salt = randomHex(16);
    const pinHash = await hashPin(pin, salt, env.ECO_AUTH_PEPPER);
    await env.ECO_DB.prepare(
      "INSERT INTO students (id, class_number, student_number, student_name, group_number, pin_salt, pin_hash, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, classNumber, studentNumber, canonicalName, canonicalGroup, salt, pinHash, now, now, now).run();
    student = {
      id, class_number: classNumber, student_number: studentNumber, student_name: canonicalName,
      group_number: canonicalGroup, guide_limit: 3, status: "active", created_at: now,
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
    "SELECT id, class_number, group_number, student_id, student_name, latitude, longitude, place_name, category, species_name, scientific_name, features, identification_reason, source, identification_status, review_status, created_at, updated_at FROM observations" + where + " ORDER BY created_at DESC LIMIT 1000"
  ).bind(...values).all();
  const origin = new URL(request.url).origin;
  return json({ ok: true, observations: result.results.map(function (row) { return { ...row, photo_url: origin + "/api/eco/photos/" + row.id + "?v=" + encodeURIComponent(row.updated_at) }; }), viewer: user.role });
}

async function createObservation(context, user) {
  const { request, env } = context;
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  requireBindings(env, ["ECO_PHOTOS", "ECO_SHEETS_WEBHOOK_URL", "ECO_SHEETS_WEBHOOK_SECRET"]);
  const form = await request.formData();
  const photo = form.get("photo");
  const thumbnail = validThumbnail(form.get("thumbnail"));
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

  try {
    await env.ECO_PHOTOS.put(photoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type },
      customMetadata: { observationId: id, studentId: user.id }
    });
    if (thumbnail) await env.ECO_PHOTOS.put(photoKey + ".thumb.webp", thumbnail.stream(), {
      httpMetadata: { contentType: "image/webp" }
    });
  } catch (error) {
    await env.ECO_PHOTOS.delete(photoKey);
    if (thumbnail) await env.ECO_PHOTOS.delete(photoKey + ".thumb.webp");
    throw error;
  }

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
    if (thumbnail) await env.ECO_PHOTOS.delete(photoKey + ".thumb.webp");
    throw error;
  }
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, observation }, 201);
}

function validThumbnail(value) {
  if (value == null) return null;
  if (!(value instanceof File) || value.type !== "image/webp" || !value.size || value.size > THUMBNAIL_MAX_BYTES) {
    throw new HttpError(400, "지도용 사진 형식이 올바르지 않습니다.");
  }
  return value;
}

async function getPhoto({ request, env }, id) {
  requireBindings(env, ["ECO_PHOTOS"]);
  const record = await env.ECO_DB.prepare("SELECT photo_key, photo_mime FROM observations WHERE id = ?").bind(id).first();
  if (!record) return json({ ok: false, error: "사진을 찾을 수 없습니다." }, 404);
  const wantsThumbnail = new URL(request.url).searchParams.get("thumb") === "1";
  const thumbnail = wantsThumbnail ? await env.ECO_PHOTOS.get(record.photo_key + ".thumb.webp") : null;
  const object = thumbnail || await env.ECO_PHOTOS.get(record.photo_key);
  if (!object) return json({ ok: false, error: "사진 파일을 찾을 수 없습니다." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": thumbnail ? "image/webp" : object.httpMetadata && object.httpMetadata.contentType || record.photo_mime,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function listGuides({ request, env }, user) {
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  const result = await env.ECO_DB.prepare(
    "SELECT g.*, o.species_name, o.scientific_name, o.category, o.place_name, o.latitude, o.longitude, o.student_name AS discoverer_name, o.created_at AS observed_at, o.updated_at AS observation_updated_at FROM field_guides g JOIN observations o ON o.id = g.observation_id WHERE g.student_id = ? ORDER BY g.updated_at DESC"
  ).bind(user.id).all();
  const origin = new URL(request.url).origin;
  return json({ ok: true, guides: result.results.map(function (row) { return { ...row, photo_url: origin + "/api/eco/photos/" + row.observation_id + "?v=" + encodeURIComponent(row.observation_updated_at) }; }), guide_limit: user.guide_limit });
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
    place_name: observation.place_name,
    latitude: observation.latitude,
    longitude: observation.longitude,
    discoverer_name: observation.student_name,
    observed_at: observation.created_at,
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

async function ensureRosterSchema(env) {
  if (!rosterSchemaPromise) {
    rosterSchemaPromise = (async function () {
      await env.ECO_DB.prepare(
        "CREATE TABLE IF NOT EXISTS student_roster (id TEXT PRIMARY KEY, class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9), student_number INTEGER NOT NULL CHECK (student_number BETWEEN 1 AND 99), student_name TEXT NOT NULL, normalized_name TEXT NOT NULL, group_number INTEGER CHECK (group_number IS NULL OR group_number BETWEEN 1 AND 20), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (class_number, student_number))"
      ).run();
      const columns = await env.ECO_DB.prepare("PRAGMA table_info(student_roster)").all();
      const groupColumn = columns.results.find(function (column) { return column.name === "group_number"; });
      if (groupColumn && Number(groupColumn.notnull) === 1) {
        await env.ECO_DB.batch([
          env.ECO_DB.prepare("CREATE TABLE IF NOT EXISTS student_roster_next (id TEXT PRIMARY KEY, class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9), student_number INTEGER NOT NULL CHECK (student_number BETWEEN 1 AND 99), student_name TEXT NOT NULL, normalized_name TEXT NOT NULL, group_number INTEGER CHECK (group_number IS NULL OR group_number BETWEEN 1 AND 20), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (class_number, student_number))"),
          env.ECO_DB.prepare("INSERT OR REPLACE INTO student_roster_next (id, class_number, student_number, student_name, normalized_name, group_number, status, created_at, updated_at) SELECT id, class_number, student_number, student_name, normalized_name, group_number, status, created_at, updated_at FROM student_roster"),
          env.ECO_DB.prepare("DROP TABLE student_roster"),
          env.ECO_DB.prepare("ALTER TABLE student_roster_next RENAME TO student_roster")
        ]);
      }
      await env.ECO_DB.batch([
        env.ECO_DB.prepare("CREATE INDEX IF NOT EXISTS idx_student_roster_class ON student_roster(class_number, student_number)"),
        env.ECO_DB.prepare("CREATE INDEX IF NOT EXISTS idx_student_roster_status ON student_roster(status)")
      ]);
    }()).catch(function (error) {
      rosterSchemaPromise = null;
      throw error;
    });
  }
  await rosterSchemaPromise;
}

async function updateObservation(context, user, id) {
  const { request, env } = context;
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  const original = await env.ECO_DB.prepare("SELECT * FROM observations WHERE id = ?").bind(id).first();
  if (!original) return json({ ok: false, error: "관찰 기록을 찾을 수 없습니다." }, 404);
  if (original.student_id !== user.id) return json({ ok: false, error: "본인이 등록한 관찰 기록만 수정할 수 있습니다." }, 403);
  const relatedGuides = await env.ECO_DB.prepare(
    "SELECT g.*, s.class_number, s.student_number, s.student_name FROM field_guides g JOIN students s ON s.id = g.student_id WHERE g.observation_id = ?"
  ).bind(id).all();
  const form = await request.formData();
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
  const photo = form.get("photo");
  const thumbnail = photo instanceof File && photo.size ? validThumbnail(form.get("thumbnail")) : null;
  let photoKey = original.photo_key;
  let photoMime = original.photo_mime;
  let newPhotoKey = null;
  if (photo instanceof File && photo.size) {
    requireBindings(env, ["ECO_PHOTOS"]);
    if (photo.size > PHOTO_MAX_BYTES) return json({ ok: false, error: "대표 사진은 8MB 이하여야 합니다." }, 413);
    const extension = PHOTO_TYPES.get(photo.type);
    if (!extension) return json({ ok: false, error: "JPG, PNG, WEBP 또는 HEIC 사진만 등록할 수 있습니다." }, 400);
    newPhotoKey = "observations/" + id + "-" + crypto.randomUUID() + "." + extension;
    try {
      await env.ECO_PHOTOS.put(newPhotoKey, photo.stream(), {
        httpMetadata: { contentType: photo.type },
        customMetadata: { observationId: id, studentId: user.id }
      });
      if (thumbnail) await env.ECO_PHOTOS.put(newPhotoKey + ".thumb.webp", thumbnail.stream(), {
        httpMetadata: { contentType: "image/webp" }
      });
    } catch (error) {
      await env.ECO_PHOTOS.delete(newPhotoKey);
      if (thumbnail) await env.ECO_PHOTOS.delete(newPhotoKey + ".thumb.webp");
      throw error;
    }
    photoKey = newPhotoKey;
    photoMime = photo.type;
  }
  const now = new Date().toISOString();
  const origin = new URL(request.url).origin;
  const observation = {
    id, observation_id: id, class_number: original.class_number, group_number: original.group_number,
    student_id: original.student_id, student_name: original.student_name,
    created_at: original.created_at, latitude, longitude, place_name: placeName,
    category, species_name: speciesName, scientific_name: scientificName,
    features, identification_reason: reason, source,
    identification_status: original.identification_status, review_status: original.review_status,
    photo_url: origin + "/api/eco/photos/" + id + "?v=" + encodeURIComponent(now), updated_at: now
  };
  const sync = makeSyncEvent("observation.upsert", id, observation);
  const guideSyncEvents = relatedGuides.results.map(function (guide) {
    return makeSyncEvent("guide.upsert", guide.id, {
      guide_id: guide.id, created_at: guide.created_at, updated_at: guide.updated_at,
      student_id: guide.student_id, class_number: guide.class_number,
      student_number: guide.student_number, student_name: guide.student_name,
      observation_id: id, species_name: speciesName, scientific_name: scientificName,
      category, place_name: placeName, latitude, longitude,
      habitat: guide.habitat, key_features: guide.key_features,
      ecological_role: guide.ecological_role, report: guide.report,
      source: guide.source, status: guide.status, photo_url: observation.photo_url
    });
  });
  try {
    await env.ECO_DB.batch([
      env.ECO_DB.prepare("UPDATE observations SET latitude = ?, longitude = ?, place_name = ?, category = ?, species_name = ?, scientific_name = ?, features = ?, identification_reason = ?, source = ?, photo_key = ?, photo_mime = ?, updated_at = ? WHERE id = ? AND student_id = ?")
        .bind(latitude, longitude, placeName, category, speciesName, scientificName, features, reason, source, photoKey, photoMime, now, id, user.id),
      syncStatement(env.ECO_DB, sync)
    ]);
  } catch (error) {
    if (newPhotoKey) {
      await env.ECO_PHOTOS.delete(newPhotoKey);
      if (thumbnail) await env.ECO_PHOTOS.delete(newPhotoKey + ".thumb.webp");
    }
    throw error;
  }
  if (newPhotoKey && original.photo_key !== newPhotoKey) {
    context.waitUntil(env.ECO_PHOTOS.delete(original.photo_key));
    context.waitUntil(env.ECO_PHOTOS.delete(original.photo_key + ".thumb.webp"));
  }
  context.waitUntil(syncSheetEvent(env, sync));
  for (let offset = 0; offset < guideSyncEvents.length; offset += 50) {
    const group = guideSyncEvents.slice(offset, offset + 50);
    await env.ECO_DB.batch(group.map(function (event) { return syncStatement(env.ECO_DB, event); }));
    group.forEach(function (event) { context.waitUntil(syncSheetEvent(env, event)); });
  }
  return json({ ok: true, observation });
}

async function ensureReflectionSchema(env) {
  if (!reflectionSchemaPromise) {
    reflectionSchemaPromise = env.ECO_DB.batch([
      env.ECO_DB.prepare("CREATE TABLE IF NOT EXISTS reflections (student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE, memorable_species TEXT NOT NULL DEFAULT '', contribution TEXT NOT NULL DEFAULT '', problem_solving TEXT NOT NULL DEFAULT '', ecological_learning TEXT NOT NULL DEFAULT '', perspective_change TEXT NOT NULL DEFAULT '', further_question TEXT NOT NULL DEFAULT '', free_reflection TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')), created_at TEXT NOT NULL, submitted_at TEXT, updated_at TEXT NOT NULL)"),
      env.ECO_DB.prepare("CREATE TABLE IF NOT EXISTS eco_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL)"),
      env.ECO_DB.prepare("INSERT OR IGNORE INTO eco_settings (setting_key, setting_value, updated_at) VALUES ('reflection_edit_after_submit', '0', ?)").bind(new Date().toISOString())
    ]).catch(function (error) {
      reflectionSchemaPromise = null;
      throw error;
    });
  }
  return reflectionSchemaPromise;
}

async function reflectionEditsAllowed(env) {
  await ensureReflectionSchema(env);
  const setting = await env.ECO_DB.prepare("SELECT setting_value FROM eco_settings WHERE setting_key = 'reflection_edit_after_submit'").first();
  return Boolean(setting && String(setting.setting_value) === "1");
}

async function getReflection({ env }, user) {
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  await ensureReflectionSchema(env);
  const [reflection, guideCount, allowEdits] = await Promise.all([
    env.ECO_DB.prepare("SELECT * FROM reflections WHERE student_id = ?").bind(user.id).first(),
    env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM field_guides WHERE student_id = ? AND status = '완료'").bind(user.id).first(),
    reflectionEditsAllowed(env)
  ]);
  return json({ ok: true, reflection: reflection || null, guide_count: Number(guideCount.count || 0), allow_edits_after_submit: allowEdits });
}

async function saveReflection(context, user) {
  const { request, env } = context;
  if (user.role !== "student") throw new HttpError(403, "학생 계정으로 로그인해 주세요.");
  await ensureReflectionSchema(env);
  const body = await readJson(request);
  const status = body.status === "submitted" ? "submitted" : body.status === "draft" ? "draft" : "";
  if (!status) return json({ ok: false, error: "저장 상태가 올바르지 않습니다." }, 400);
  const fields = {
    memorable_species: optionalText(body.memorable_species, 2000, "인상 깊었던 생물과 이유"),
    contribution: optionalText(body.contribution, 2000, "역할과 기여"),
    problem_solving: optionalText(body.problem_solving, 2000, "문제와 해결 방법"),
    ecological_learning: optionalText(body.ecological_learning, 2000, "새롭게 알게 된 생태 지식"),
    perspective_change: optionalText(body.perspective_change, 2000, "생각의 변화"),
    further_question: optionalText(body.further_question, 2000, "더 탐구하고 싶은 질문"),
    free_reflection: optionalText(body.free_reflection, 3000, "자유 소감")
  };
  const existing = await env.ECO_DB.prepare("SELECT * FROM reflections WHERE student_id = ?").bind(user.id).first();
  if (existing && existing.status === "submitted" && !(await reflectionEditsAllowed(env))) {
    return json({ ok: false, error: "최종 제출이 완료되어 수정할 수 없습니다. 담당 선생님께 수정 허용을 요청해 주세요." }, 409);
  }
  const guideCount = await env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM field_guides WHERE student_id = ? AND status = '완료'").bind(user.id).first();
  if (status === "submitted") {
    if (Number(guideCount.count || 0) < 1) return json({ ok: false, error: "개인 생물도감을 최소 1개 완성한 뒤 제출할 수 있습니다." }, 409);
    const labels = {
      memorable_species: "인상 깊었던 생물과 이유", contribution: "역할과 기여", problem_solving: "문제와 해결 방법",
      ecological_learning: "새롭게 알게 된 생태 지식", perspective_change: "생각의 변화", further_question: "더 탐구하고 싶은 질문", free_reflection: "자유 소감"
    };
    for (const key of Object.keys(fields)) {
      if (fields[key].length < (key === "free_reflection" ? 5 : 10)) return json({ ok: false, error: labels[key] + "을(를) 조금 더 구체적으로 작성해 주세요." }, 400);
    }
  }
  const now = new Date().toISOString();
  const createdAt = existing ? existing.created_at : now;
  const submittedAt = status === "submitted" ? now : existing && existing.submitted_at || null;
  const data = {
    student_id: user.id, class_number: user.class_number, student_number: user.student_number,
    student_name: user.student_name, group_number: user.group_number, guide_count: Number(guideCount.count || 0),
    ...fields, status, created_at: createdAt, submitted_at: submittedAt, updated_at: now
  };
  const sync = makeSyncEvent("reflection.upsert", user.id, data);
  await env.ECO_DB.batch([
    env.ECO_DB.prepare("INSERT INTO reflections (student_id, memorable_species, contribution, problem_solving, ecological_learning, perspective_change, further_question, free_reflection, status, created_at, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(student_id) DO UPDATE SET memorable_species = excluded.memorable_species, contribution = excluded.contribution, problem_solving = excluded.problem_solving, ecological_learning = excluded.ecological_learning, perspective_change = excluded.perspective_change, further_question = excluded.further_question, free_reflection = excluded.free_reflection, status = excluded.status, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at")
      .bind(user.id, fields.memorable_species, fields.contribution, fields.problem_solving, fields.ecological_learning, fields.perspective_change, fields.further_question, fields.free_reflection, status, createdAt, submittedAt, now),
    syncStatement(env.ECO_DB, sync)
  ]);
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, reflection: data, allow_edits_after_submit: await reflectionEditsAllowed(env) });
}

async function listAdminReflections({ request, env }, user) {
  requireTeacher(user);
  await ensureRosterSchema(env);
  await ensureReflectionSchema(env);
  const url = new URL(request.url);
  const classValue = url.searchParams.get("class");
  const classNumber = classValue && classValue !== "all" ? integer(classValue, 1, 9, "반") : null;
  const where = classNumber ? " WHERE r.class_number = ?" : "";
  const statement = env.ECO_DB.prepare(
    "SELECT r.id AS student_id, r.class_number, r.student_number, r.student_name, r.group_number, COALESCE((SELECT COUNT(*) FROM field_guides g WHERE g.student_id = s.id AND g.status = '완료'), 0) AS guide_count, f.memorable_species, f.contribution, f.problem_solving, f.ecological_learning, f.perspective_change, f.further_question, f.free_reflection, COALESCE(f.status, 'not_started') AS reflection_status, f.created_at, f.submitted_at, f.updated_at, COALESCE((SELECT q.status FROM sheet_sync_queue q WHERE q.event_type = 'reflection.upsert' AND q.target_id = r.id ORDER BY q.updated_at DESC LIMIT 1), 'not_queued') AS sync_status FROM student_roster r LEFT JOIN students s ON s.class_number = r.class_number AND s.student_number = r.student_number LEFT JOIN reflections f ON f.student_id = s.id" + where + " ORDER BY r.class_number, r.student_number LIMIT 500"
  );
  const result = classNumber ? await statement.bind(classNumber).all() : await statement.all();
  return json({ ok: true, reflections: result.results, allow_edits_after_submit: await reflectionEditsAllowed(env) });
}

async function updateReflectionSettings(context, user) {
  const { request, env } = context;
  requireTeacher(user);
  await ensureReflectionSchema(env);
  const body = await readJson(request);
  if (typeof body.allow_edits_after_submit !== "boolean") return json({ ok: false, error: "수정 허용 설정이 올바르지 않습니다." }, 400);
  const value = body.allow_edits_after_submit ? "1" : "0";
  await env.ECO_DB.prepare("INSERT INTO eco_settings (setting_key, setting_value, updated_at) VALUES ('reflection_edit_after_submit', ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at")
    .bind(value, new Date().toISOString()).run();
  return json({ ok: true, allow_edits_after_submit: body.allow_edits_after_submit });
}

async function listAdminGuides({ request, env }, user) {
  requireTeacher(user);
  const url = new URL(request.url);
  const classValue = url.searchParams.get("class");
  const classNumber = classValue && classValue !== "all" ? integer(classValue, 1, 9, "반") : null;
  const where = classNumber ? " WHERE st.class_number = ?" : "";
  const statement = env.ECO_DB.prepare(
    "SELECT g.*, st.class_number, st.student_number, st.student_name, st.group_number, o.species_name, o.scientific_name, o.category, o.place_name, o.latitude, o.longitude, o.student_name AS discoverer_name, o.created_at AS observed_at, o.updated_at AS observation_updated_at FROM field_guides g JOIN students st ON st.id = g.student_id JOIN observations o ON o.id = g.observation_id" + where + " ORDER BY st.class_number, st.student_number, g.updated_at DESC LIMIT 1000"
  );
  const result = classNumber ? await statement.bind(classNumber).all() : await statement.all();
  const origin = new URL(request.url).origin;
  return json({
    ok: true,
    guides: result.results.map(function (row) {
      return { ...row, photo_url: origin + "/api/eco/photos/" + row.observation_id + "?v=" + encodeURIComponent(row.observation_updated_at) };
    })
  });
}

function normalizeStudentName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function normalizeRosterStatus(value) {
  const status = String(value || "활동").trim().toLocaleLowerCase("ko-KR");
  return ["disabled", "inactive", "중지", "비활성", "전학", "제외"].includes(status) ? "disabled" : "active";
}

function rosterSheetStudent(row, activeStudent) {
  return {
    student_id: row.id,
    class_number: Number(row.class_number),
    student_number: Number(row.student_number),
    student_name: row.student_name,
    group_number: row.group_number === null || row.group_number === undefined ? "" : Number(row.group_number),
    guide_limit: activeStudent ? Number(activeStudent.guide_limit || 3) : 3,
    status: row.status === "disabled" ? "중지" : activeStudent ? "활동" : "등록 대기",
    created_at: row.created_at,
    last_login_at: activeStudent ? activeStudent.last_login_at : ""
  };
}

async function importRoster(context, user) {
  const { request, env } = context;
  requireTeacher(user);
  await ensureRosterSchema(env);
  const body = await readJson(request);
  if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 500) {
    return json({ ok: false, error: "학생 명단은 한 번에 1~500명까지 등록할 수 있습니다." }, 400);
  }

  const seen = new Set();
  const imported = body.students.map(function (item, index) {
    const rowNumber = index + 2;
    const classNumber = integer(item.class_number, 1, 9, rowNumber + "행 반");
    const studentNumber = integer(item.student_number, 1, 99, rowNumber + "행 번호");
    const studentName = text(item.student_name, 2, 30, rowNumber + "행 이름");
    const rawGroupNumber = String(item.group_number === undefined || item.group_number === null ? "" : item.group_number).trim();
    const groupNumber = rawGroupNumber ? integer(rawGroupNumber, 1, 20, rowNumber + "행 모둠") : null;
    const key = classNumber + ":" + studentNumber;
    if (seen.has(key)) throw new HttpError(400, rowNumber + "행에 중복된 반·번호가 있습니다.");
    seen.add(key);
    return {
      class_number: classNumber,
      student_number: studentNumber,
      student_name: studentName,
      normalized_name: normalizeStudentName(studentName),
      group_number: groupNumber,
      status: normalizeRosterStatus(item.status)
    };
  });

  const [currentRoster, currentStudents] = await Promise.all([
    env.ECO_DB.prepare("SELECT * FROM student_roster").all(),
    env.ECO_DB.prepare("SELECT * FROM students").all()
  ]);
  const rosterByKey = new Map(currentRoster.results.map(function (row) { return [row.class_number + ":" + row.student_number, row]; }));
  const studentByKey = new Map(currentStudents.results.map(function (row) { return [row.class_number + ":" + row.student_number, row]; }));
  const now = new Date().toISOString();
  imported.forEach(function (row) {
    const key = row.class_number + ":" + row.student_number;
    const previousRoster = rosterByKey.get(key);
    const previousStudent = studentByKey.get(key);
    const id = previousRoster ? previousRoster.id : previousStudent ? previousStudent.id : crypto.randomUUID();
    if (row.group_number === null && previousRoster && previousRoster.group_number !== null && previousRoster.group_number !== undefined) {
      row.group_number = Number(previousRoster.group_number);
    }
    row.id = id;
    row.created_at = previousRoster ? previousRoster.created_at : previousStudent ? previousStudent.created_at : now;
    row.updated_at = now;
  });

  const statements = [];
  for (let offset = 0; offset < imported.length; offset += 10) {
    const chunk = imported.slice(offset, offset + 10);
    const values = chunk.map(function () { return "(?, ?, ?, ?, ?, ?, ?, ?, ?)"; }).join(", ");
    const bindings = chunk.flatMap(function (row) {
      return [row.id, row.class_number, row.student_number, row.student_name, row.normalized_name, row.group_number, row.status, row.created_at, row.updated_at];
    });
    statements.push(env.ECO_DB.prepare(
      "INSERT INTO student_roster (id, class_number, student_number, student_name, normalized_name, group_number, status, created_at, updated_at) VALUES " + values + " ON CONFLICT(class_number, student_number) DO UPDATE SET student_name = excluded.student_name, normalized_name = excluded.normalized_name, group_number = excluded.group_number, status = excluded.status, updated_at = excluded.updated_at"
    ).bind(...bindings));
  }
  statements.push(env.ECO_DB.prepare(
    "UPDATE students SET student_name = (SELECT r.student_name FROM student_roster r WHERE r.class_number = students.class_number AND r.student_number = students.student_number), group_number = COALESCE((SELECT r.group_number FROM student_roster r WHERE r.class_number = students.class_number AND r.student_number = students.student_number), group_number), status = (SELECT r.status FROM student_roster r WHERE r.class_number = students.class_number AND r.student_number = students.student_number), updated_at = ? WHERE EXISTS (SELECT 1 FROM student_roster r WHERE r.class_number = students.class_number AND r.student_number = students.student_number)"
  ).bind(now));
  statements.push(env.ECO_DB.prepare("DELETE FROM sessions WHERE role = 'student'"));
  await env.ECO_DB.batch(statements);

  const [fullRoster, latestStudents] = await Promise.all([
    env.ECO_DB.prepare("SELECT * FROM student_roster ORDER BY class_number, student_number").all(),
    env.ECO_DB.prepare("SELECT * FROM students").all()
  ]);
  const activeByKey = new Map(latestStudents.results.map(function (row) { return [row.class_number + ":" + row.student_number, row]; }));
  const sheetRows = fullRoster.results.map(function (row) {
    return rosterSheetStudent(row, activeByKey.get(row.class_number + ":" + row.student_number));
  });
  const sync = makeSyncEvent("roster.replace", "student-roster", { students: sheetRows });
  await putSyncEvent(env.ECO_DB, sync);
  context.waitUntil(syncSheetEvent(env, sync));

  return json({
    ok: true,
    imported: imported.length,
    roster_count: fullRoster.results.length,
    roster_enabled: fullRoster.results.length > 0,
    sheet_sync_queued: true
  });
}

async function listRoster({ request, env }, user) {
  requireTeacher(user);
  await ensureRosterSchema(env);
  const url = new URL(request.url);
  const classValue = url.searchParams.get("class");
  const classNumber = classValue ? integer(classValue, 1, 9, "반") : null;
  const where = classNumber ? " WHERE r.class_number = ?" : "";
  const statement = env.ECO_DB.prepare(
    "SELECT r.*, CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS registered, s.last_login_at, COALESCE(s.guide_limit, 3) AS guide_limit FROM student_roster r LEFT JOIN students s ON s.class_number = r.class_number AND s.student_number = r.student_number" + where + " ORDER BY r.class_number, r.student_number LIMIT 500"
  );
  const result = classNumber ? await statement.bind(classNumber).all() : await statement.all();
  return json({
    ok: true,
    students: result.results.map(function (row) {
      return {
        id: row.id,
        class_number: Number(row.class_number),
        student_number: Number(row.student_number),
        student_name: row.student_name,
        group_number: row.group_number === null || row.group_number === undefined ? null : Number(row.group_number),
        status: row.status,
        registered: Boolean(row.registered),
        last_login_at: row.last_login_at || "",
        guide_limit: Number(row.guide_limit || 3)
      };
    })
  });
}

async function deleteTestAccount(context, user) {
  const { env } = context;
  requireTeacher(user);
  requireBindings(env, ["ECO_DB", "ECO_PHOTOS"]);
  await ensureRosterSchema(env);

  const [student, roster] = await Promise.all([
    env.ECO_DB.prepare("SELECT * FROM students WHERE class_number = 9 AND student_number = 99").first(),
    env.ECO_DB.prepare("SELECT * FROM student_roster WHERE class_number = 9 AND student_number = 99").first()
  ]);
  const record = student || roster;
  if (!record) return json({ ok: false, error: "9반 99번 테스트 계정을 찾을 수 없습니다." }, 404);
  if (normalizeStudentName(record.student_name) !== normalizeStudentName("테스트학생")) {
    return json({ ok: false, error: "9반 99번의 이름이 테스트학생과 달라 삭제하지 않았습니다." }, 409);
  }

  const studentId = student ? student.id : roster.id;
  const observationResult = student
    ? await env.ECO_DB.prepare("SELECT id, photo_key FROM observations WHERE student_id = ?").bind(studentId).all()
    : { results: [] };
  const guideResult = student
    ? await env.ECO_DB.prepare("SELECT id, student_id FROM field_guides WHERE student_id = ? OR observation_id IN (SELECT id FROM observations WHERE student_id = ?)").bind(studentId, studentId).all()
    : { results: [] };
  const observationIds = observationResult.results.map(function (item) { return item.id; });
  const guideIds = guideResult.results.map(function (item) { return item.id; });
  const affectedStudentIds = Array.from(new Set(guideResult.results.map(function (item) { return item.student_id; }).filter(function (id) { return id && id !== studentId; })));
  const targetIds = Array.from(new Set([studentId].concat(observationIds, guideIds)));
  const placeholders = targetIds.map(function () { return "?"; }).join(", ");
  const cleanup = makeSyncEvent("test.cleanup", "test-account-9-99", {
    student_ids: [studentId],
    observation_ids: observationIds,
    guide_ids: guideIds,
    affected_student_ids: affectedStudentIds
  });
  const statements = [];
  if (targetIds.length) {
    statements.push(env.ECO_DB.prepare("DELETE FROM reviews WHERE target_id IN (" + placeholders + ")").bind(...targetIds));
    statements.push(env.ECO_DB.prepare("DELETE FROM sheet_sync_queue WHERE target_id IN (" + placeholders + ")").bind(...targetIds));
  }
  if (student) {
    await ensureReflectionSchema(env);
    statements.push(env.ECO_DB.prepare("DELETE FROM reflections WHERE student_id = ?").bind(studentId));
    statements.push(env.ECO_DB.prepare("DELETE FROM field_guides WHERE student_id = ? OR observation_id IN (SELECT id FROM observations WHERE student_id = ?)").bind(studentId, studentId));
    statements.push(env.ECO_DB.prepare("DELETE FROM observations WHERE student_id = ?").bind(studentId));
    statements.push(env.ECO_DB.prepare("DELETE FROM sessions WHERE student_id = ?").bind(studentId));
  }
  statements.push(env.ECO_DB.prepare("DELETE FROM student_roster WHERE class_number = 9 AND student_number = 99 AND normalized_name = ?").bind(normalizeStudentName("테스트학생")));
  if (student) statements.push(env.ECO_DB.prepare("DELETE FROM students WHERE id = ?").bind(studentId));
  statements.push(syncStatement(env.ECO_DB, cleanup));
  await env.ECO_DB.batch(statements);

  await Promise.all(observationResult.results.flatMap(function (item) {
    return [env.ECO_PHOTOS.delete(item.photo_key), env.ECO_PHOTOS.delete(item.photo_key + ".thumb.webp")];
  }));
  context.waitUntil(syncSheetEvent(env, cleanup));
  return json({
    ok: true,
    deleted: {
      account: 1,
      observations: observationIds.length,
      guides: guideIds.length,
      photos: observationResult.results.length
    },
    sheet_sync_queued: true
  });
}

async function updateRosterGroup(context, user, rosterId) {
  const { request, env } = context;
  requireTeacher(user);
  await ensureRosterSchema(env);
  const body = await readJson(request);
  const groupNumber = integer(body.group_number, 1, 20, "모둠");
  const rosterStudent = await env.ECO_DB.prepare("SELECT * FROM student_roster WHERE id = ?").bind(rosterId).first();
  if (!rosterStudent) return json({ ok: false, error: "학생 명단을 찾을 수 없습니다." }, 404);
  const now = new Date().toISOString();
  const activeStudent = await env.ECO_DB.prepare(
    "SELECT * FROM students WHERE class_number = ? AND student_number = ?"
  ).bind(rosterStudent.class_number, rosterStudent.student_number).first();
  const statements = [
    env.ECO_DB.prepare("UPDATE student_roster SET group_number = ?, updated_at = ? WHERE id = ?").bind(groupNumber, now, rosterId)
  ];
  if (activeStudent) {
    statements.push(env.ECO_DB.prepare("UPDATE students SET group_number = ?, updated_at = ? WHERE id = ?").bind(groupNumber, now, activeStudent.id));
    statements.push(env.ECO_DB.prepare("DELETE FROM sessions WHERE role = 'student' AND student_id = ?").bind(activeStudent.id));
  }
  await env.ECO_DB.batch(statements);
  const updatedRoster = { ...rosterStudent, group_number: groupNumber, updated_at: now };
  const updatedStudent = activeStudent ? { ...activeStudent, group_number: groupNumber, updated_at: now } : null;
  const sync = makeSyncEvent("student.upsert", rosterId, rosterSheetStudent(updatedRoster, updatedStudent));
  await putSyncEvent(env.ECO_DB, sync);
  context.waitUntil(syncSheetEvent(env, sync));
  return json({ ok: true, student: { id: rosterId, group_number: groupNumber } });
}

async function updateRosterGroups(context, user) {
  const { request, env } = context;
  requireTeacher(user);
  await ensureRosterSchema(env);
  const body = await readJson(request);
  const classNumber = integer(body.class_number, 1, 9, "반");
  if (!Array.isArray(body.assignments) || body.assignments.length < 1 || body.assignments.length > 99) {
    return json({ ok: false, error: "팀 배정 학생은 한 번에 1~99명까지 저장할 수 있습니다." }, 400);
  }

  const seen = new Set();
  const assignments = body.assignments.map(function (item, index) {
    const studentNumber = integer(item.student_number, 1, 99, (index + 1) + "번째 학생 번호");
    const groupNumber = integer(item.group_number, 1, 20, (index + 1) + "번째 팀");
    if (seen.has(studentNumber)) throw new HttpError(400, studentNumber + "번 학생이 두 팀 이상에 중복되었습니다.");
    seen.add(studentNumber);
    return { student_number: studentNumber, group_number: groupNumber };
  });

  const rosterResult = await env.ECO_DB.prepare(
    "SELECT * FROM student_roster WHERE class_number = ? AND status = 'active' ORDER BY student_number"
  ).bind(classNumber).all();
  const rosterByNumber = new Map(rosterResult.results.map(function (row) { return [Number(row.student_number), row]; }));
  const missing = assignments.filter(function (item) { return !rosterByNumber.has(item.student_number); }).map(function (item) { return item.student_number; });
  if (missing.length) {
    return json({ ok: false, error: classNumber + "반 명단에 없는 번호가 있습니다: " + missing.join(", ") + "번" }, 400);
  }

  const now = new Date().toISOString();
  const statements = [];
  assignments.forEach(function (item) {
    statements.push(env.ECO_DB.prepare(
      "UPDATE student_roster SET group_number = ?, updated_at = ? WHERE class_number = ? AND student_number = ?"
    ).bind(item.group_number, now, classNumber, item.student_number));
    statements.push(env.ECO_DB.prepare(
      "UPDATE students SET group_number = ?, updated_at = ? WHERE class_number = ? AND student_number = ?"
    ).bind(item.group_number, now, classNumber, item.student_number));
  });
  statements.push(env.ECO_DB.prepare(
    "DELETE FROM sessions WHERE role = 'student' AND student_id IN (SELECT id FROM students WHERE class_number = ?)"
  ).bind(classNumber));
  for (let index = 0; index < statements.length; index += 75) {
    await env.ECO_DB.batch(statements.slice(index, index + 75));
  }

  const [fullRoster, activeStudents] = await Promise.all([
    env.ECO_DB.prepare("SELECT * FROM student_roster ORDER BY class_number, student_number").all(),
    env.ECO_DB.prepare("SELECT * FROM students").all()
  ]);
  const activeByKey = new Map(activeStudents.results.map(function (row) { return [row.class_number + ":" + row.student_number, row]; }));
  const sheetRows = fullRoster.results.map(function (row) {
    return rosterSheetStudent(row, activeByKey.get(row.class_number + ":" + row.student_number));
  });
  const sync = makeSyncEvent("roster.replace", "student-roster", { students: sheetRows });
  await putSyncEvent(env.ECO_DB, sync);
  context.waitUntil(syncSheetEvent(env, sync));

  return json({ ok: true, updated: assignments.length, class_number: classNumber, sheet_sync_queued: true });
}

async function adminOverview({ env }, user) {
  requireTeacher(user);
  await ensureRosterSchema(env);
  const [students, observations, guides, pending, roster, unassigned] = await Promise.all([
    env.ECO_DB.prepare("SELECT class_number, COUNT(*) AS count FROM students WHERE status = 'active' GROUP BY class_number").all(),
    env.ECO_DB.prepare("SELECT class_number, COUNT(*) AS count FROM observations GROUP BY class_number").all(),
    env.ECO_DB.prepare("SELECT st.class_number, COUNT(*) AS count FROM field_guides g JOIN students st ON st.id = g.student_id WHERE g.status = '완료' GROUP BY st.class_number").all(),
    env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM sheet_sync_queue WHERE status != 'synced'").first(),
    env.ECO_DB.prepare("SELECT class_number, COUNT(*) AS count FROM student_roster WHERE status = 'active' GROUP BY class_number").all(),
    env.ECO_DB.prepare("SELECT COUNT(*) AS count FROM student_roster WHERE status = 'active' AND group_number IS NULL").first()
  ]);
  const classes = Array.from({ length: 9 }, function (_, index) {
    const classNumber = index + 1;
    return {
      class_number: classNumber,
      roster: countFor(roster.results, classNumber),
      students: countFor(students.results, classNumber),
      observations: countFor(observations.results, classNumber),
      guides: countFor(guides.results, classNumber)
    };
  });
  const rosterCount = classes.reduce(function (sum, item) { return sum + item.roster; }, 0);
  return json({ ok: true, classes, roster_count: rosterCount, roster_enabled: rosterCount > 0, unassigned_count: Number(unassigned.count || 0), pending_sync: Number(pending.count || 0) });
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
