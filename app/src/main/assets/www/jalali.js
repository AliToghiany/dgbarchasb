/* ============================================================
   تاریخ شمسی، نرمال‌سازی فارسی، اعداد به حروف و ابزارهای تخصصی برچسب
   ============================================================ */

const APP_VERSION = "3.3 Android";

const NORM_MAP = {
  "ي": "ی", "ى": "ی", "ئ": "ی",
  "ك": "ک", "ة": "ه", "ۀ": "ه",
  "أ": "ا", "إ": "ا", "آ": "ا", "ؤ": "و",
  "\u200c": " ", "\u200b": "", "\u0640": "",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "×": "x", "*": "x", "،": ","
};

function normalizePersian(text) {
  if (text === null || text === undefined) return "";
  let s = String(text).trim().toLowerCase();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    out += NORM_MAP[s[i]] !== undefined ? NORM_MAP[s[i]] : s[i];
  }
  return out.replace(/\s+/g, " ");
}

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400)
    + gd + g_d_m[gm - 1];
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  const pad = n => String(n).padStart(2, "0");
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

function getTodayJalali(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function getNowJalaliStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${getTodayJalali(0)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseNumber(val) {
  if (val === null || val === undefined) return 0;
  const cleaned = normalizePersian(String(val))
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/\//g, ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount) {
  const n = Math.round(Number(amount) || 0);
  return n.toLocaleString("en-US");
}

function formatQty(qty) {
  const n = Number(qty) || 0;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// تبدیل عدد به حروف فارسی
const _ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const _TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const _TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const _HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const _SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];

function _threeDigits(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h) parts.push(_HUNDREDS[h]);
  if (rem >= 10 && rem <= 19) {
    parts.push(_TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t) parts.push(_TENS[t]);
    if (o) parts.push(_ONES[o]);
  }
  return parts.join(" و ");
}

function numberToPersianWords(num, suffix = "تومان") {
  let n = Math.round(Number(num) || 0);
  if (n === 0) return `صفر ${suffix}`.trim();
  const neg = n < 0;
  n = Math.abs(n);
  const groups = [];
  let idx = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const cw = _threeDigits(chunk);
      const sc = _SCALES[idx] || "";
      if (idx === 1 && chunk === 1) groups.push("هزار");
      else if (sc) groups.push(`${cw} ${sc}`);
      else groups.push(cw);
    }
    n = Math.floor(n / 1000);
    idx++;
  }
  const text = (neg ? "منفی " : "") + groups.reverse().join(" و ");
  return `${text} ${suffix}`.trim();
}

const ORDER_WORKFLOW_STAGES = [
  "پیش‌نویس",
  "دریافت طرح",
  "تأیید طرح",
  "در حال چاپ",
  "برش و رول‌پیچی",
  "بسته‌بندی",
  "ارسال شده",
  "تحویل شده",
  "لغو / مرجوعی"
];

const WORKFLOW_BADGES = {
  "پیش‌نویس": { label: "📝 پیش‌نویس", cls: "badge-gray" },
  "دریافت طرح": { label: "🔵 دریافت طرح", cls: "badge-blue" },
  "تأیید طرح": { label: "🟣 تأیید طرح", cls: "badge-purple" },
  "در حال چاپ": { label: "🟡 در حال چاپ", cls: "badge-amber" },
  "برش و رول‌پیچی": { label: "✂️ برش و رول‌پیچی", cls: "badge-orange" },
  "بسته‌بندی": { label: "📦 بسته‌بندی", cls: "badge-sky" },
  "ارسال شده": { label: "🚚 ارسال شده", cls: "badge-teal" },
  "تحویل شده": { label: "✅ تحویل شده", cls: "badge-green" },
  "لغو / مرجوعی": { label: "🔴 لغو / مرجوعی", cls: "badge-red" }
};

const PRODUCT_TYPES = [
  "رول برچسب",
  "ریبون",
  "رول مادر (Jumbo)",
  "پرینتر لیبل‌زن",
  "بارکدخوان",
  "لوازم جانبی",
  "خدمات / چاپ"
];

const MESSENGERS = [
  "واتساپ", "تلگرام", "اینستاگرام", "ایتا",
  "روبیکا", "بله", "وب‌سایت", "تماس تلفنی", "حضوری"
];

const ORDER_KINDS = ["چاپ سفارشی", "سفارش آماده (انبار)", "ترکیبی (انبار + چاپ)"];
const INVOICE_TYPES = ["فاکتور فروش", "پیش‌فاکتور", "فاکتور خرید", "برگشت از فروش", "برگشت از خرید"];
const MATERIALS = ["", "کاغذی (آرت/صدفی)", "حرارتی (Thermal)", "PP (پلی‌پروپیلن)", "PET (پلی‌استر)", "PVC (پی‌وی‌سی)", "متالایز", "اموال شبرنگ"];
const ADHESIVES = ["", "دائم (Permanent)", "قابل‌جداشدن (Removable)", "فریزری (Freezer)", "سوپر چسب / هات‌ملت"];
const COLUMNS_LIST = ["", "تک‌ردیفه", "دوردیفه", "سه‌ردیفه", "چهارردیفه", "پنج‌ردیفه"];
const PRINT_METHODS = ["", "حرارتی مستقیم (Direct Thermal)", "انتقال حرارتی (Thermal Transfer)"];
const CORE_SIZES = ["", "۱ اینچ (25mm)", "۱.۵ اینچ (40mm)", "۲ اینچ (50mm)", "۳ اینچ (76mm)"];
const GAP_TYPES = ["", "گپ (Gap)", "مارک سیاه (Black Mark)", "پیوسته (Continuous)", "پرفراژدار"];
const RIBBON_TYPES = ["", "واکس (Wax)", "واکس‌رزین (Wax-Resin)", "رزین (Resin)", "واش‌کر (پارچه)"];
const RIBBON_WINDS = ["", "Out (رو به بیرون)", "In (رو به داخل)"];
const PAYMENT_METHODS = ["کارت به کارت", "کارت‌خوان (POS)", "نقد", "حواله پایا / ساتنا", "چک"];
const CHECK_STATUSES = ["در جریان", "وصول شده", "برگشتی", "واگذار شده"];

function getStatusBadge(status) {
  return WORKFLOW_BADGES[status] || { label: status || "دریافت طرح", cls: "badge-blue" };
}

function buildProductSpecText(p) {
  if (!p) return "";
  const parts = [];
  if (p.product_type === "رول برچسب") {
    if (p.size_spec) parts.push(`سایز ${p.size_spec}`);
    if (p.columns_count) parts.push(p.columns_count);
    if (p.material) parts.push(`جنس ${p.material}`);
    if (p.print_method) parts.push(p.print_method);
    if (p.adhesive_type) parts.push(`چسب ${p.adhesive_type}`);
    if (Number(p.labels_per_roll) > 0) parts.push(`${formatQty(p.labels_per_roll)} عددی`);
    if (p.core_size) parts.push(`هسته ${p.core_size}`);
  } else if (p.product_type === "ریبون") {
    if (p.size_spec) parts.push(`ابعاد ${p.size_spec}`);
    if (p.ribbon_type) parts.push(p.ribbon_type);
    if (p.ribbon_wind) parts.push(`وایند ${p.ribbon_wind}`);
  } else {
    if (p.size_spec) parts.push(p.size_spec);
    if (p.material) parts.push(p.material);
    if (p.brand) parts.push(p.brand);
  }
  return parts.join(" | ");
}

function getTieredPrice(p, priceGroup = "خرده‌فروشی", qty = 1) {
  if (!p) return 0;
  const baseMap = {
    "خرده‌فروشی": Number(p.retail_price) || 0,
    "عمده‌فروشی": Number(p.wholesale_price) || 0,
    "همکار": Number(p.partner_price) || 0
  };
  let price = baseMap[priceGroup] || Number(p.retail_price) || 0;
  if (price <= 0) price = Number(p.retail_price) || 0;

  const t2Min = Number(p.tier2_min_qty) || 0;
  const t2Price = Number(p.tier2_price) || 0;
  const t1Min = Number(p.tier1_min_qty) || 0;
  const t1Price = Number(p.tier1_price) || 0;

  if (t2Min > 0 && qty >= t2Min && t2Price > 0) {
    price = price > 0 ? Math.min(price, t2Price) : t2Price;
  } else if (t1Min > 0 && qty >= t1Min && t1Price > 0) {
    price = price > 0 ? Math.min(price, t1Price) : t1Price;
  }
  return price;
}

function summarizeOrderItems(items) {
  if (!items || !items.length) return "فقط طراحی/کلیشه";
  if (items.length === 1) {
    const it = items[0];
    const u = it.unit || (it.calc_type === "متری" ? "متر" : "عدد");
    return `${formatQty(it.quantity)} ${u}`;
  }
  const meter = items.filter(i => i.calc_type === "متری");
  const other = items.filter(i => i.calc_type !== "متری");
  if (meter.length && other.length) return `${meter.length} متری + ${other.length} رول/عددی`;
  if (meter.length) {
    const sum = meter.reduce((a, b) => a + (Number(b.quantity) || 0), 0);
    return `${meter.length} ردیف متری (${formatQty(sum)} متر)`;
  }
  const sumC = other.reduce((a, b) => a + (Number(b.quantity) || 0), 0);
  return `${other.length} قلم (${formatQty(sumC)} عدد/رول)`;
}

function attachMoneyFormatting(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    const raw = inputEl.value.trim();
    if (!raw) return;
    const n = Math.round(parseNumber(raw));
    inputEl.value = n === 0 && raw !== "0" && raw !== "۰" ? "" : formatMoney(n);
  });
}


function utcNowIso() {
  return new Date().toISOString();
}

function makeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
