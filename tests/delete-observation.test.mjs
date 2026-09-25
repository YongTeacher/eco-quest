import assert from "node:assert/strict";
import test from "node:test";
import { onRequest, purgeExpiredTrash } from "../functions/api/eco/[[path]].js";

const observationId = "22222222-2222-4222-8222-222222222222";
const guideId = "33333333-3333-4333-8333-333333333333";
const photoKey = "observations/" + observationId + ".jpg";

function setup({ role = "teacher", observation = { id: observationId, photo_key: photoKey }, guides = [] } = {}) {
  const batches = [];
  const photoDeletes = [];
  const env = {
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) return { role, student_id: "student-1", status: "active", expires_at: "9999-12-31T00:00:00.000Z" };
            if (sql.includes("FROM observations WHERE id")) return observation;
            throw new Error("Unexpected first query: " + sql);
          },
          async all() {
            if (sql.includes("FROM field_guides WHERE observation_id =")) return { results: guides };
            if (sql.includes("FROM reviews WHERE target_id")) return { results: [] };
            if (sql.includes("FROM reflections f")) return { results: [] };
            if (sql.includes("SELECT student_id, COUNT(*)")) return { results: [] };
            throw new Error("Unexpected all query: " + sql);
          }
        };
        return statement;
      },
      async batch(statements) { batches.push(statements); return []; }
    },
    ECO_PHOTOS: {
      async delete(key) { photoDeletes.push(key); }
    }
  };
  return {
    batches,
    photoDeletes,
    context: {
      request: new Request("https://example.test/api/eco/admin/observations/" + observationId, {
        method: "DELETE", headers: { Cookie: "eco_session=test-token" }
      }),
      env,
      waitUntil(promise) { void promise; }
    }
  };
}

test("students cannot delete observations", async () => {
  const fixture = setup({ role: "student" });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 403);
  assert.equal(fixture.batches.length, 0);
  assert.deepEqual(fixture.photoDeletes, []);
});

test("a missing observation is not modified", async () => {
  const fixture = setup({ observation: null });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 404);
  assert.ok(fixture.batches.flat().every((statement) => statement.sql.startsWith("CREATE ")));
});

test("teacher deletion retains photo objects in the recycle bin and queues Sheets cleanup", async () => {
  const fixture = setup({ guides: [{ id: guideId, student_id: "student-1" }] });
  const response = await onRequest(fixture.context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.trashed, { observations: 1, guides: 1 });
  assert.ok(Date.parse(body.purge_after) > Date.now() + 29 * 24 * 60 * 60 * 1000);
  assert.deepEqual(fixture.photoDeletes, []);
  const statements = fixture.batches.flat();
  assert.ok(statements.some((statement) => statement.sql.includes("INSERT INTO observation_trash")));
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM field_guides WHERE observation_id")));
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM observations WHERE id")));
  const cleanup = statements.find((statement) => statement.sql.includes("INSERT INTO sheet_sync_queue") && statement.values?.[1] === "test.cleanup");
  assert.ok(cleanup);
  assert.deepEqual(JSON.parse(cleanup.values[3]).guide_ids, [guideId]);
});

test("teacher can restore a retained observation and its guide", async () => {
  const observation = {
    id: observationId, class_number: 9, group_number: 1, student_id: "student-1",
    student_name: "테스트학생", latitude: 37, longitude: 127, place_name: "학교",
    category: "plant", species_name: "민들레", scientific_name: "Taraxacum",
    features: "잎", identification_reason: "관찰", source: "자료",
    photo_key: photoKey, photo_mime: "image/jpeg", identification_status: "학생 동정",
    review_status: "정상", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z"
  };
  const guide = {
    id: guideId, student_id: "student-1", observation_id: observationId,
    habitat: "운동장", key_features: "잎", ecological_role: "생산자", report: "조사",
    source: "자료", status: "완료", created_at: observation.created_at, updated_at: observation.updated_at
  };
  const trash = {
    id: observationId, observation_json: JSON.stringify(observation), guides_json: JSON.stringify([guide]),
    reviews_json: "[]", cleanup_event_id: "cleanup-1", purge_after: "9999-12-31T00:00:00.000Z"
  };
  const batches = [];
  const env = {
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) return { role: "teacher", expires_at: "9999-12-31T00:00:00.000Z" };
            if (sql.includes("FROM observation_trash")) return trash;
            if (sql.includes("FROM observations WHERE id")) return null;
            throw new Error("Unexpected first query: " + sql);
          },
          async all() {
            if (sql.includes("FROM students WHERE id IN")) return { results: [{ id: "student-1", class_number: 9, student_number: 99, student_name: "테스트학생", group_number: 1 }] };
            if (sql.includes("FROM reflections f")) return { results: [] };
            if (sql.includes("SELECT student_id, COUNT(*)")) return { results: [] };
            throw new Error("Unexpected all query: " + sql);
          }
        };
        return statement;
      },
      async batch(statements) { batches.push(statements); return []; }
    },
    ECO_PHOTOS: { async head(key) { return key === photoKey ? {} : null; } }
  };
  const response = await onRequest({
    request: new Request("https://example.test/api/eco/admin/trash/" + observationId + "/restore", { method: "POST", headers: { Cookie: "eco_session=test-token" } }),
    env,
    waitUntil(promise) { void promise; }
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).restored, { observations: 1, guides: 1 });
  const statements = batches.flat();
  assert.ok(statements.some((statement) => statement.sql.startsWith("INSERT INTO observations")));
  assert.ok(statements.some((statement) => statement.sql.startsWith("INSERT INTO field_guides")));
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM observation_trash")));
});

test("scheduled cleanup permanently removes only expired trash photos", async () => {
  const deleted = [];
  const statements = [];
  const env = {
    ECO_DB: {
      prepare(sql) {
        const statement = {
          sql,
          bind(...values) { return { ...statement, values }; },
          async all() {
            return { results: [{ id: observationId, observation_json: JSON.stringify({ photo_key: photoKey }) }] };
          },
          async run() { statements.push(statement); }
        };
        return statement;
      },
      async batch() { return []; }
    },
    ECO_PHOTOS: { async delete(key) { deleted.push(key); } }
  };
  const result = await purgeExpiredTrash(env, new Date("2026-10-22T00:00:00.000Z"));
  assert.deepEqual(result, { purged: 1, failed: 0 });
  assert.deepEqual(deleted, [photoKey, photoKey + ".thumb.webp"]);
  assert.equal(statements.length, 1);
  assert.ok(statements[0].sql.includes("DELETE FROM observation_trash"));
});
