export function parseBirth(value, { date1904 = false } = {}) {
  const empty = {
    birthDate: null,
    birthYear: null,
    birthPrecision: "unknown",
    birthMonth: null,
    birthDay: null,
  };
  if (value === null || value === undefined || String(value).trim() === "")
    return {
      ...empty,
      review: "확인 필요",
      reason: "생년월일이 비어 있습니다.",
    };
  if (value instanceof Date)
    return full(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  if (typeof value === "number" && value > 10000 && value < 100000) {
    const d = new Date(
      Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) +
        Math.floor(value) * 86400000,
    );
    return full(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = String(value).trim();
  if (/^\d{4}(?:년)?$/.test(text)) {
    const year = Number(text.slice(0, 4));
    if (year >= 1900 && year <= new Date().getFullYear())
      return {
        ...empty,
        birthYear: year,
        birthPrecision: "year",
        review: "확인 필요",
        reason: "생년만 있어 월·일 확인이 필요합니다.",
      };
  }
  const match = text.match(
    /^(\d{4})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})(?:일)?$/,
  );
  if (match) return full(+match[1], +match[2], +match[3]);
  return {
    ...empty,
    review: "오류",
    reason: "생년월일을 YYYY-MM-DD 또는 4자리 생년으로 확인해 주세요.",
  };
}
function full(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > new Date().getFullYear() ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date > Date.now()
  )
    return {
      birthDate: null,
      birthYear: null,
      birthMonth: null,
      birthDay: null,
      birthPrecision: "unknown",
      review: "오류",
      reason: "유효하지 않은 생년월일입니다.",
    };
  return {
    birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    birthPrecision: "date",
    review: "정상",
    reason: "",
  };
}
