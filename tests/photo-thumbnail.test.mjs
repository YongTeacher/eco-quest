import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/eco/[[path]].js";

const photoId = "11111111-1111-4111-8111-111111111111";
const photoKey = "observations/" + photoId + ".jpg";

function contextForPhoto(objects, cookie = "eco_session=test-token") {
  const reads = [];
  return {
    reads,
    context: {
      request: new Request("https://example.test/api/eco/photos/" + photoId + "?thumb=1", {
        headers: cookie ? { Cookie: cookie } : {}
      }),
      env: {
        ECO_DB: {
          prepare(sql) {
            return {
              bind() {
                return {
                  async first() {
                    if (sql.includes("FROM sessions")) return { role: "teacher", expires_at: "9999-12-31T00:00:00.000Z" };
                    if (sql.includes("FROM observations")) return { photo_key: photoKey, photo_mime: "image/jpeg" };
                    throw new Error("Unexpected query: " + sql);
                  }
                };
              }
            };
          }
        },
        ECO_PHOTOS: {
          async get(key) {
            reads.push(key);
            const object = objects[key];
            return object && { body: new Blob([object.text]).stream(), httpMetadata: { contentType: object.type } };
          }
        }
      }
    }
  };
}

test("serves the small map image when available", async () => {
  const { context, reads } = contextForPhoto({ [photoKey + ".thumb.webp"]: { text: "small", type: "image/webp" } });
  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(await response.text(), "small");
  assert.deepEqual(reads, [photoKey + ".thumb.webp"]);
});

test("older observations fall back to their original photo", async () => {
  const { context, reads } = contextForPhoto({ [photoKey]: { text: "original", type: "image/jpeg" } });
  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(await response.text(), "original");
  assert.deepEqual(reads, [photoKey + ".thumb.webp", photoKey]);
});

test("map thumbnails still require a login", async () => {
  const { context, reads } = contextForPhoto({}, "");
  const response = await onRequest(context);
  assert.equal(response.status, 401);
  assert.deepEqual(reads, []);
});
