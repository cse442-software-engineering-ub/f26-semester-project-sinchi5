import { test, expect } from "@playwright/test";
test("investor demo: create account, then confirm it was stored via login", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/register.php", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, name: "Jamie Investor", email: "jamie@example.edu" }),
    }),
  );
  await page.route("**/api/v1/auth/login.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, name: "Jamie Investor", email: "jamie@example.edu" }),
    }),
  );
  await page.goto("/investor-demo");
  await page.getByLabel("Your name").fill("Jamie Investor");
  await page.getByLabel("Email address").first().fill("jamie@example.edu");
  await page.getByLabel("Password").first().fill("samplepassword");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Account #1 created and stored/)).toBeVisible();
  await page.getByLabel("Password").nth(1).fill("samplepassword");
  await page.getByRole("button", { name: "Confirm my account" }).click();
  await expect(
    page.getByText(/Retrieved from the database: Jamie Investor/),
  ).toBeVisible();
});
test("investor demo: duplicate email shows an error instead of a fake success", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/register.php", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "An account with that email already exists." }),
    }),
  );
  await page.goto("/investor-demo");
  await page.getByLabel("Your name").fill("Jamie Investor");
  await page.getByLabel("Email address").first().fill("jamie@example.edu");
  await page.getByLabel("Password").first().fill("samplepassword");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("An account with that email already exists."),
  ).toBeVisible();
  await expect(page.getByText(/created and stored/)).not.toBeVisible();
});
