// Dates locales en chaînes AAAA-MM-JJ. Semaine du lundi au dimanche.

export function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function today() {
  return ymd(new Date());
}
export function addDays(dateStr, n) {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function mondayOf(dateStr) {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
export function dayNum(dateStr) {
  return Math.round(parseYmd(dateStr).getTime() / 864e5);
}
export function prettyDate(dateStr) {
  return parseYmd(dateStr).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
export function longDate(dateStr) {
  return parseYmd(dateStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
export function shortDate(dateStr) {
  return parseYmd(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
// « hier », « lundi », « il y a 9 jours »
export function ago(dateStr, ref = today()) {
  const n = dayNum(ref) - dayNum(dateStr);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "hier";
  if (n < 7) return parseYmd(dateStr).toLocaleDateString("fr-FR", { weekday: "long" });
  return `il y a ${n} jours`;
}
