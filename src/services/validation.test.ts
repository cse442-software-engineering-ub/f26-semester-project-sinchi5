import { describe, expect, it } from "vitest";
import { emailError, nameError, normalizeName, passwordError, recoveryCodeError } from "./validation";

describe("names", () => {
  it.each(["Jamie", "Zoë O'Brien-Smith", "María José", "J. R. R. Tolkien", "Nguyễn Văn An", "李小龙", "Анна", "محمد", "D’Angelo"])(
    "accepts %s", name => expect(nameError(name)).toBe(""));
  it("tidies spaces and accents", () => {
    expect(normalizeName("  Jamie  Lee ")).toBe("Jamie Lee");
    expect(normalizeName("Zoë")).toBe("Zoë");
  });
  it.each([
    ["", "Enter your name."],
    ["   ", "Enter your name."],
    ["é".repeat(101), "at most 100 characters. It currently has 101"],
    ["Jamie 😀", "emoji"],
    ["👍🏽", "emoji"],
    ["Jamie ❤️", "emoji"],
    ["Jamie‮eiL", "hidden character"],
    ["Ja​mie", "hidden character"],
    ["Jamie\tLee", "hidden character"],
    ["Jamie2", "numbers"],
    ["Jamie <script>", '"<"'],
    ["Jamie@home", '"@"'],
    ["-Jamie", "start with a letter"],
    ["Já́́́mie", "accent marks"],
    ["Ja\uD800mie", "hidden character"],
  ])("rejects %j", (name, message) => expect(nameError(name)).toContain(message));
});

describe("emails", () => {
  it("accepts ordinary addresses", () => {
    expect(emailError("  Jamie.Lee+notes@Example.edu ")).toBe("");
    expect(emailError(" jamie@example.edu ")).toBe("");
  });
  it.each([
    ["", "Enter your email"],
    ["jamie😀@example.edu", "emoji"],
    ["jamié@example.edu", '"é"'],
    ["jamie lee@example.edu", "spaces"],
    ["jamie​@example.edu", "hidden character"],
    ["victim@example.edu\r\nBcc: x@example.edu", "hidden character"],
    ["jamie.example.edu", "exactly one @"],
    ["a@b@example.edu", "exactly one @"],
    ["jamie@", "complete email"],
    ["jamie@example", "complete email"],
  ])("rejects %j", (email, message) => expect(emailError(email)).toContain(message));
});

describe("passwords", () => {
  it("accepts every keyboard character", () => {
    expect(passwordError("eight888")).toBe("");
    expect(passwordError("a".repeat(72))).toBe("");
    expect(passwordError("P@ss w0rd!~`{}[]|\\:;\"<>,.?/")).toBe("");
    expect(passwordError("  spaces kept  ")).toBe("");
  });
  it.each([
    ["seven77", "It currently has 7"],
    ["a".repeat(73), "at most 72"],
    ["correct horse 😀", "emoji"],
    ["pässwort sicher", "accented letters"],
    ["пароль пароль", "other alphabets"],
    ["tab\tpassword", "hidden character"],
    ["zero​width pass", "hidden character"],
    ["long password\0example", "hidden character"],
  ])("rejects %j", (password, message) => expect(passwordError(password)).toContain(message));
  it("never repeats the password's characters", () => {
    expect(passwordError("pässwort sicher")).not.toContain("ä");
  });
});

describe("recovery codes", () => {
  it("accepts saved codes in any spacing or case", () => {
    expect(recoveryCodeError("abcd-1234-ABCD-1234-abcd 1234 ABCD-1234")).toBe("");
  });
  it("explains the format", () => {
    expect(recoveryCodeError("invalid-code")).toContain("0–9 and letters A–F");
    expect(recoveryCodeError("")).toContain("Enter the recovery code");
  });
});
