const TIMEZONE = 'America/Lima';

/** Returns current date in Peru timezone as YYYY-MM-DD string */
export function getTodayDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Returns current Date adjusted to Peru timezone */
export function getNowInTimezone(): Date {
  const now = new Date();
  const peruTime = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  return peruTime;
}
