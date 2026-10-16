// Mirrors backend/lib/security.php so people see the same message before a request is sent.
// The server remains the authority; keep the wording of both in sync.
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

// Emoji, pictographs, flags, and the joiners/selectors that build them.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;
// Control, zero-width, bidirectional-override, private-use, unassigned, and lone surrogate characters.
const INVISIBLE = /\p{C}/u;
const HIDDEN = "contains a hidden character, such as a tab or line break. Try typing it instead of pasting.";
// Same list as COMMON_PASSWORDS in security.php.
const COMMON_PASSWORDS = new Set(["password", "password1", "password12", "password123", "password1!", "password123!",
  "passw0rd", "p@ssw0rd", "p@ssword", "12345678", "123456789", "1234567890", "0987654321", "87654321",
  "11111111", "00000000", "12341234", "11223344", "qwertyui", "qwertyuiop", "qwerty12", "qwerty123",
  "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "q1w2e3r4", "asdfghjk", "asdfghjkl", "abcd1234",
  "abc12345", "abcdefgh", "a1b2c3d4", "aa123456", "iloveyou", "sunshine", "princess", "football",
  "baseball", "superman", "starwars", "trustno1", "welcome1", "welcome123", "letmein1", "changeme",
  "admin123", "whatever", "computer", "internet", "notely123", "notely2026"]);

const count = (value: string) => [...value].length;
const trimEdges = (value: string) => value.replace(/^[\s\p{Z}]+|[\s\p{Z}]+$/gu, "");

export function normalizeName(name: string) {
  return trimEdges(name).replace(/\p{Z}+/gu, " ").normalize("NFC");
}

export function normalizeEmail(email: string) {
  return trimEdges(email).toLowerCase();
}

export function nameError(raw: string): string {
  const name = normalizeName(raw);
  const length = count(name);
  if (length === 0) return "Enter your name.";
  if (length > NAME_MAX) return `Your name can be at most ${NAME_MAX} characters. It currently has ${length}.`;
  if (EMOJI.test(name)) return "Your name can’t include emoji. Use letters only.";
  if (INVISIBLE.test(name)) return `Your name ${HIDDEN}`;
  if (/\p{N}/u.test(name)) return "Your name can’t include numbers.";
  const symbol = name.match(/[^\p{L}\p{M} '’.-]/u);
  if (symbol) return `Your name can’t include "${symbol[0]}". Use letters, spaces, hyphens (-), apostrophes ('), and periods (.).`;
  if (!/^\p{L}/u.test(name)) return "Your name must start with a letter.";
  // Count marks on the fully decomposed form so a precomposed letter can't hide one.
  if (/\p{M}{3,}/u.test(name.normalize("NFD"))) return "Your name has too many accent marks stacked on one letter.";
  return "";
}

export function emailError(raw: string): string {
  const email = normalizeEmail(raw);
  if (!email) return "Enter your email address.";
  if (EMOJI.test(email)) return "Email addresses can’t include emoji.";
  if (INVISIBLE.test(email)) return `Your email address ${HIDDEN}`;
  if (/[\s\p{Z}]/u.test(email)) return "Email addresses can’t contain spaces.";
  const other = email.match(/[^\x21-\x7E]/u);
  if (other) return `Email addresses can’t include "${other[0]}". Use unaccented letters, numbers, and symbols such as . _ - +`;
  if (email.length > EMAIL_MAX) return `Email addresses can be at most ${EMAIL_MAX} characters.`;
  if (email.split("@").length !== 2) return "Email addresses need exactly one @, like name@university.edu.";
  const [local, domain] = email.split("@");
  if (!local || !/^[^.].*\.[a-z0-9-]{2,}$/i.test(domain) || domain.includes("..") || local.includes(".."))
    return "Enter a complete email address, like name@university.edu.";
  return "";
}

/** Characters a new password may not contain; never echoes the password's own characters. */
export function passwordCharacterError(password: string): string {
  if (EMOJI.test(password)) return "Passwords can’t include emoji. Use letters, numbers, spaces, and keyboard symbols such as ! ? # $";
  if (INVISIBLE.test(password)) return `Your password ${HIDDEN}`;
  // Printable ASCII only: the same on every keyboard, and one byte per character so bcrypt never truncates.
  if (/[^\x20-\x7E]/.test(password))
    return "Passwords can’t include accented letters or characters from other alphabets, such as é, ñ, or ß. Use A–Z, numbers, spaces, and keyboard symbols.";
  return "";
}

export function passwordError(password: string): string {
  const character = passwordCharacterError(password);
  if (character) return character;
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password. It currently has ${password.length}.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters for your password. It currently has ${password.length}.`;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "This password is too common and easy to guess. Try a short phrase instead.";
  return "";
}

export function recoveryCodeError(code: string): string {
  const compact = code.replace(/[\s-]+/g, "").toUpperCase();
  if (!compact) return "Enter the recovery code you saved when you signed up.";
  if (!/^[A-F0-9]{32}$/.test(compact))
    return "Recovery codes have 32 characters using only numbers 0–9 and letters A–F, like 1A2B-3C4D-….";
  return "";
}
