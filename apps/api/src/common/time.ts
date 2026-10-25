// Thailand has no daylight saving, so Bangkok local time is a fixed +07:00 offset.
const OFFSET_MS = 7 * 60 * 60 * 1000;

export interface LocalParts {
  dayOfWeek: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
  dateKey: string; // YYYY-MM-DD in Bangkok
  hour: number;
}

export function bangkok(date: Date = new Date()): LocalParts {
  const local = new Date(date.getTime() + OFFSET_MS);
  return {
    dayOfWeek: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    dateKey: local.toISOString().slice(0, 10),
    hour: local.getUTCHours(),
  };
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** Start of the Bangkok day containing `date`, returned as a UTC instant. */
export function startOfBangkokDay(date: Date = new Date()): Date {
  const { dateKey } = bangkok(date);
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() - OFFSET_MS);
}

export function isWithinHours(opensAt: string, closesAt: string, at: Date = new Date()): boolean {
  const now = bangkok(at).minutes;
  const open = hhmmToMinutes(opensAt);
  const close = hhmmToMinutes(closesAt);
  return close > open ? now >= open && now < close : now >= open || now < close;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function startOfBangkokMonth(date: Date = new Date()): Date {
  const { dateKey } = bangkok(date);
  return new Date(`${dateKey.slice(0, 7)}-01T00:00:00+07:00`);
}
