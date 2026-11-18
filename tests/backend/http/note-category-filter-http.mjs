// HTTP contract for card 41 (filter the notes list by category).
// Run only against a DEV/TEST API with migrations 001 to 004 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false, email: "",
    async call(route, body) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie,
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
  };
}

const owner = client();
const friend = client();
const people = [owner, friend];
try {
  for (const person of people) await person.call("session");
  for (const [person, name] of [[owner, "Filter Owner"], [friend, "Filter Friend"]]) {
    person.email = `notely-filter-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email: person.email, password })).status, 201);
    person.registered = true;
  }
  const list = async (person, params = "") => {
    const response = await person.call(`notes${params}`);
    return { status: response.status, error: response.data.error, titles: (response.data.notes || []).map((note) => note.title).sort() };
  };
  const seed = async (title, category, extra = {}) => {
    const response = await owner.call("note-create", { title, body: `${title} body`, category, ...extra });
    assert.equal(response.status, 201, `seed ${title}`);
    return response.data.note.id;
  };

  // Test 1 - return the notes from the requested category.
  await seed("Algebra review", "School");
  await seed("Sprint plan", "Work");
  await seed("Project minutes", "Meetings");
  assert.deepEqual((await list(owner, "&category=Work")).titles, ["Sprint plan"], "only the Work note is returned");
  assert.deepEqual((await list(owner)).titles, ["Algebra review", "Project minutes", "Sprint plan"], "no category returns every note");
  assert.deepEqual((await list(owner, "&category=")).titles, ["Algebra review", "Project minutes", "Sprint plan"], "an empty category counts as absent");
  assert.deepEqual((await list(owner, "&category=Personal")).titles, [], "a category with no notes returns an empty list");

  // Test 2 - category combined with the keyword filter, and an unsupported category.
  await seed("Project outline", "School");
  await seed("Weekly agenda", "Meetings");
  assert.deepEqual((await list(owner, "&category=Meetings&q=Project")).titles, ["Project minutes"], "category and keyword both apply");
  assert.deepEqual((await list(owner, "&q=project")).titles, ["Project minutes", "Project outline"], "the keyword alone ignores case and spans categories");
  const vacation = await list(owner, "&category=Vacation");
  assert.equal(vacation.status, 422, "an unsupported category is a validation error");
  assert.equal(vacation.error, "Choose a valid category.");
  for (const bad of ["work", "WORK", "School%20"]) {
    assert.equal((await list(owner, `&category=${bad}`)).status, 422, `${bad} is rejected`);
  }
  assert.equal((await list(owner, "&category[]=Work")).status, 422, "an array value is rejected");

  // Category keeps working with the other existing filters.
  await seed("Exam sheet", "School", { visibility: "shared", courseId: "cse442", lectureDate: "2026-10-01" });
  await seed("Old exam sheet", "School", { visibility: "private", courseId: "cse331", lectureDate: "2026-09-01" });
  assert.deepEqual((await list(owner, "&category=School&visibility=shared")).titles, ["Exam sheet"], "category and visibility");
  assert.deepEqual((await list(owner, "&category=School&course=cse331")).titles, ["Old exam sheet"], "category and course");
  assert.deepEqual((await list(owner, "&category=School&from=2026-09-15")).titles, ["Exam sheet"], "category and start date");
  assert.deepEqual((await list(owner, "&category=School&to=2026-09-15")).titles, ["Old exam sheet"], "category and end date");
  assert.deepEqual((await list(owner, "&category=School&q=exam&visibility=private&course=cse331&to=2026-09-30")).titles, ["Old exam sheet"], "all five together");
  assert.equal((await list(owner, "&from=2026-02-30")).status, 422, "an impossible date is rejected");
  assert.equal((await list(owner, "&visibility=everyone")).status, 422, "an unknown visibility is rejected");
  await seed("Discount 50% off", "School");
  await seed("Discount 500 off", "School");
  assert.deepEqual((await list(owner, "&q=50%25")).titles, ["Discount 50% off"], "a % in the keyword is searched literally");
  assert.deepEqual((await list(owner, "&q=a_c")).titles, [], "an _ in the keyword is not a wildcard");

  // The filter only narrows what the caller may already see.
  const shared = await seed("Shared meeting notes", "Meetings", { visibility: "shared" });
  await seed("Private meeting notes", "Meetings", { visibility: "private" });
  // Before the invitation the friend is just another signed-in student with no access.
  assert.deepEqual((await list(friend, "&category=Meetings")).titles, [], "someone with no access sees nothing");
  assert.equal((await owner.call("note-invite", { id: shared, email: friend.email })).status, 200);
  assert.deepEqual((await list(friend, "&category=Meetings")).titles, ["Shared meeting notes"], "a collaborator sees only the shared Meetings note");
  const signedOut = client();
  await signedOut.call("session");
  assert.equal((await signedOut.call("notes&category=Work")).status, 401, "signing in is still required");

  console.log("PASS: card 41 notes list filters by category, combines with the other filters, and respects access");
} finally {
  // Remove the test accounts so repeated runs leave nothing behind.
  for (const person of people) if (person.registered) await person.call("delete", { currentPassword: password });
}
