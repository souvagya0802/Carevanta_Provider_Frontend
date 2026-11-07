const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');
const dt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const d = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

/** Minor units (paise) → "₹1,234.56". */
export const money = (minor: number | null | undefined, currency = 'INR') =>
  minor == null ? '—' : currency === 'INR' ? inr.format(minor / 100) : `${currency} ${(minor / 100).toFixed(2)}`;
export const count = (n: number | null | undefined) => (n == null ? '—' : num.format(n));
export const dateTime = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : '—');
export const date = (iso: string | null | undefined) => (iso ? d.format(new Date(iso)) : '—');
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
/** Title Case for enum-like values: `PENDING_VERIFICATION` → `Pending Verification`. */
export const title = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, (c) => c.toUpperCase()) : '—';
export const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');
export const minutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const relative = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

/** Current time in ms. Lives here so components can read the clock without the React Compiler flagging an impure call in render. */
export const nowMs = () => Date.now();

/**
 * `<input type="datetime-local">` holds a wall-clock time with no zone. The
 * portal works in Indian Standard Time whatever the device's zone is, so the
 * value is written and read as IST (+05:30, no daylight saving).
 */
const IST_OFFSET_MS = 330 * 60_000;
/** ISO instant → "YYYY-MM-DDTHH:mm" in IST, for a datetime-local input. */
export const toIstInput = (iso: string | number | Date) => new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
/** "YYYY-MM-DDTHH:mm" read as IST → ISO instant. Returns null for an empty or invalid value. */
export const fromIstInput = (value: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = new Date(`${value}:00+05:30`).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
