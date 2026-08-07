(() => {
  "use strict";

  if (!window.ParkingAnalysis) return;

  const base = window.ParkingAnalysis;
  const originalDiscoverLocations = base.discoverLocations.bind(base);
  const originalAnalyzeFiles = base.analyzeFiles.bind(base);
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const SUMMARY_RE = /(\d[\d,]*)\s*(?:→|->|>)\s*\$?([\d,]+(?:\.\d+)?)/;
  const DETAIL_RE = /(\d[\d,]*)\s*[x×*]\s*\$?([\d,]+(?:\.\d+)?)(?:\s+([A-Za-z][A-Za-z0-9_./-]*))?/gi;

  function clean(value) {
    return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
  }

  function money(value) {
    const n = Number(clean(value).replaceAll("$", "").replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  }

  function parseDate(text) {
    const value = clean(text).replace(/\.$/, "");
    let match = value.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(\d{4})$/i);
    if (match) {
      const token = match[1].slice(0, 3).toLowerCase();
      const month = MONTH_NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === token);
      if (month >= 0) return new Date(Number(match[3]), month, Number(match[2]), 12, 0, 0, 0);
    }
    match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12, 0, 0, 0);
    return null;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseRevenueBlob(text) {
    const compact = clean(text);
    const summaryMatch = compact.match(SUMMARY_RE);
    const summaryTickets = summaryMatch ? Number(summaryMatch[1].replaceAll(",", "")) : null;
    const summaryRevenue = summaryMatch ? money(summaryMatch[2]) : null;
    const details = [];
    DETAIL_RE.lastIndex = 0;
    let match;
    while ((match = DETAIL_RE.exec(compact)) !== null) {
      const tickets = Number(match[1].replaceAll(",", ""));
      const price = money(match[2]);
      if (!Number.isFinite(tickets) || price == null) continue;
      details.push({ tickets, price, type: clean(match[3]) || "UNKNOWN" });
    }
    return { summaryTickets, summaryRevenue, details };
  }

  function parseHtml(text, file) {
    if (!/<(?:!doctype\s+html|html\b)/i.test(text)) return null;
    const doc = new DOMParser().parseFromString(text, "text/html");
    const rows = [...doc.querySelectorAll("#result_list tbody tr, #changelist-form tbody tr")];
    const shifts = [];

    for (const row of rows) {
      const dateText = clean(row.querySelector(".field-date")?.textContent);
      const date = parseDate(dateText);
      const rawLocation = clean(row.querySelector(".field-location_display")?.textContent);
      const revenueCell = row.querySelector(".field-revenue");
      if (!date || !rawLocation || !revenueCell) continue;

      const parsed = parseRevenueBlob(revenueCell.textContent || "");
      if (!parsed.details.length) continue;

      shifts.push({
        date,
        dateKey: dateKey(date),
        location: base.canonicalLocation ? base.canonicalLocation(rawLocation, file) : rawLocation,
        rawLocation,
        weekday: clean(row.querySelector(".field-weekday_display")?.textContent),
        period: clean(row.querySelector(".field-period")?.textContent),
        summaryTickets: parsed.summaryTickets,
        summaryRevenue: parsed.summaryRevenue,
        details: parsed.details,
      });
    }
    return shifts.length ? shifts : null;
  }

  function parsePlainSafety(text, file) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    const shifts = [];
    let current = null;

    function finish() {
      if (current?.details.length) shifts.push(current);
      current = null;
    }

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = raw.split(/\t+/).map((part) => part.trim());
      const maybeDate = parts.length >= 2 ? parseDate(parts[0]) : null;
      if (maybeDate && parts[1] && money(parts[1]) == null) {
        finish();
        current = {
          date: maybeDate,
          dateKey: dateKey(maybeDate),
          location: base.canonicalLocation ? base.canonicalLocation(parts[1], file) : parts[1],
          rawLocation: parts[1],
          weekday: "",
          period: "",
          summaryTickets: null,
          summaryRevenue: null,
          details: [],
        };
        continue;
      }
      if (!current) continue;
      const parsed = parseRevenueBlob(line);
      if (parsed.summaryRevenue != null && !parsed.details.length) {
        current.summaryTickets = parsed.summaryTickets;
        current.summaryRevenue = parsed.summaryRevenue;
      }
      for (const detail of parsed.details) current.details.push(detail);
    }
    finish();
    return shifts.length ? shifts : null;
  }

  async function readSafetyFile(file) {
    if (file.name.toLowerCase().endsWith(".csv")) return null;
    const text = await file.text();
    return parseHtml(text, file) || parsePlainSafety(text, file);
  }

  function shiftsToText(shifts) {
    const lines = [];
    for (const shift of shifts) {
      lines.push(`${MONTH_NAMES[shift.date.getMonth()].slice(0, 3)} ${shift.date.getDate()}, ${shift.date.getFullYear()}\t${shift.rawLocation}`);
      if (shift.summaryRevenue != null) lines.push(`${shift.summaryTickets || 0} → $${shift.summaryRevenue.toFixed(2)}`);
      for (const detail of shift.details) lines.push(`${detail.tickets} × $${detail.price.toFixed(2)} ${detail.type}`);
    }
    return lines.join("\n");
  }

  async function prepareFiles(files) {
    const prepared = [];
    const safetyByOriginal = new Map();
    for (const file of files) {
      let shifts = null;
      try { shifts = await readSafetyFile(file); } catch (_) { shifts = null; }
      if (shifts?.length) {
        safetyByOriginal.set(file, shifts);
        prepared.push(new File([shiftsToText(shifts)], `${file.name}.safety.txt`, { type: "text/plain", lastModified: file.lastModified }));
      } else prepared.push(file);
    }
    return { prepared, safetyByOriginal };
  }

  function resolveDailyMap(data) {
    const groups = new Map();
    for (const row of data || []) {
      const date = row["Entry DateTime"] instanceof Date ? row["Entry DateTime"] : null;
      if (!date) continue;
      const key = `${row.Location}|${dateKey(date)}`;
      if (!groups.has(key)) groups.set(key, { location: row.Location, date, tickets: 0, revenue: 0 });
      const group = groups.get(key);
      group.tickets += 1;
      group.revenue += Number(row.Amount) || 0;
    }
    return groups;
  }

  function aggregateSafety(shifts, options) {
    const selected = Array.isArray(options.selectedLocations) ? new Set(options.selectedLocations) : null;
    const days = new Map();
    const prices = new Map();
    let excluded = 0;
    for (const shift of shifts) {
      if (selected && !selected.has(shift.location)) continue;
      let tickets = 0;
      let revenue = 0;
      for (const detail of shift.details) {
        const type = clean(detail.type).toUpperCase();
        if (options.excludeExtensions && /^(?:OS|OVERSTAY|OVERTIME)$/.test(type)) {
          excluded += detail.tickets;
          continue;
        }
        tickets += detail.tickets;
        revenue += detail.tickets * detail.price;
        const pkey = `${shift.location}|${shift.dateKey}|${detail.price}`;
        if (!prices.has(pkey)) prices.set(pkey, { Date: shift.date, "Date Key": shift.dateKey, Location: shift.location, Price: detail.price, "Tickets Bought": 0, Revenue: 0, Types: new Set() });
        const p = prices.get(pkey);
        p["Tickets Bought"] += detail.tickets;
        p.Revenue += detail.tickets * detail.price;
        p.Types.add(detail.type);
      }
      if (!tickets && !revenue) continue;
      const dkey = `${shift.location}|${shift.dateKey}`;
      if (!days.has(dkey)) days.set(dkey, { location: shift.location, date: shift.date, tickets: 0, revenue: 0 });
      const d = days.get(dkey);
      d.tickets += tickets;
      d.revenue += revenue;
    }
    return {
      days,
      excluded,
      prices: [...prices.values()].map((row) => ({ ...row, Revenue: Math.round(row.Revenue * 100) / 100, Types: [...row.Types].sort().join(" | ") })).sort((a, b) => a.Date - b.Date || a.Location.localeCompare(b.Location) || a.Price - b.Price),
    };
  }

  function monthlyFromDaily(resolveDays, safetyDays) {
    const combined = new Map(resolveDays);
    let used = 0;
    let overlap = 0;
    for (const [key, value] of safetyDays.entries()) {
      if (combined.has(key)) { overlap += 1; continue; }
      combined.set(key, value);
      used += 1;
    }
    const months = new Map();
    for (const row of combined.values()) {
      const year = row.date.getFullYear();
      const monthNumber = row.date.getMonth() + 1;
      const key = `${row.location}|${year}|${monthNumber}`;
      if (!months.has(key)) months.set(key, { Location: row.location, Year: year, "Month Number": monthNumber, Month: MONTH_NAMES[monthNumber - 1], "Total Tickets": 0, "Total Revenue": 0 });
      const m = months.get(key);
      m["Total Tickets"] += row.tickets;
      m["Total Revenue"] += row.revenue;
    }
    const totals = [...months.values()].map((m) => ({ ...m, "Total Revenue": Math.round(m["Total Revenue"] * 100) / 100, "Average Ticket": m["Total Tickets"] ? Math.round((m["Total Revenue"] / m["Total Tickets"]) * 100) / 100 : 0 })).sort((a, b) => a.Location.localeCompare(b.Location) || a.Year - b.Year || a["Month Number"] - b["Month Number"]);
    return { totals, used, overlap };
  }

  base.discoverLocations = async function discoverLocations(files, onProgress = () => {}) {
    const { prepared } = await prepareFiles(files);
    return originalDiscoverLocations(prepared, onProgress);
  };

  base.analyzeFiles = async function analyzeFiles(files, options = {}, onProgress = () => {}) {
    const { prepared, safetyByOriginal } = await prepareFiles(files);
    const result = await originalAnalyzeFiles(prepared, options, onProgress);
    const allShifts = [...safetyByOriginal.values()].flat();
    if (!allShifts.length) return result;

    const safety = aggregateSafety(allShifts, options);
    const monthly = monthlyFromDaily(resolveDailyMap(result.data), safety.days);
    result.monthlyTotals = monthly.totals;
    result.dailyPriceCounts = safety.prices;
    result.stats = result.stats || {};
    result.stats.safetyDaysUsed = monthly.used;
    result.stats.safetyDaysSkippedBecauseResolve = monthly.overlap;
    result.stats.safetyOverstayTicketsExcluded = safety.excluded;
    result.stats.safetyFilesRead = safetyByOriginal.size;
    result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    if (monthly.overlap) result.warnings.push(`${monthly.overlap.toLocaleString()} Safety Park location-days overlapped Resolve transactions. Resolve was used for those days so revenue and tickets are not double-counted.`);
    result.warnings.push("Safety Park Show Details pages provide exact daily price/count totals but not purchased duration labels. Duration price tables therefore use Resolve/Scan2Pay transactions; Safety Park pages supplement monthly revenue/ticket coverage and the hidden Safety Daily Prices sheet.");
    return result;
  };
})();
