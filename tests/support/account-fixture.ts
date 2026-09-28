// Browser wiring fixture only. PHP security is tested independently in backend/tests.
import { test as base, expect } from "@playwright/test";
const CODE = "ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234";
export const test = base.extend<{ accountApi: void }>({
  accountApi: [async ({ context }, use) => {
    let user: { id: string; name: string; email: string } | null = null;
    let account: typeof user = null;
    let password = "";
    let code = CODE;
    let completed = false;
    await context.route("**/api/index.php?route=*", async route => {
      const action = new URL(route.request().url()).searchParams.get("route");
      const body = route.request().postDataJSON() || {};
      let error = ""; let status = 200; let recoveryCode: string | undefined;
      if (action === "register") {
        account = { id: "42", name: body.name, email: body.email.toLowerCase().trim() }; user = account; password = body.password; recoveryCode = code;
      } else if (action === "login") {
        if (!account || body.email.toLowerCase().trim() !== account.email || body.password !== password) { error = "Email or password is incorrect."; status = 401; }
        else user = account;
      } else if (action === "onboarding") completed = true;
      else if (action === "logout") user = null;
      else if (action === "profile") {
        account = { ...account!, name: body.name, email: body.email }; user = account;
      } else if (action === "password" || action === "delete" || action === "recovery-code") {
        if (body.currentPassword !== password) { error = "Your current password is incorrect."; status = 422; }
        else if (action === "password") password = body.password;
        else if (action === "delete") { user = null; account = null; }
        else { code = "BEEF-5678-BEEF-5678-BEEF-5678-BEEF-5678"; recoveryCode = code; }
      } else if (action === "reset-password") {
        if (!account || account.email !== body.email || code !== body.recoveryCode) { error = "Email or recovery code is incorrect."; status = 422; }
        else { password = body.password; user = null; code = "CDEF-5678-CDEF-5678-CDEF-5678-CDEF-5678"; recoveryCode = code; }
      }
      await route.fulfill({ status, json: error ? { error } : { user, onboarding: { completed: !!user && completed, step: completed ? 3 : 0 }, csrfToken: "fixture-csrf", ...(recoveryCode ? { recoveryCode } : {}) } });
    });
    await use();
  }, { auto: true }],
});
export { expect };
