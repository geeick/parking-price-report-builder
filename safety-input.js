(() => {
  "use strict";

  if (!window.ParkingAnalysis) return;

  const original = window.ParkingAnalysis;
  const originalDiscoverLocations = original.discoverLocations;
  const originalAnalyzeFiles = original.analyzeFiles;

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const LOCATION_FROM_FILE = [
    [/220\s*rose/i, "220 Rose Parking"],
    [/^407(?:\.|_|-|\s|$)/i, "407 Colorado Parking"],
    [/^601(?:\.|_|-|\s|$)/i, "601 Ocean Front Walk"],
    [/^801(?:\.|_|-|\s|$)/i, "801 Ocean Front Walk"],
    [/^1501(?:\.|_|-|\s|$)/i, "1501 Main Parking"],
    [/^3016(?:\.|_|-|\s|$)/i, "3016 Main Parking"],
    [/lincoln/i, "1218 1/2 Lincoln Blvd Parking"],
  ];

  const LOCATION_ALIASES = new Map([
    ["rose cafe", "220 Rose Parking"],
    ["220 rose", "220 Rose Parking"],
    ["220 rose parking", "220 Rose Parking"],
    ["bank of the west", "407 Colorado Parking"],
    ["407 colorado", "407 Colorado Parking"],
    ["407 colorado parking", "407 Colorado Parking"],
    ["1218 1/2 lincoln", "1218 1/2 Lincoln Blvd Parking"],
    ["1218 1/2 lincoln blvd", "1218 1/2 Lincoln Blvd Parking"],
    ["1218 1/2 lincoln blvd parking", "1218 1/2 Lincoln Blvd Parking"],
    ["1501 main", "1501 Main Parking"],
    ["1501 main st", "1501 Main Parking"],
    ["1501 main parking", "1501 Main Parking"],
    ["3016 main", "3016 Main Parking"],
    ["3016 main street", "3016 Main Parking"],
    ["3016 main street (t2p)", "3016 Main Parking"],
    ["3016 main parking", "3016 Main Parking"],
    ["601 ocean front walk", "601 Ocean Front Walk"],
    ["601 ocean front walk parking", "601 Ocean Front Walk"],
    ["801 ocean front walk", "801 Ocean Front Walk"],
    ["801 ocean front walk parking", "801 Ocean Front Walk"],
  ]);

  function clean(value) {
    return value == null ? "" : String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function canonicalLocation(value, file = null) {
    const raw = clean(value);
    const key = raw.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
    if (LOCATION_ALIASES.has(key)) return LOCATION_ALIASES.get(key);

    const fileName = clean(file?.name || file?.webkitRelativePath || "");
    for (const [pattern, location] of LOCATION_FROM_FILE) {
      if (pattern.test(fileName)) return location;
    }
    return raw;
  }

  function locationFromFile(file) {
    const candidate = `${file?.webkitRelativePath || ""}/${file?.name || ""}`;
    for (const [pattern, location] of LOCATION_FROM_FILE) {
      if (pattern.test(candidate)) return location;
    }
    return "";
  }

  async function decode(file) {
    const buffer = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (_) {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function parseMoney(value) {
    const text = clean(value).replace(/[$,]/g, "");
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function parseDate(value) {
    const text = clean(value);
    if (!text) return null;

    let match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (match) {
      const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),\s+(\d{4})\b/i);
    if (match) {
      const token = match[1].slice(0, 3).toLowerCase();
      const month = MONTH_NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === token);
      if (month >= 0) {
        const date = new Date(Number(match[3]), month, Number(match[2]), 12, 0, 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    return null;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function normalizeRevenueText(value) {
    return String(value || "")
      .replace(/&times;/gi, "×")
      .replace(/&#215;/gi, "×")
      .replace(/&rarr;/gi, "→")
      .replace(/&#8594;/gi, "→")
      .replace(/&gt;/gi, ">")
      .replace(/\u00a0/g, " ");
  }

  function parseRevenueText(value) {
    const text = normalizeRevenueText(value);
    const compact = clean(text);

    let summaryTickets = null;
    let summaryRevenue = null;
    const summaryMatch = compact.match(/(\d[\d,]*)\s*(?:→|->|>)\s*\$?([\d,]+(?:\.\d+)?)/);
    if (summaryMatch) {
      summaryTickets = Number(summaryMatch[1].replace(/,/g, ""));
      summaryRevenue = parseMoney(summaryMatch[2]);
    }

    const details = [];
    const detailRe = /(\d[\d,]*)\s*[x×*]\s*\$?([\d,]+(?:\.\d+)?)(?:\s*([A-Za-z][A-Za-z0-9_./-]*))?/gi;
    for (const match of compact.matchAll(detailRe)) {
      const tickets = Number(match[1].replace(/,/g, ""));
      const price = parseMoney(match[2]);
      if (!Number.isFinite(tickets) || price == null) continue;
      details.push({ tickets, price, type: clean(match[3]) || "UNKNOWN" });
    }

    return { summaryTickets, summaryRevenue, details };
  }

  function firstDateInCells(cells) {
    for (const cell of cells) {
      const parsed = parseDate(cell.textContent || "");
      if (parsed) return parsed;
    }
    return null;
  }

  function looksLikeRevenue(value) {
    const text = normalizeRevenueText(value);
    return /\$/.test(text) && (/[x×*]/i.test(text) || /(?:→|->|>)/.test(text));
  }

  function parseHtmlDocument(html, file) {
    const documentObject = new DOMParser().parseFromString(html, "text/html");
    const rows = [
      ...documentObject.querySelectorAll("#result_list tbody tr"),
      ...documentObject.querySelectorAll("table#result_list tr"),
    ];
    const uniqueRows = [...new Set(rows)];
    const shifts = [];
    const fileLocation = locationFromFile(file);

    for (const row of uniqueRows) {
      const cells = [...row.querySelectorAll("td")];
      if (!cells.length) continue;

      const dateCell = row.querySelector(".field-date");
      const locationCell = row.querySelector(".field-location_display");
      const periodCell = row.querySelector(".field-period");
      const revenueCell = row.querySelector(".field-revenue");

      const date = parseDate(dateCell?.textContent || "") || firstDateInCells(cells);
      if (!date) continue;

      let location = canonicalLocation(locationCell?.textContent || "", file);
      if (!location) location = fileLocation;
      if (!location) continue;

      let revenueText = revenueCell?.textContent || "";
      if (!looksLikeRevenue(revenueText)) {
        for (let index = cells.length - 1; index >= 0; index -= 1) {
          if (looksLikeRevenue(cells[index].textContent || "")) {
            revenueText = cells[index].textContent || "";
            break;
          }
        }
      }
      if (!looksLikeRevenue(revenueText)) continue;

      const parsed = parseRevenueText(revenueText);
      if (!parsed.details.length && parsed.summaryRevenue == null) continue;
      shifts.push({
        date,
        dateKey: dateKey(date),
        location,
        period: clean(periodCell?.textContent || ""),
        summaryTickets: parsed.summaryTickets,
        summaryRevenue: parsed.summaryRevenue,
        details: parsed.details,
        sourceFile: file.name,
      });
    }

    return shifts;
  }

  function splitHtmlDocuments(text) {
    if (!/<(?:!doctype\s+html|html\b|table\b|tr\b)/i.test(text)) return [];
    const starts = [];
    const regex = /<!doctype\s+html[^>]*>/gi;
    let match;
    while ((match = regex.exec(text)) !== null) starts.push(match.index);
    if (starts.length <= 1) return [text];
    const documents = [];
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const end = index + 1 < starts.length ? starts[index + 1] : text.length;
      documents.push(text.slice(start, end));
    }
    return documents;
  }

  function parseLooseText(text, file) {
    const fileLocation = locationFromFile(file);
    if (!fileLocation) return [];
    const lines = String(text).replace(/\r/g, "").split("\n");
    const byDate = new Map();
    let currentDate = null;

    function ensure(date) {
      const key = dateKey(date);
      if (!byDate.has(key)) {
        byDate.set(key, {
          date,
          dateKey: key,
          location: fileLocation,
          period: "",
          summaryTickets: null,
          summaryRevenue: null,
          details: [],
          sourceFile: file.name,
        });
      }
      return byDate.get(key);
    }

    for (const rawLine of lines) {
      const line = normalizeRevenueText(rawLine);
      const parsedDate = parseDate(line);
      if (parsedDate) currentDate = parsedDate;
      if (!currentDate) continue;

      const parsedRevenue = parseRevenueText(line);
      if (!parsedRevenue.details.length && parsedRevenue.summaryRevenue == null) continue;
      const shift = ensure(currentDate);
      if (parsedRevenue.summaryTickets != null) shift.summaryTickets = parsedRevenue.summaryTickets;
      if (parsedRevenue.summaryRevenue != null) shift.summaryRevenue = parsedRevenue.summaryRevenue;
      shift.details.push(...parsedRevenue.details);
    }

    return [...byDate.values()].filter((row) => row.details.length || row.summaryRevenue != null);
  }

  function dedupeShifts(shifts) {
    const result = [];
    const seen = new Set();
    for (const shift of shifts) {
      const detailSignature = shift.details
        .map((detail) => `${detail.tickets}x${detail.price}:${detail.type}`)
        .sort()
        .join("|");
      const key = [
        shift.dateKey,
        shift.location,
        shift.period,
        shift.summaryTickets,
        shift.summaryRevenue,
        detailSignature,
      ].join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(shift);
    }
    return result;
  }

  async function parseSafetyFile(file) {
    const text = await decode(file);
    let shifts = [];
    for (const html of splitHtmlDocuments(text)) {
      shifts.push(...parseHtmlDocument(html, file));
    }
    if (!shifts.length) shifts = parseLooseText(text, file);
    return dedupeShifts(shifts);
  }

  function isSafetyCandidate(file) {
    const name = String(file?.name || "").toLowerCase();
    return /\.(?:txt|html?|mhtml)$/.test(name);
  }

  function selectedLocationSet(options) {
    return Array.isArray(options?.selectedLocations) ? new Set(options.selectedLocations) : null;
  }

  function buildSafetyDaily(shifts, options) {
    const selected = selectedLocationSet(options);
    const days = new Map();
    const priceRows = new Map();
    let excludedOverstayTickets = 0;

    for (const shift of shifts) {
      if (selected && !selected.has(shift.location)) continue;
      const detailRows = shift.details.filter((detail) => {
        if (!options?.excludeExtensions) return true;
        const type = clean(detail.type).toUpperCase();
        const excluded = /^(?:OT|OS|OVERSTAY|OVERTIME|EXT|EEX|EOS)$/.test(type);
        if (excluded) excludedOverstayTickets += detail.tickets;
        return !excluded;
      });

      let tickets = 0;
      let revenue = 0;
      if (detailRows.length) {
        for (const detail of detailRows) {
          tickets += detail.tickets;
          revenue += detail.tickets * detail.price;
          const priceKey = `${shift.location}|${shift.dateKey}|${detail.price}`;
          if (!priceRows.has(priceKey)) {
            priceRows.set(priceKey, {
              Date: shift.date,
              "Date Key": shift.dateKey,
              Location: shift.location,
              Price: detail.price,
              "Tickets Bought": 0,
              Revenue: 0,
              Types: new Set(),
            });
          }
          const priceRow = priceRows.get(priceKey);
          priceRow["Tickets Bought"] += detail.tickets;
          priceRow.Revenue += detail.tickets * detail.price;
          priceRow.Types.add(detail.type);
        }
      } else if (!options?.excludeExtensions && shift.summaryRevenue != null) {
        tickets = Number(shift.summaryTickets) || 0;
        revenue = Number(shift.summaryRevenue) || 0;
      }

      if (!tickets && !revenue) continue;
      const dayKey = `${shift.location}|${shift.dateKey}`;
      if (!days.has(dayKey)) {
        days.set(dayKey, {
          Location: shift.location,
          Date: shift.date,
          "Date Key": shift.dateKey,
          tickets: 0,
          revenue: 0,
        });
      }
      const day = days.get(dayKey);
      day.tickets += tickets;
      day.revenue += revenue;
    }

    return {
      days,
      priceRows: [...priceRows.values()].map((row) => ({
        ...row,
        Revenue: Math.round((row.Revenue + Number.EPSILON) * 100) / 100,
        Types: [...row.Types].sort().join(" | "),
      })),
      excludedOverstayTickets,
    };
  }

  function resolveDayKeys(data) {
    const keys = new Set();
    for (const row of data || []) {
      const date = row["Entry DateTime"] instanceof Date
        ? row["Entry DateTime"]
        : parseDate(row["Entry Time"] || "");
      if (!date) continue;
      const location = canonicalLocation(row.Location);
      if (!location) continue;
      keys.add(`${location}|${dateKey(date)}`);
    }
    return keys;
  }

  function combineMonthlyTotals(baseTotals, safetyDays, resolveKeys) {
    const groups = new Map();

    for (const total of baseTotals || []) {
      const key = `${total.Location}|${total.Year}|${total["Month Number"]}`;
      groups.set(key, { ...total });
    }

    let safetyDaysUsed = 0;
    let safetyDaysSkipped = 0;
    let safetyTicketsAdded = 0;

    for (const [dayKey, day] of safetyDays.entries()) {
      if (resolveKeys.has(dayKey)) {
        safetyDaysSkipped += 1;
        continue;
      }
      const year = day.Date.getFullYear();
      const monthNumber = day.Date.getMonth() + 1;
      const key = `${day.Location}|${year}|${monthNumber}`;
      if (!groups.has(key)) {
        groups.set(key, {
          Location: day.Location,
          Year: year,
          "Month Number": monthNumber,
          Month: MONTH_NAMES[monthNumber - 1],
          "Total Tickets": 0,
          "Total Revenue": 0,
          "Average Ticket": 0,
        });
      }
      const group = groups.get(key);
      group["Total Tickets"] += day.tickets;
      group["Total Revenue"] += day.revenue;
      safetyDaysUsed += 1;
      safetyTicketsAdded += day.tickets;
    }

    const totals = [...groups.values()];
    for (const total of totals) {
      total["Total Revenue"] = Math.round((Number(total["Total Revenue"] || 0) + Number.EPSILON) * 100) / 100;
      total["Average Ticket"] = total["Total Tickets"]
        ? Math.round(((total["Total Revenue"] / total["Total Tickets"]) + Number.EPSILON) * 100) / 100
        : 0;
    }
    totals.sort((a, b) => a.Location.localeCompare(b.Location) || a.Year - b.Year || a["Month Number"] - b["Month Number"]);
    return { totals, safetyDaysUsed, safetyDaysSkipped, safetyTicketsAdded };
  }

  original.discoverLocations = async function discoverLocationsWithSafety(files, onProgress = () => {}) {
    const resolveFiles = files.filter((file) => !isSafetyCandidate(file));
    const safetyFiles = files.filter(isSafetyCandidate);
    const locations = new Set();
    const warnings = [];

    if (resolveFiles.length) {
      try {
        const result = await originalDiscoverLocations(resolveFiles, onProgress);
        for (const location of result.locations || []) locations.add(canonicalLocation(location));
        warnings.push(...(result.warnings || []));
      } catch (error) {
        warnings.push(error.message || String(error));
      }
    }

    for (let index = 0; index < safetyFiles.length; index += 1) {
      const file = safetyFiles[index];
      onProgress({ completed: index, total: safetyFiles.length, message: `Reading Safety Park locations from ${file.name}` });
      try {
        const shifts = await parseSafetyFile(file);
        for (const shift of shifts) locations.add(shift.location);
        if (!shifts.length) {
          const fallback = locationFromFile(file);
          if (fallback) locations.add(fallback);
          warnings.push(`${file.name}: no Shift Report rows were parsed; using the filename only for location discovery.`);
        }
      } catch (error) {
        const fallback = locationFromFile(file);
        if (fallback) locations.add(fallback);
        warnings.push(`${file.name}: ${error.message || String(error)}`);
      }
    }

    return {
      locations: [...locations].filter(Boolean).sort((a, b) => a.localeCompare(b)),
      warnings,
    };
  };

  original.analyzeFiles = async function analyzeFilesWithSafety(files, options = {}, onProgress = () => {}) {
    const resolveFiles = files.filter((file) => !isSafetyCandidate(file));
    const safetyFiles = files.filter(isSafetyCandidate);

    let analysis;
    if (resolveFiles.length) {
      analysis = await originalAnalyzeFiles(resolveFiles, options, onProgress);
    } else {
      analysis = {
        data: [],
        weekdayWeekend: [],
        byWeekday: [],
        monthlyTotals: [],
        stats: {
          filesRead: 0,
          filesFailed: 0,
          rowsAnalyzed: 0,
          extensionsRemoved: 0,
          duplicatesRemoved: 0,
          nonPriceDurationRowsExcluded: 0,
          lowVolumeModeRowsExcluded: 0,
        },
        warnings: [],
      };
    }

    const shifts = [];
    let safetyFilesRead = 0;
    for (let index = 0; index < safetyFiles.length; index += 1) {
      const file = safetyFiles[index];
      onProgress({ phase: "read", completed: index, total: safetyFiles.length, message: `Reading Safety Park page ${file.name}` });
      try {
        const parsed = await parseSafetyFile(file);
        if (!parsed.length) {
          analysis.warnings.push(`${file.name}: no Safety Park Show Details rows could be parsed.`);
          continue;
        }
        shifts.push(...parsed);
        safetyFilesRead += 1;
      } catch (error) {
        analysis.warnings.push(`${file.name}: ${error.message || String(error)}`);
      }
    }

    if (safetyFiles.length && !safetyFilesRead && !resolveFiles.length) {
      throw new Error("The Safety Park files were selected, but their saved-page contents could not be parsed. Please refresh the site and choose the original saved Shift Report .txt/.html files again.");
    }

    const safety = buildSafetyDaily(shifts, options);
    const resolveKeys = resolveDayKeys(analysis.data);
    const combined = combineMonthlyTotals(analysis.monthlyTotals, safety.days, resolveKeys);

    analysis.monthlyTotals = combined.totals;
    analysis.dailyPriceCounts = safety.priceRows;
    analysis.stats.filesRead = Number(analysis.stats.filesRead || 0) + safetyFilesRead;
    analysis.stats.filesFailed = files.length - analysis.stats.filesRead;
    analysis.stats.safetyFilesRead = safetyFilesRead;
    analysis.stats.safetyShiftRowsRead = shifts.length;
    analysis.stats.safetyDaysUsed = combined.safetyDaysUsed;
    analysis.stats.safetyDaysSkippedBecauseResolve = combined.safetyDaysSkipped;
    analysis.stats.safetyTicketsAdded = combined.safetyTicketsAdded;
    analysis.stats.safetyOverstayTicketsExcluded = safety.excludedOverstayTickets;
    analysis.stats.rowsAnalyzed = Number(analysis.stats.rowsAnalyzed || 0) + combined.safetyTicketsAdded;
    analysis.stats.extensionsRemoved = Number(analysis.stats.extensionsRemoved || 0) + safety.excludedOverstayTickets;

    if (combined.safetyDaysSkipped) {
      analysis.warnings.push(`${combined.safetyDaysSkipped.toLocaleString()} Safety Park location-days also existed in Resolve and were skipped so revenue is not double-counted.`);
    }
    if (safetyFilesRead && !resolveFiles.length) {
      analysis.warnings.push("Safety Park Show Details files provide exact daily price/count/revenue data but do not identify purchased duration. Duration-based price tables require a Resolve/Scan2Pay report; revenue and daily exact-price counts still build from Safety Park alone.");
    }

    if (!analysis.monthlyTotals.length) {
      throw new Error("The reports were read, but no monthly parking totals could be created from them.");
    }

    return analysis;
  };

  window.ParkingAnalysis = original;
})();
