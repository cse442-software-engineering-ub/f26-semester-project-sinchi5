// Card 153 HTTP contract for friend requests. Run only against DEV or TEST with migration 012 applied.
// Locally: NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8081/api/index.php node backend/tests/friends-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8081/api/index.php");
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(endpoint.hostname), "Run friend tests only on DEV or TEST.");
assert(endpoint.hostname === "aptitude.cse.buffalo.edu" || process.env.NOTELY_TEST_ISOLATED === "1",
  "Confirm the local API uses an isolated DEV database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || endpoint.origin;
const password = `Friend meadow ${randomUUID()}!`;

function client(name) {
  return {
    name, cookie: "", csrf: "", registered: false,
    email: `notely-friends-${randomUUID()}@example.edu`,
    async call(route, body, headers = {}) {
      const url = new URL(endpoint);
      url.search = `?route=${route}`;
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, data };
    },
  };
}

const ana = client("Friend Test Ana");
const bea = client("Friend Test Bea");
const cal = client("Friend Test Cal");
const anonymous = client("");
function expectError(result, status, message) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  assert.deepEqual(result.data, { error: message });
}
async function lists(person) {
  const result = await person.call("friends");
  assert.equal(result.status, 200);
  return result.data;
}
const names = (list) => list.map((entry) => entry.name);

try {
  for (const person of [ana, bea, cal, anonymous]) {
    assert.equal((await person.call("session")).status, 200, "the API must be configured and reachable");
  }
  for (const person of [ana, bea, cal]) {
    const result = await person.call("register", { name: person.name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201, JSON.stringify(result.data));
  }

  // Task test 1: a request is stored and listed on both sides.
  const sent = await ana.call("friend-request", { email: bea.email.toUpperCase() });
  assert.equal(sent.status, 201);
  assert.deepEqual(Object.keys(sent.data.request), ["id", "userId", "name", "email"]);
  assert.equal(sent.data.request.name, bea.name);
  assert.deepEqual(names(sent.data.outgoing), [bea.name]);
  assert.deepEqual(names((await lists(ana)).outgoing), [bea.name]);
  assert.deepEqual(names((await lists(bea)).incoming), [ana.name]);
  console.log("PASS 1: a request is stored and listed for both students");

  // Task test 2: only the person asked can answer, and accept must be true or false.
  const id = (await lists(ana)).outgoing[0].id;
  expectError(await ana.call("friend-respond", { id, accept: true }), 404, "This friend request could not be found.");
  expectError(await bea.call("friend-respond", { id, accept: "yes" }), 422, "Choose whether to accept this request.");
  const accepted = await bea.call("friend-respond", { id, accept: true });
  assert.equal(accepted.status, 200);
  assert.deepEqual(names(accepted.data.friends), [ana.name]);
  assert.deepEqual(names((await lists(ana)).friends), [bea.name]);
  assert.deepEqual((await lists(ana)).outgoing, []);
  const declineMe = await cal.call("friend-request", { email: bea.email });
  assert.equal(declineMe.status, 201);
  const declined = await bea.call("friend-respond", { id: declineMe.data.request.id, accept: false });
  assert.equal(declined.status, 200);
  assert.deepEqual(declined.data.incoming, []);
  assert.deepEqual(names(declined.data.friends), [ana.name]);
  assert.deepEqual((await lists(cal)).outgoing, []);
  console.log("PASS 2: only the addressee answers; accept and decline update both sides");

  // Task test 3: bad and repeated requests are rejected; a request back accepts the pending one.
  expectError(await ana.call("friend-request", { email: `nobody-${randomUUID()}@example.edu` }), 404,
    "No registered account was found for this email.");
  expectError(await ana.call("friend-request", { email: ana.email }), 422, "You can’t add yourself as a friend.");
  expectError(await ana.call("friend-request", { email: bea.email }), 409, "You’re already friends with this person.");
  expectError(await bea.call("friend-request", { email: ana.email }), 409, "You’re already friends with this person.");
  for (const email of ["not an email", "not-an-email", ""]) {
    expectError(await ana.call("friend-request", { email }), 422, "Enter a complete email address, like name@university.edu.");
  }
  expectError(await ana.call("friend-request", {}), 422, "Complete all required fields.");
  assert.equal((await ana.call("friend-request", { email: cal.email })).status, 201);
  expectError(await ana.call("friend-request", { email: cal.email }), 409, "You already sent this person a friend request.");
  const back = await cal.call("friend-request", { email: ana.email });
  assert.equal(back.status, 200);
  assert.deepEqual(names(back.data.friends), [ana.name]);
  assert.deepEqual(names((await lists(ana)).friends), [bea.name, cal.name].sort());
  console.log("PASS 3: bad, self, repeat, and existing-friend requests are refused; a request back accepts");

  // Task test 4: removing a friend removes it for both, and only from either side of that friendship.
  const friendship = (await lists(ana)).friends.find((entry) => entry.email === bea.email);
  expectError(await cal.call("friend-remove", { id: friendship.id }), 404, "This friend request could not be found.");
  const removed = await ana.call("friend-remove", { id: friendship.id });
  assert.equal(removed.status, 200);
  assert.deepEqual(names(removed.data.friends), [cal.name]);
  assert.deepEqual((await lists(bea)).friends, []);
  expectError(await ana.call("friend-remove", { id: friendship.id }), 404, "This friend request could not be found.");
  console.log("PASS 4: removing a friend removes it on both sides");

  // Task test 5: signed-out visitors and forged requests are refused.
  expectError(await anonymous.call("friends"), 401, "Sign in to continue.");
  expectError(await anonymous.call("friend-request", { email: ana.email }), 401, "Sign in to continue.");
  expectError(await ana.call("friend-request", { email: bea.email }, { "X-CSRF-Token": "forged" }), 403,
    "Your session changed. Reload the page and try again.");
  expectError(await ana.call("friend-request", { email: bea.email }, { Origin: "https://example.com" }), 403,
    "This request did not come from your workspace.");
  console.log("PASS 5: signed-out, forged, and cross-site requests are refused");

  // Deleting an account removes its friendships from the other side's lists.
  assert.equal((await cal.call("delete", { currentPassword: password })).status, 200);
  cal.registered = false;
  assert.deepEqual((await lists(ana)).friends, []);
  console.log("PASS: friend requests are sent, answered, listed, limited, and removed");
} finally {
  for (const person of [ana, bea, cal]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      process.exitCode = 1;
      console.error(`Account cleanup failed: remove the temporary account ${person.email}.`);
    }
  }
}
