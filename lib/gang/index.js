export const STORAGE = "gang-checkin-reconstructed-v1";
export const DEFAULT_USER = { username: "Admin", password: "789632" };

export const ensureDefaultUser = (data) => ({
  ...data,
  users: [DEFAULT_USER],
  ...(data.currentUser === DEFAULT_USER.username
    ? { currentUser: DEFAULT_USER.username }
    : {}),
});

export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

export const clean = (value) =>
  value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bid\s*[:：]?\s*\d+/gi, " ")
    .replace(/[.…]+\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

export const keyOf = (value) =>
  clean(value)
    .toLowerCase()
    .replace(
      /^(เด็กชาย|เด็กหญิง|ด\.?ช\.?|ด\.?ญ\.?|นางสาว|น\.?ส\.?|นาย|นาง|master|mr|mrs|ms|miss)\s*\.?/i,
      "",
    )
    .replace(/[^a-z0-9ก-๿]+/g, "");

export const similarity = (left, right) => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (longer.includes(shorter) && shorter.length >= 4) return 0.86;
  const rows = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = rows[j];
      rows[j] = Math.min(
        rows[j] + 1,
        rows[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return 1 - rows[right.length] / Math.max(left.length, right.length);
};

export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const readStore = () => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE) || "{}");
  } catch {
    return {};
  }
};

export const writeStore = (data) =>
  window.localStorage.setItem(STORAGE, JSON.stringify(data));
