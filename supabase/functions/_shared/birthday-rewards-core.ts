export const BIRTHDAY_CHANGE_COOLDOWN_DAYS = 365;
export const BIRTHDAY_CLAIM_COOLDOWN_DAYS = 365;
export const BIRTHDAY_CLAIM_WINDOW_DAYS = 30;
export const STANDARD_PRO_PASS_DAYS = 7;
export const PRO_RENEWAL_CREDIT_CENTS = 5000;
export const PRO_RENEWAL_CREDIT_CURRENCY = "cad";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BirthdayPlan = "basic" | "pro";

export function normalizeBirthdayPlan(plan: unknown): BirthdayPlan {
  return String(plan || "").toLowerCase() === "pro" ? "pro" : "basic";
}

export function paidSubscriptionIsEligible(status: unknown) {
  return String(status || "").toLowerCase() === "active";
}

export function validBirthday(month: unknown, day: unknown) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;
  const maximum = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= maximum;
}

export function validTimeZone(timezone: unknown) {
  const value = String(timezone || "").trim();
  if (!value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

export function zonedDateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function utcDayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function birthdayForYear(year: number, month: number, day: number) {
  if (month === 2 && day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCDate() !== 29) {
    return { year, month: 2, day: 28 };
  }
  return { year, month, day };
}

export function birthdayWindowState(now: Date, timezone: string, birthMonth: number, birthDay: number) {
  const local = zonedDateParts(now, timezone);
  const today = utcDayNumber(local.year, local.month, local.day);
  const candidates = [local.year, local.year - 1].map((year) => birthdayForYear(year, birthMonth, birthDay));
  const active = candidates
    .map((birthday) => ({ birthday, elapsed: today - utcDayNumber(birthday.year, birthday.month, birthday.day) }))
    .find((entry) => entry.elapsed >= 0 && entry.elapsed < BIRTHDAY_CLAIM_WINDOW_DAYS);
  const upcoming = birthdayForYear(
    utcDayNumber(local.year, birthMonth, birthDay) >= today ? local.year : local.year + 1,
    birthMonth,
    birthDay,
  );
  return {
    eligibleNow: !!active,
    daysRemaining: active ? BIRTHDAY_CLAIM_WINDOW_DAYS - active.elapsed : 0,
    birthdayYear: active ? active.birthday.year : null,
    nextBirthday: `${upcoming.year}-${String(upcoming.month).padStart(2, "0")}-${String(upcoming.day).padStart(2, "0")}`,
  };
}

export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

export function rollingCooldownState(now: Date, lastClaimedAt: string | null | undefined) {
  if (!lastClaimedAt) return { blocked: false, nextEligibleAt: null };
  const claimed = new Date(lastClaimedAt);
  if (!Number.isFinite(claimed.getTime())) return { blocked: false, nextEligibleAt: null };
  const next = addDays(claimed, BIRTHDAY_CLAIM_COOLDOWN_DAYS);
  return { blocked: now < next, nextEligibleAt: next.toISOString() };
}

export function rewardForPlan(plan: unknown) {
  return normalizeBirthdayPlan(plan) === "pro"
    ? {
      rewardType: "pro_renewal_credit" as const,
      amountOffCents: PRO_RENEWAL_CREDIT_CENTS,
      currency: PRO_RENEWAL_CREDIT_CURRENCY,
    }
    : {
      rewardType: "standard_pro_week" as const,
      passDays: STANDARD_PRO_PASS_DAYS,
    };
}
