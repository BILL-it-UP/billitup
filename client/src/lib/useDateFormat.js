import { useEffect, useState } from "react";
import { api, getCachedDateFormat, setCachedDateFormat } from "./api";

// List pages (Dashboard, Quotes, Credit Notes) show a raw date per row but
// don't get a full business object back with each row the way a single
// invoice/quote/credit-note detail does — so this hook fetches the current
// business's date_format once and hands it back for formatDate() to use.
// The cache lives in lib/api.js (setSession/clearSession clear it there) so
// switching firms or logging in as someone else never shows a stale value
// left over from a different business.
export function useDateFormat() {
  const [format, setFormat] = useState(getCachedDateFormat() || "DD/MM/YYYY");

  useEffect(() => {
    if (getCachedDateFormat()) return;
    api.getBusiness().then((business) => {
      const value = business.date_format || "DD/MM/YYYY";
      setCachedDateFormat(value);
      setFormat(value);
    }).catch(() => {});
  }, []);

  return format;
}
