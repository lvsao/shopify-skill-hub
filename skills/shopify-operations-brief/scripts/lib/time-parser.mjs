// Calendar-period parsing in the shop's IANA timezone.

function assertTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function formatDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function toDateString(date, timeZone) {
  const parts = formatDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function monthBoundary(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const afterMonth = new Date(Date.UTC(year, month, 1));
  afterMonth.setUTCDate(0);
  return { startDate, endDate: afterMonth.toISOString().slice(0, 10) };
}

function timezoneOffsetMs(timeZone, instant) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  const offset = (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
  return match[1] === '+' ? offset : -offset;
}

function localBoundaryToUtc(dateString, timeZone, endOfDay = false) {
  const localTime = endOfDay ? '23:59:59.999' : '00:00:00.000';
  const provisional = new Date(`${dateString}T${localTime}Z`);
  const offset = timezoneOffsetMs(timeZone, provisional);
  return new Date(provisional.getTime() - offset).toISOString();
}

function buildFilter(startDate, endDate, timeZone) {
  const start = localBoundaryToUtc(startDate, timeZone);
  const end = localBoundaryToUtc(endDate, timeZone, true);
  return `created_at:>=${start} AND created_at:<=${end}`;
}

function dayOfWeek(date, timeZone) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[short] || 1;
}

export function parseDiagnosticPeriod(inputPeriod = 'last-7-days', timezone = 'UTC', nowInput = null) {
  const timeZone = assertTimeZone(timezone);
  const now = nowInput ? new Date(nowInput) : new Date();
  if (Number.isNaN(now.valueOf())) throw new Error('INVALID_CURRENT_DATE: Unable to parse the supplied current date.');

  const input = (inputPeriod || 'last-7-days').trim().toLowerCase();
  const today = toDateString(now, timeZone);
  const { year, month } = formatDateParts(now, timeZone);
  let startDate;
  let endDate;
  let periodLabelZh = '近 7 天';
  let periodLabelEn = 'Past 7 Days';

  if (input === 'yesterday' || input.includes('昨天') || input.includes('昨日')) {
    startDate = addDays(today, -1);
    endDate = startDate;
    periodLabelZh = '昨日店铺经营概览';
    periodLabelEn = 'Yesterday Store Performance Overview';
  } else if (input === 'today' || input.includes('今天') || input.includes('今日')) {
    startDate = today;
    endDate = today;
    periodLabelZh = '今日店铺经营概览';
    periodLabelEn = 'Today Store Performance Overview';
  } else if (input === 'last-3-days' || input.includes('3天') || input.includes('3 days')) {
    startDate = addDays(today, -3);
    endDate = addDays(today, -1);
    periodLabelZh = '近 3 天店铺经营概览';
    periodLabelEn = 'Past 3 Days Store Performance Overview';
  } else if (input === 'last-week' || input.includes('上周')) {
    const lastSunday = addDays(today, -dayOfWeek(now, timeZone));
    startDate = addDays(lastSunday, -6);
    endDate = lastSunday;
    periodLabelZh = '上周店铺经营概览';
    periodLabelEn = 'Last Week Store Performance Overview';
  } else if (input === 'last-month' || input.includes('上个月') || input.includes('上月')) {
    const previousMonth = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
    const boundaries = monthBoundary(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth() + 1);
    startDate = boundaries.startDate;
    endDate = boundaries.endDate;
    periodLabelZh = `${previousMonth.getUTCMonth() + 1} 月店铺经营概览`;
    periodLabelEn = `Last Month (${previousMonth.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}) Store Performance Overview`;
  } else if (input.includes('7月') || input.includes('july')) {
    ({ startDate, endDate } = monthBoundary(Number(year), 7));
    periodLabelZh = '7 月店铺经营概览';
    periodLabelEn = 'July Store Performance Overview';
  } else if (input.includes('8月') || input.includes('august')) {
    ({ startDate, endDate } = monthBoundary(Number(year), 8));
    periodLabelZh = '8 月店铺经营概览';
    periodLabelEn = 'August Store Performance Overview';
  } else if (input.includes('..') || input.includes(' to ') || input.includes('至') || input.includes('~')) {
    const dates = input.split(/\.\.|\s+to\s+|至|~/).map((value) => value.trim()).filter(Boolean);
    if (dates.length !== 2 || !isValidDate(dates[0]) || !isValidDate(dates[1]) || dates[0] > dates[1]) {
      throw new Error('INVALID_PERIOD: Use YYYY-MM-DD..YYYY-MM-DD with a valid start date before the end date.');
    }
    [startDate, endDate] = dates;
    periodLabelZh = `自定义周期经营概览 (${startDate} ~ ${endDate})`;
    periodLabelEn = `Custom Period Store Performance Overview (${startDate} - ${endDate})`;
  } else if (input === 'last-30-days' || input.includes('30天') || input.includes('30 days') || input.includes('月度')) {
    startDate = addDays(today, -30);
    endDate = addDays(today, -1);
    periodLabelZh = '近 30 天店铺经营概览';
    periodLabelEn = 'Past 30 Days Store Performance Overview';
  } else {
    startDate = addDays(today, -7);
    endDate = addDays(today, -1);
    periodLabelZh = '近 7 天店铺经营概览';
    periodLabelEn = 'Past 7 Days Store Performance Overview';
  }

  const currentDays = Math.round((new Date(`${endDate}T12:00:00Z`) - new Date(`${startDate}T12:00:00Z`)) / 86_400_000) + 1;
  const previousEndDate = addDays(startDate, -1);
  const previousStartDate = addDays(previousEndDate, -(currentDays - 1));
  const display = (start, end) => `${start.replace(/-/g, '.')} - ${end.replace(/-/g, '.')}`;

  return {
    timezone: timeZone,
    current: {
      startDate,
      endDate,
      filter: buildFilter(startDate, endDate, timeZone),
      labelZh: periodLabelZh,
      labelEn: periodLabelEn,
      displayRange: display(startDate, endDate),
    },
    previous: {
      startDate: previousStartDate,
      endDate: previousEndDate,
      filter: buildFilter(previousStartDate, previousEndDate, timeZone),
      displayRange: display(previousStartDate, previousEndDate),
    },
  };
}
