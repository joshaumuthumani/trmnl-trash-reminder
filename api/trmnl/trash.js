import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// ---- CONFIG ----
const TZ = "America/Los_Angeles";
const ACTIVE_WEEKDAY = 0;                     // Sunday
const ACTIVE_START = { hour: 18, minute: 0 }; // 6:00 PM
const ACTIVE_END   = { hour: 20, minute: 30 };// 8:30 PM
const RECYCLE_ANCHOR_SUNDAY = "2025-08-24";   // known T+R Sunday

// ---- HELPERS ----
const nowLocal = () => dayjs().tz(TZ);
const startOfLocalDay = (d = dayjs()) => d.tz(TZ).startOf("day");

function isWithinActiveWindow(d = nowLocal()) {
  const local = d.tz(TZ);
  if (local.day() !== ACTIVE_WEEKDAY) return false;
  const start = local.hour(ACTIVE_START.hour).minute(ACTIVE_START.minute).second(0);
  const end   = local.hour(ACTIVE_END.hour).minute(ACTIVE_END.minute).second(0);
  return local.isAfter(start) && local.isBefore(end);
}

function thisSunday(d = nowLocal()) {
  const local = d.tz(TZ);
  const delta = (local.day() - 0 + 7) % 7;
  return local.subtract(delta, "day").startOf("day");
}

function isRecycleSunday(d = nowLocal()) {
  const sunday = thisSunday(d);
  const anchor = startOfLocalDay(dayjs(RECYCLE_ANCHOR_SUNDAY));
  const weeks = sunday.diff(anchor, "week");
  return ((weeks % 2) + 2) % 2 === 0; // safe modulo
}

export default function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const force = String(req.query.force || "").toLowerCase();  // "recycle"
  const forceActive = String(req.query.active || "") === "1";  // preview
  const dateOverride = req.query.date;                         // YYYY-MM-DD
  const localNow = dateOverride ? dayjs.tz(dateOverride, TZ) : nowLocal();
  const updatedAt = localNow.format("MMM D, h:mm a");

  const inactive = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://usetrmnl.com/css/latest/plugins.css">
    <script src="https://usetrmnl.com/js/latest/plugins.js"></script>
  </head>
  <body class="environment trmnl">
    <div class="screen">
      <div class="view view--full">
        <div class="layout"></div>
        <div class="title_bar">
          <span class="title">Pickup</span>
          <span class="instance">Inactive</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const recycle = force === "recycle" ? true : isRecycleSunday(localNow);
  const label = recycle ? "Trash + Recycle" : "Trash";

  const SVG_TRASH = `
    <svg width="160" height="160" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="24" y="36" width="80" height="84" rx="6" ry="6" stroke="#000" fill="none" stroke-width="4"/>
      <rect x="16" y="28" width="96" height="10" fill="#000"/>
      <rect x="46" y="10" width="36" height="14" rx="4" fill="#000"/>
      <line x1="44" y1="48" x2="44" y2="108" stroke="#000" stroke-width="4"/>
      <line x1="64" y1="48" x2="64" y2="108" stroke="#000" stroke-width="4"/>
      <line x1="84" y1="48" x2="84" y2="108" stroke="#000" stroke-width="4"/>
    </svg>`;

  // Build absolute URL for assets to work in fragment renders
  const forwardedProto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "";
  const origin = host ? `${forwardedProto}://${host}` : "";
  const recycleSrc = origin ? `${origin}/recycle.svg?v=2` : "/recycle.svg?v=2";
  const IMG_RECYCLE = `<img src="${recycleSrc}" alt="Recycle" width="160" height="160" />`;
  const icon = recycle ? SVG_TRASH + IMG_RECYCLE : SVG_TRASH;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://usetrmnl.com/css/latest/plugins.css">
    <script src="https://usetrmnl.com/js/latest/plugins.js"></script>
    <style>
      .wrap{display:flex;align-items:center;justify-content:center;height:100%;}
      .stack{text-align:center}
      .title{font-size:32px;font-weight:800;margin-top:8px}
      .subtitle{font-size:14px;opacity:.7;margin-top:4px}
      .icons{display:flex;gap:12px;align-items:center;justify-content:center}
    </style>
  </head>
  <body class="environment trmnl">
    <div class="screen">
      <div class="view view--full">
        <div class="layout wrap">
          <div class="stack">
            <div class="icons">${icon}</div>
            <div class="title">${label}</div>
            <div class="subtitle">Sun ${String(ACTIVE_START.hour)}:${String(ACTIVE_START.minute).padStart(2,"0")}–${String(ACTIVE_END.hour)}:${String(ACTIVE_END.minute).padStart(2,"0")} • Updated ${updatedAt}</div>
          </div>
        </div>
        <div class="title_bar">
          <span class="title">Pickup</span>
          <span class="instance">Sunday</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

  // --- Fragment support for TRMNL Private Plugins ---
  const isFragment = String(req.query.fragment || "") === "1";
  const activeNow = forceActive || isWithinActiveWindow(localNow);

  const fragment = `\
<div class="screen">
  <div class="view view--full">
    <div class="layout wrap">
      <div class="stack">
        <div class="icons">${icon}</div>
        <div class="title">${label}</div>
        <div class="subtitle">Sun ${String(ACTIVE_START.hour)}:${String(ACTIVE_START.minute).padStart(2,"0")}–${String(ACTIVE_END.hour)}:${String(ACTIVE_END.minute).padStart(2,"0")} • Updated ${updatedAt}</div>
      </div>
    </div>
    <div class="title_bar">
      <span class="title">Pickup</span>
      <span class="instance">Sunday</span>
    </div>
  </div>
</div>`;

  const fragmentInactive = `\
<div class="screen">
  <div class="view view--full">
    <div class="layout"></div>
    <div class="title_bar">
      <span class="title">Pickup</span>
      <span class="instance">Inactive</span>
    </div>
  </div>
</div>`;

  // If TRMNL is expecting JSON, return an envelope { html: "..." }
  if (isFragment) {
    const body = { html: activeNow ? fragment : fragmentInactive };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (method === "HEAD") {
      res.status(200).end();
      return;
    }
    res.status(200).send(JSON.stringify(body));
    return;
  }

  const out = activeNow ? html : inactive;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (method === "HEAD") {
    res.status(200).end();
    return;
  }
  res.status(200).send(out);
}
