import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

function fixture() {
  const settings = new Map();
  const env = {
    ECO_DB: {
      async batch() { return []; },
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) { return { ...statement, values }; },
          async first() {
            if (sql.includes("FROM sessions")) {
              if (this.values[0] === "student-hash") return null;
              return { role: "teacher", expires_at: "9999-12-31T00:00:00.000Z" };
            }
            if (sql.includes("FROM class_activity_settings")) return settings.get(Number(this.values[0])) || null;
            if (sql.includes("FROM eco_settings")) return null;
            throw new Error("Unexpected first query: " + sql);
          },
          async run() {
            if (sql.startsWith("CREATE TABLE")) return { success: true };
            if (sql.includes("INSERT INTO class_activity_settings")) {
              const [classNumber, observations, guides, reflections, reflectionEdits, updatedAt] = this.values;
              settings.set(Number(classNumber), {
                observations_locked: observations,
                guides_locked: guides,
                reflections_locked: reflections,
                reflection_edits_after_submit: reflectionEdits,
                updated_at: updatedAt
              });
              return { success: true };
            }
            throw new Error("Unexpected run query: " + sql);
          }
        };
        return statement;
      }
    }
  };
  return {
    settings,
    context(path, init = {}) {
      return {
        request: new Request("https://example.test/api/eco/" + path, {
          ...init,
          headers: { Cookie: "eco_session=teacher-token", ...(init.headers || {}) }
        }),
        env,
        waitUntil() {}
      };
    }
  };
}

test("teacher controls each class activity independently without deleting records", async () => {
  const app = fixture();
  const update = await onRequest(app.context("admin/class-activity-settings/8", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ observations_locked: true, guides_locked: true, reflections_locked: true })
  }));
  assert.equal(update.status, 200);
  const saved = (await update.json()).settings;
  assert.equal(saved.class_number, 8);
  assert.equal(saved.observations_locked, true);
  assert.equal(saved.guides_locked, true);
  assert.equal(saved.reflections_locked, true);

  const list = await onRequest(app.context("admin/class-activity-settings"));
  const classes = (await list.json()).classes;
  assert.equal(classes.length, 9);
  assert.equal(classes.find((item) => item.class_number === 8).reflections_locked, true);
  assert.equal(classes.find((item) => item.class_number === 2).reflections_locked, false);
});

test("final reflection editing permission is stored per class", async () => {
  const app = fixture();
  await onRequest(app.context("admin/class-activity-settings/2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reflection_edits_after_submit: true })
  }));
  await onRequest(app.context("admin/class-activity-settings/8", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reflection_edits_after_submit: false })
  }));
  assert.equal(app.settings.get(2).reflection_edits_after_submit, 1);
  assert.equal(app.settings.get(8).reflection_edits_after_submit, 0);
});
