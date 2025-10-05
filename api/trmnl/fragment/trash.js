import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Los_Angeles";
const ACTIVE_WEEKDAY = 0;
const ACTIVE_START = { hour: 6, minute: 0 };
const ACTIVE_END = { hour: 21, minute: 30 };
const RECYCLE_ANCHOR_SUNDAY = "2025-08-24";

const nowLocal = () => dayjs().tz(TZ);
const startOfLocalDay = (d = dayjs()) => d.tz(TZ).startOf("day");

function isWithinActiveWindow(d = nowLocal()) {
  const local = d.tz(TZ);
  if (local.day() !== ACTIVE_WEEKDAY) return false;
  const start = local
    .hour(ACTIVE_START.hour)
    .minute(ACTIVE_START.minute)
    .second(0);
  const end = local
    .hour(ACTIVE_END.hour)
    .minute(ACTIVE_END.minute)
    .second(0);
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
  const force = String(req.query.force || "").toLowerCase();
  const forceActive = String(req.query.active || "") === "1";
  const dateOverride = req.query.date;
  const b64 = String(req.query.b64 || "") === "1";
  const diag = String(req.query.diag || "") === "1";

  const localNow = dateOverride ? dayjs.tz(dateOverride, TZ) : nowLocal();
  const updatedAt = localNow.format("MMM D, h:mm a");

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

  const forwardedProto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "";
  const origin = host ? `${forwardedProto}://${host}` : "";
  const recycleSrc = origin ? `${origin}/recycle.svg?v=2` : "/recycle.svg?v=2";
  const IMG_RECYCLE = `<img src="${recycleSrc}" alt="Recycle" width="160" height="160" />`;
  const icon = recycle ? SVG_TRASH + IMG_RECYCLE : SVG_TRASH;

  const startStr = `${String(ACTIVE_START.hour).padStart(2, "0")}:${String(
    ACTIVE_START.minute
  ).padStart(2, "0")}`;
  const endStr = `${String(ACTIVE_END.hour).padStart(2, "0")}:${String(
    ACTIVE_END.minute
  ).padStart(2, "0")}`;
  const subtitleText = `Sun ${startStr}-${endStr} | Updated ${updatedAt}`;

  const fragment = `\
<div class="screen">
  <div class="view view--full">
    <div class="layout wrap">
      <div class="stack">
        <div class="icons">${icon}</div>
        <div class="title">${label}</div>
        <div class="subtitle">${subtitleText}</div>
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
    <div class="layout wrap">
      <div class="stack">
        <div class="subtitle">${subtitleText}</div>
      </div>
    </div>
    <div class="title_bar">
      <span class="title">Pickup</span>
      <span class="instance">Inactive</span>
    </div>
  </div>
</div>`;

  const activeNow = forceActive || isWithinActiveWindow(localNow);
  const htmlOut = activeNow ? fragment : fragmentInactive;

  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (method === "HEAD") {
    res.status(200).end();
    return;
  }

  const payload = b64
    ? { html_base64: Buffer.from(htmlOut, "utf8").toString("base64"), encoding: "base64" }
    : { html: htmlOut };

  if (diag) {
    payload.diag = {
      method,
      headers: {
        accept: req.headers["accept"],
        user_agent: req.headers["user-agent"],
        host: req.headers["host"],
        x_forwarded_proto: req.headers["x-forwarded-proto"],
        x_forwarded_host: req.headers["x-forwarded-host"],
      },
      updated_at: updatedAt,
      active: activeNow,
    };
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(payload));
}
