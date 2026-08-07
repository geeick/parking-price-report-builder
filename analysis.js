(() => {
  "use strict";

  const REQUIRED_COLUMNS = ["Location", "Amount", "Duration(hh:mm)", "Entry Time"];
  const EXTENSION_SUFFIX_RE = /-(?:EXT|EEX|EOS|OS)$/i;
  const CLOCK_DURATION_RE = /^(\d+):(\d{2})$/;
  const SAFETY_SUMMARY_RE = /^\s*(\d[\d,]*)\s*(?:→|->|>)\s*\$?([\d,]+(?:\.\d+)?)\s*$/;
  const SAFETY_DETAIL_RE = /^\s*(\d[\d,]*)\s*[x×*]\s*\$?([\d,]+(?:\.\d+)?)(?:\s+(.+?))?\s*$/i;
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const WEEKDAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const WEEKDAY_SORT = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
    ["1501 main st", "1501 Main Parking"],
    ["1501 main", "1501 Main Parking"],
    ["1501 main parking", "1501 Main Parking"],
    ["3016 main street (t2p)", "3016 Main Parking"],
    ["3016 main street", "3016 Main Parking"],
    ["3016 main", "3016 Main Parking"],
    ["3016 main parking", "3016 Main Parking"],
    ["601 ocean front walk", "601 Ocean Front Walk"],
    ["601 ocean front walk parking", "601 Ocean Front Walk"],
    ["801 ocean front walk", "801 Ocean Front Walk"],
    ["801 ocean front walk parking", "801 Ocean Front Walk"],
  ]);

  function cleanText(value) {
    return value == null ? "" : String(value).trim();
  }

  function normalizeLocationKey(value) {
    return cleanText(value).toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  }

  function canonicalLocation(value, file = null) {
    const raw = cleanText(value);
    const key = normalizeLocationKey(raw);
    if (LOCATION_ALIASES.has(key)) return LOCATION_ALIASES.get(key);

    const path = cleanText(file?.webkitRelativePath || file?.name).replaceAll("\\", "/").toLowerCase();
    const pathRules = [
      [/\/(?:220 ?rose)(?:\/|$)|^220 ?rose(?:\/|$)/, "220 Rose Parking"],
      [/\/(?:407)(?:\/|$)|^407(?:\/|$)/, "407 Colorado Parking"],
      [/\/(?:601)(?:\/|$)|^601(?:\/|$)/, "601 Ocean Front Walk"],
      [/\/(?:801)(?:\/|$)|^801(?:\/|$)/, "801 Ocean Front Walk"],
      [/\/(?:1501)(?:\/|$)|^1501(?:\/|$)/, "1501 Main Parking"],
      [/\/(?:3016)(?:\/|$)|^3016(?:\/|$)/, "3016 Main Parking"],
      [/\/(?:lincoln)(?:\/|$)|^lincoln(?:\/|$)/, "1218 1/2 Lincoln Blvd Parking"],
    ];
    for (const [pattern, canonical] of pathRules) {
      if (pattern.test(path)) return canonical;
    }
    return raw;
  }

  function parseMoney(value) {
    const cleaned = cleanText(value).replaceAll("$", "").replaceAll(",", "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function parseEntryDate(value) {
    const text = cleanText(value);
    if (!text) return null;

    let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (match) {
      const [, monthText, dayText, yearText, hourText, minuteText, periodText] = match;
      let hour = Number(hourText);
      const period = periodText.toUpperCase();
      if (period === "AM" && hour === 12) hour = 0;
      if (period === "PM" && hour !== 12) hour += 12;
      const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), hour, Number(minuteText), 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    match = text.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),\s+(\d{4})$/i);
    if (match) {
      const token = match[1].replace(/\.$/, "").slice(0, 3).toLowerCase();
      const monthNumber = MONTH_NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === token) + 1;
      if (monthNumber > 0) {
        const date = new Date(Number(match[3]), monthNumber - 1, Number(match[2]), 12, 0, 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function normalizeDuration(value) {
    const text = cleanText(value);
    if (!text) return "";
    const match = text.match(CLOCK_DURATION_RE);
    if (!match) return text;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const pieces = [];
    if (hours) pieces.push(`${hours}h`);
    if (minutes) pieces.push(`${minutes} mins`);
    return pieces.length ? pieces.join(" ") : "0 mins";
  }

  function clockDurationMinutes(value) {
    const match = cleanText(value).match(CLOCK_DURATION_RE);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function elapsedMinutes(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) return null;
    const difference = (end.getTime() - start.getTime()) / 60000;
    return Number.isFinite(difference) && difference >= 0 ? difference : null;
  }

  function isLikelyPurchasedDuration(record, durationRaw, entryDate) {
    const durationMinutes = clockDurationMinutes(durationRaw);
    if (durationMinutes == null) return true;
    const possibleEndDates = [parseEntryDate(record["Transaction Time"]), parseEntryDate(record["Exit Time"])];
    for (const endDate of possibleEndDates) {
      const observedMinutes = elapsedMinutes(entryDate, endDate);
      if (observedMinutes != null && observedMinutes > 5 && Math.abs(observedMinutes - durationMinutes) <= 3) return false;
    }
    return [0, 15, 30, 45, 59].includes(durationMinutes % 60);
  }

  function durationMinutesFromLabel(value) {
    const text = cleanText(value);
    if (!text) return null;
    const clockMatch = text.match(CLOCK_DURATION_RE);
    if (clockMatch) return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
    const readableMatch = text.match(/^(?:(\d+)h)?\s*(?:(\d+)\s*mins?)?$/i);
    if (readableMatch && (readableMatch[1] || readableMatch[2])) return Number(readableMatch[1] || 0) * 60 + Number(readableMatch[2] || 0);
    return null;
  }

  function isProtectedLongStayProduct(value) {
    const text = cleanText(value);
    if (!text) return false;
    if (/\b(?:overnight|all[ -]?day|until|till)\b/i.test(text)) return true;
    const minutes = durationMinutesFromLabel(text);
    return minutes != null && minutes >= 20 * 60;
  }

  function durationSortValue(value) {
    const text = cleanText(value);
    const match = text.match(CLOCK_DURATION_RE);
    if (match) return [0, Number(match[1]) * 60 + Number(match[2]), text.toLowerCase()];
    const readable = text.match(/^(?:(\d+)h)?\s*(?:(\d+)\s*mins?)?$/i);
    if (readable && (readable[1] || readable[2])) return [0, Number(readable[1] || 0) * 60 + Number(readable[2] || 0), text.toLowerCase()];
    return [1, 0, text.toLowerCase()];
  }

  function compareTuples(left, right) {
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
  }

  async function decodeFile(file) {
    const buffer = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (_) {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function parseResolveCsv(text, file) {
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
    if (parsed.errors?.length) {
      const serious = parsed.errors.filter((error) => error.code !== "TooFewFields");
      if (serious.length) throw new Error(serious[0].message || "CSV parsing failed.");
    }
    const rows = parsed.data;
    let headerIndex = -1;
    for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
      const values = new Set((rows[index] || []).map(cleanText));
      if (REQUIRED_COLUMNS.every((column) => values.has(column))) {
        headerIndex = index;
        break;
      }
    }
    if (headerIndex < 0) return null;
    const headers = (rows[headerIndex] || []).map(cleanText);
    const records = [];
    for (const rawRow of rows.slice(headerIndex + 1)) {
      const row = rawRow || [];
      if (!row.some((value) => cleanText(value))) continue;
      const record = { "Source File": file.name, "Source Kind": "Resolve" };
      headers.forEach((header, index) => {
        if (header) record[header] = row[index] ?? "";
      });
      records.push(record);
    }
    return records;
  }

  function splitSafetyHeader(line) {
    const parts = line.split(/\t+/).map(cleanText);
    if (parts.length < 2) return null;
    const date = parseEntryDate(parts[0]);
    if (!date) return null;
    const location = parts[1];
    if (!location || parseMoney(location) != null) return null;
    return { date, location };
  }

  function parseSafetyShiftText(text, file) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    const shifts = [];
    let current = null;
    function finishCurrent() {
      if (!current) return;
      if (current.summaryRevenue != null || current.details.length) shifts.push(current);
      current = null;
    }

    for (const rawLine of lines) {
      const line = cleanText(rawLine);
      if (!line) continue;
      const header = splitSafetyHeader(rawLine);
      if (header) {
        finishCurrent();
        current = {
          "Source File": file.name,
          "Source Path": file.webkitRelativePath || file.name,
          "Source Kind": "Safety Park Shift",
          Date: header.date,
          "Date Key": dateKey(header.date),
          Location: canonicalLocation(header.location, file),
          "Raw Location": header.location,
          summaryTickets: null,
          summaryRevenue: null,
          details: [],
        };
        continue;
      }
      if (!current || line === "-") continue;
      const summary = line.match(SAFETY_SUMMARY_RE);
      if (summary) {
        current.summaryTickets = Number(summary[1].replaceAll(",", ""));
        current.summaryRevenue = parseMoney(summary[2]);
        continue;
      }
      const detail = line.match(SAFETY_DETAIL_RE);
      if (detail) {
        const tickets = Number(detail[1].replaceAll(",", ""));
        const price = parseMoney(detail[2]);
        const type = cleanText(detail[3]) || "UNKNOWN";
        if (Number.isFinite(tickets) && price != null) current.details.push({ tickets, price, type });
      }
    }
    finishCurrent();
    const detailCount = shifts.reduce((sum, shift) => sum + shift.details.length, 0);
    if (!shifts.length || !detailCount) return null;
    return shifts;
  }

  async function parseInputFile(file) {
    const text = await decodeFile(file);
    const resolve = parseResolveCsv(text, file);
    if (resolve) return { kind: "resolve", records: resolve };
    const safety = parseSafetyShiftText(text, file);
    if (safety) return { kind: "safety", records: safety };
    throw new Error("Unsupported file format. Expected a Resolve/Scan2Pay CSV or Safety Park Show Details text.");
  }

  async function discoverLocations(files, onProgress = () => {}) {
    const locations = new Set();
    const warnings = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({ completed: index, total: files.length, message: `Finding locations in ${file.name}` });
      try {
        const parsed = await parseInputFile(file);
        for (const record of parsed.records) {
          const location = canonicalLocation(record.Location, file);
          if (location) locations.add(location);
        }
      } catch (error) {
        warnings.push(`${file.name}: ${error.message}`);
      }
    }
    onProgress({ completed: files.length, total: files.length, message: "Location list ready" });
    return { locations: [...locations].sort((a, b) => a.localeCompare(b)), warnings };
  }

  function cleanAndPrepare(records, options) {
    const includeExtensions = !options.excludeExtensions;
    const includeFailed = !options.excludeFailed;
    const selectedLocations = Array.isArray(options.selectedLocations) ? new Set(options.selectedLocations) : null;
    const stats = {
      originalRows: records.length,
      invalidRowsRemoved: 0,
      failedPaymentsRemoved: 0,
      extensionsRemoved: 0,
      locationsFilteredOut: 0,
      duplicatesRemoved: 0,
      nonPriceDurationRowsExcluded: 0,
      priceModeRowsAnalyzed: 0,
      lowVolumeModeRowsExcluded: 0,
      lowVolumeWeekdayRowsExcluded: 0,
      rowsAnalyzed: 0,
    };
    const valid = [];
    for (const record of records) {
      const location = canonicalLocation(record.Location);
      const ticket = cleanText(record["Ticket#"]);
      const durationRaw = cleanText(record["Duration(hh:mm)"]);
      const amount = parseMoney(record.Amount);
      const entryDate = parseEntryDate(record["Entry Time"]);
      if (selectedLocations && location && !selectedLocations.has(location)) {
        stats.locationsFilteredOut += 1;
        continue;
      }
      if (!location || amount == null || !durationRaw || !entryDate) {
        stats.invalidRowsRemoved += 1;
        continue;
      }
      const paymentStatus = cleanText(record["Payment Status"]).toUpperCase();
      if (!includeFailed && paymentStatus && paymentStatus !== "SUCCEEDED") {
        stats.failedPaymentsRemoved += 1;
        continue;
      }
      const extendedBy = cleanText(record["Extended By"]);
      const description = cleanText(record["Transaction Description"]);
      const isExtension = EXTENSION_SUFFIX_RE.test(ticket) || Boolean(extendedBy) || /extension/i.test(description);
      if (!includeExtensions && isExtension) {
        stats.extensionsRemoved += 1;
        continue;
      }
      const isPriceDuration = isLikelyPurchasedDuration(record, durationRaw, entryDate);
      const monthNumber = entryDate.getMonth() + 1;
      const weekday = WEEKDAY_NAMES[entryDate.getDay()];
      valid.push({
        ...record,
        Location: location,
        "Ticket#": ticket,
        Amount: amount,
        "Duration Raw": durationRaw,
        Duration: normalizeDuration(durationRaw),
        "Is Price Duration": isPriceDuration,
        "Entry DateTime": entryDate,
        "Date Key": dateKey(entryDate),
        Year: entryDate.getFullYear(),
        "Month Number": monthNumber,
        Month: MONTH_NAMES[monthNumber - 1],
        Weekday: weekday,
        "Day Group": entryDate.getDay() === 0 || entryDate.getDay() === 6 ? "Weekend" : "Weekday",
      });
    }

    const deduplicated = [];
    const seen = new Set();
    for (const row of valid) {
      const key = JSON.stringify([row.Location, row["Ticket#"], cleanText(row["Transaction Time"]), row.Amount, row["Duration Raw"]]);
      if (seen.has(key)) {
        stats.duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      deduplicated.push(row);
    }
    stats.rowsAnalyzed = deduplicated.length;
    stats.priceModeRowsAnalyzed = deduplicated.filter((row) => row["Is Price Duration"] !== false).length;
    stats.nonPriceDurationRowsExcluded = stats.rowsAnalyzed - stats.priceModeRowsAnalyzed;
    return { data: deduplicated, stats };
  }

  function summarizeModes(data, dayColumn) {
    const groups = new Map();
    for (const row of data) {
      if (row["Is Price Duration"] === false) continue;
      const keyParts = [row.Location, row.Year, row["Month Number"], row.Month, row[dayColumn], row.Duration];
      const key = JSON.stringify(keyParts);
      if (!groups.has(key)) groups.set(key, { keyParts, prices: new Map(), totalTickets: 0 });
      const group = groups.get(key);
      group.totalTickets += 1;
      group.prices.set(row.Amount, (group.prices.get(row.Amount) || 0) + 1);
    }
    const dayOrder = dayColumn === "Day Group" ? ["Weekday", "Weekend"] : WEEKDAY_SORT;
    const dayIndex = new Map(dayOrder.map((value, index) => [value, index]));
    const records = [];
    for (const group of groups.values()) {
      const [location, year, monthNumber, month, dayValue, duration] = group.keyParts;
      const sortedPriceCounts = [...group.prices.entries()].sort((a, b) => a[0] - b[0]);
      const highestCount = Math.max(...sortedPriceCounts.map(([, count]) => count));
      const tiedModes = sortedPriceCounts.filter(([, count]) => count === highestCount).map(([price]) => Number(price));
      records.push({
        Location: location,
        Year: year,
        "Month Number": monthNumber,
        Month: month,
        [dayColumn]: dayValue,
        Duration: duration,
        "Most Common Price": tiedModes.length === 1 ? tiedModes[0] : null,
        "Mode Prices": tiedModes,
        "Is Tie": tiedModes.length > 1,
        "Mode Count": highestCount,
        "Total Tickets": group.totalTickets,
        "Mode Share": highestCount / group.totalTickets,
        "All Price Counts": [...group.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([price, count]) => `${formatMoney(Number(price))}: ${count}`).join(" | "),
      });
    }
    records.sort((left, right) => (
      left.Location.localeCompare(right.Location)
      || left.Year - right.Year
      || left["Month Number"] - right["Month Number"]
      || (dayIndex.get(left[dayColumn]) ?? 99) - (dayIndex.get(right[dayColumn]) ?? 99)
      || compareTuples(durationSortValue(left.Duration), durationSortValue(right.Duration))
    ));
    return records;
  }

  function resolveDailyTotals(data) {
    const groups = new Map();
    for (const row of data) {
      const key = `${row.Location}|${row["Date Key"]}`;
      if (!groups.has(key)) groups.set(key, { Location: row.Location, Date: row["Entry DateTime"], tickets: 0, revenue: 0 });
      const group = groups.get(key);
      group.tickets += 1;
      group.revenue += row.Amount;
    }
    return groups;
  }

  function safetyDailyTotals(shifts, options, selectedLocations, allowedYears = null) {
    const groups = new Map();
    const dailyPriceGroups = new Map();
    let detailsExcluded = 0;
    for (const shift of shifts) {
      if (allowedYears && !allowedYears.has(shift.Date.getFullYear())) continue;
      const location = canonicalLocation(shift.Location);
      if (selectedLocations && !selectedLocations.has(location)) continue;
      const includedDetails = shift.details.filter((detail) => {
        if (!options.excludeExtensions) return true;
        const type = cleanText(detail.type).toUpperCase();
        const isOverstay = /^(?:OT|OS|OVERSTAY|OVERTIME)$/.test(type);
        if (isOverstay) detailsExcluded += detail.tickets;
        return !isOverstay;
      });
      let tickets = 0;
      let revenue = 0;
      if (includedDetails.length) {
        for (const detail of includedDetails) {
          tickets += detail.tickets;
          revenue += detail.tickets * detail.price;
          const priceKey = `${location}|${shift["Date Key"]}|${detail.price}`;
          if (!dailyPriceGroups.has(priceKey)) dailyPriceGroups.set(priceKey, { Date: shift.Date, "Date Key": shift["Date Key"], Location: location, Price: detail.price, "Tickets Bought": 0, Revenue: 0, Types: new Set() });
          const priceGroup = dailyPriceGroups.get(priceKey);
          priceGroup["Tickets Bought"] += detail.tickets;
          priceGroup.Revenue += detail.tickets * detail.price;
          priceGroup.Types.add(cleanText(detail.type) || "UNKNOWN");
        }
      } else if (!options.excludeExtensions && shift.summaryRevenue != null) {
        tickets = Number(shift.summaryTickets) || 0;
        revenue = Number(shift.summaryRevenue) || 0;
      }
      if (!tickets && !revenue) continue;
      const key = `${location}|${shift["Date Key"]}`;
      if (!groups.has(key)) groups.set(key, { Location: location, Date: shift.Date, tickets: 0, revenue: 0 });
      const group = groups.get(key);
      group.tickets += tickets;
      group.revenue += revenue;
    }
    const dailyPriceCounts = [...dailyPriceGroups.values()].map((row) => ({
      ...row,
      Types: [...row.Types].sort().join(" | "),
      Revenue: Math.round((row.Revenue + Number.EPSILON) * 100) / 100,
    })).sort((left, right) => left.Date - right.Date || left.Location.localeCompare(right.Location) || left.Price - right.Price);
    return { groups, dailyPriceCounts, detailsExcluded };
  }

  function summarizeCombinedMonthlyTotals(resolveData, safetyShifts, options, warnings, stats) {
    const selectedLocations = Array.isArray(options.selectedLocations) ? new Set(options.selectedLocations) : null;
    const resolveDays = resolveDailyTotals(resolveData);
    const resolveYears = new Set(resolveData.map((row) => Number(row.Year)));
    const safety = safetyDailyTotals(safetyShifts, options, selectedLocations, resolveYears.size ? resolveYears : null);
    const combinedDays = new Map(resolveDays);
    let safetyDaysUsed = 0;
    let safetyDaysSkippedBecauseResolve = 0;
    let safetyTicketsAdded = 0;
    for (const [key, row] of safety.groups.entries()) {
      if (resolveDays.has(key)) {
        safetyDaysSkippedBecauseResolve += 1;
        continue;
      }
      combinedDays.set(key, row);
      safetyDaysUsed += 1;
      safetyTicketsAdded += row.tickets;
    }

    const monthGroups = new Map();
    for (const row of combinedDays.values()) {
      const year = row.Date.getFullYear();
      const monthNumber = row.Date.getMonth() + 1;
      const key = `${row.Location}|${year}|${monthNumber}`;
      if (!monthGroups.has(key)) monthGroups.set(key, { Location: row.Location, Year: year, "Month Number": monthNumber, Month: MONTH_NAMES[monthNumber - 1], tickets: 0, revenue: 0 });
      const group = monthGroups.get(key);
      group.tickets += row.tickets;
      group.revenue += row.revenue;
    }
    const totals = [...monthGroups.values()].map((group) => ({
      Location: group.Location,
      Year: group.Year,
      "Month Number": group["Month Number"],
      Month: group.Month,
      "Total Tickets": group.tickets,
      "Total Revenue": Math.round((group.revenue + Number.EPSILON) * 100) / 100,
      "Average Ticket": group.tickets ? Math.round(((group.revenue / group.tickets) + Number.EPSILON) * 100) / 100 : 0,
    }));
    totals.sort((left, right) => left.Location.localeCompare(right.Location) || left.Year - right.Year || left["Month Number"] - right["Month Number"]);
    stats.safetyDaysUsed = safetyDaysUsed;
    stats.safetyDaysSkippedBecauseResolve = safetyDaysSkippedBecauseResolve;
    stats.safetyTicketsAdded = safetyTicketsAdded;
    stats.safetyOverstayTicketsExcluded = safety.detailsExcluded;
    if (safetyDaysSkippedBecauseResolve) warnings.push(`${safetyDaysSkippedBecauseResolve.toLocaleString()} Safety Park location-days overlapped Resolve data and were not added to monthly totals, so revenue is not double-counted.`);
    return { monthlyTotals: totals, dailyPriceCounts: safety.dailyPriceCounts };
  }

  function summarizeMonthlyTotals(data) {
    return summarizeCombinedMonthlyTotals(data, [], {}, [], {}).monthlyTotals;
  }

  async function analyzeFiles(files, options = {}, onProgress = () => {}) {
    const resolveRecords = [];
    const safetyShifts = [];
    const warnings = [];
    let filesRead = 0;
    let resolveFilesRead = 0;
    let safetyFilesRead = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({ phase: "read", completed: index, total: files.length, message: `Reading ${file.name}` });
      try {
        const parsed = await parseInputFile(file);
        if (parsed.kind === "resolve") {
          for (const record of parsed.records) resolveRecords.push(record);
          resolveFilesRead += 1;
        } else {
          for (const record of parsed.records) safetyShifts.push(record);
          safetyFilesRead += 1;
        }
        filesRead += 1;
      } catch (error) {
        warnings.push(`${file.name}: ${error.message}`);
      }
    }
    if (!filesRead) {
      const details = warnings.length ? ` First error: ${warnings[0]}` : "";
      throw new Error(`None of the selected reports could be read.${details}`);
    }

    onProgress({ phase: "clean", completed: files.length, total: files.length, message: "Cleaning Resolve transactions and Safety Park detail rows" });
    const { data, stats } = cleanAndPrepare(resolveRecords, options);
    stats.resolveFilesRead = resolveFilesRead;
    stats.safetyFilesRead = safetyFilesRead;
    stats.safetyShiftRowsRead = safetyShifts.length;
    if (!data.length && !safetyShifts.length) throw new Error("No valid transactions remained after filtering.");
    if (stats.nonPriceDurationRowsExcluded) warnings.push(`${stats.nonPriceDurationRowsExcluded.toLocaleString()} Resolve rows contained elapsed or nonstandard durations and were excluded from the duration price tables. Monthly revenue still includes those otherwise-valid Resolve transactions.`);

    onProgress({ phase: "summarize", completed: files.length, total: files.length, message: "Calculating common prices and combined monthly revenue" });
    const allWeekdayWeekend = summarizeModes(data, "Day Group");
    const allByWeekday = summarizeModes(data, "Weekday");
    const minimumModeCount = options.excludeLowVolumeModes ? 3 : 1;
    const keepModeRow = (row) => row["Mode Count"] >= minimumModeCount || isProtectedLongStayProduct(row.Duration);
    const weekdayWeekend = allWeekdayWeekend.filter(keepModeRow);
    const byWeekday = allByWeekday.filter(keepModeRow);
    stats.lowVolumeModeRowsExcluded = allWeekdayWeekend.length - weekdayWeekend.length;
    stats.lowVolumeWeekdayRowsExcluded = allByWeekday.length - byWeekday.length;
    if (options.excludeLowVolumeModes && stats.lowVolumeModeRowsExcluded) warnings.push(`${stats.lowVolumeModeRowsExcluded.toLocaleString()} ordinary weekday/weekend price rows were hidden because fewer than 3 tickets supported the displayed most-common price. Overnight, all-day, Until/Till, and 20h+ products were retained.`);
    if (!stats.priceModeRowsAnalyzed && safetyShifts.length) warnings.push("Safety Park Show Details data contains exact price/count/revenue information but not purchased duration labels. Monthly totals and the hidden Safety Daily Prices sheet can use it, but duration-based price cells require Resolve/Scan2Pay rows.");

    const combined = summarizeCombinedMonthlyTotals(data, safetyShifts, options, warnings, stats);
    return {
      data,
      weekdayWeekend,
      byWeekday,
      monthlyTotals: combined.monthlyTotals,
      dailyPriceCounts: combined.dailyPriceCounts,
      stats: { filesRead, filesFailed: files.length - filesRead, ...stats },
      warnings,
    };
  }

  window.ParkingAnalysis = {
    analyzeFiles,
    discoverLocations,
    formatMoney,
    normalizeDuration,
    isLikelyPurchasedDuration,
    isProtectedLongStayProduct,
    summarizeModes,
    summarizeMonthlyTotals,
    parseSafetyShiftText,
    canonicalLocation,
  };
})();
