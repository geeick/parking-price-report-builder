(() => {
  "use strict";

  const REQUIRED_COLUMNS = ["Location", "Amount", "Duration(hh:mm)", "Entry Time"];
  const EXTENSION_SUFFIX_RE = /-(?:EXT|EEX|EOS|OS)$/i;
  const CLOCK_DURATION_RE = /^(\d+):(\d{2})$/;
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const WEEKDAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const WEEKDAY_SORT = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function cleanText(value) {
    return value == null ? "" : String(value).trim();
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

    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (match) {
      const [, monthText, dayText, yearText, hourText, minuteText, periodText] = match;
      let hour = Number(hourText);
      const period = periodText.toUpperCase();
      if (period === "AM" && hour === 12) hour = 0;
      if (period === "PM" && hour !== 12) hour += 12;
      const date = new Date(
        Number(yearText),
        Number(monthText) - 1,
        Number(dayText),
        hour,
        Number(minuteText),
        0,
        0,
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
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

    // Named products such as "Until 11:59 PM", "Overnight", or "All Day"
    // describe the purchased option directly and should always be kept.
    if (durationMinutes == null) return true;

    // Combined Safety reports can contain actual elapsed parking time in the
    // same Duration(hh:mm) column. When the duration closely matches the time
    // from entry to transaction/exit, it is an elapsed stay, not a price option.
    const possibleEndDates = [
      parseEntryDate(record["Transaction Time"]),
      parseEntryDate(record["Exit Time"]),
    ];
    for (const endDate of possibleEndDates) {
      const observedMinutes = elapsedMinutes(entryDate, endDate);
      if (
        observedMinutes != null
        && observedMinutes > 5
        && Math.abs(observedMinutes - durationMinutes) <= 3
      ) {
        return false;
      }
    }

    // Scan2Pay price products are normally whole-hour or quarter-hour choices,
    // plus 23:59-style all-day products. Values such as 0:18, 0:27, or 1:07
    // are almost always elapsed stay times in a combined report.
    const minutePart = durationMinutes % 60;
    return [0, 15, 30, 45, 59].includes(minutePart);
  }

  function durationMinutesFromLabel(value) {
    const text = cleanText(value);
    if (!text) return null;

    const clockMatch = text.match(CLOCK_DURATION_RE);
    if (clockMatch) {
      return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
    }

    const readableMatch = text.match(/^(?:(\d+)h)?\s*(?:(\d+)\s*mins?)?$/i);
    if (readableMatch && (readableMatch[1] || readableMatch[2])) {
      return Number(readableMatch[1] || 0) * 60 + Number(readableMatch[2] || 0);
    }

    return null;
  }

  function isProtectedLongStayProduct(value) {
    const text = cleanText(value);
    if (!text) return false;

    // These are explicit configured products, not suspicious one-off elapsed
    // durations. Always keep them in the price table even when only one or two
    // tickets were purchased during the month/day group.
    if (/\b(?:overnight|all[ -]?day|until|till)\b/i.test(text)) {
      return true;
    }

    // Scan2Pay also represents all-day products as long clock durations such
    // as 23:59 (displayed as "23h 59 mins"). Keep long-stay products too.
    const minutes = durationMinutesFromLabel(text);
    return minutes != null && minutes >= 20 * 60;
  }

  function durationSortValue(value) {
    const text = cleanText(value);
    const match = text.match(CLOCK_DURATION_RE);
    if (match) {
      return [0, Number(match[1]) * 60 + Number(match[2]), text.toLowerCase()];
    }

    const readable = text.match(/^(?:(\d+)h)?\s*(?:(\d+)\s*mins?)?$/i);
    if (readable && (readable[1] || readable[2])) {
      return [0, Number(readable[1] || 0) * 60 + Number(readable[2] || 0), text.toLowerCase()];
    }
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  async function decodeFile(file) {
    const buffer = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (_) {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  async function parseReportFile(file) {
    const text = await decodeFile(file);
    const parsed = Papa.parse(text, {
      header: false,
      skipEmptyLines: false,
    });

    if (parsed.errors?.length) {
      const serious = parsed.errors.filter((error) => error.code !== "TooFewFields");
      if (serious.length) {
        throw new Error(serious[0].message || "CSV parsing failed.");
      }
    }

    const rows = parsed.data;
    let headerIndex = -1;
    for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
      const values = new Set((rows[index] || []).map(cleanText));
      if (REQUIRED_COLUMNS.every((column) => values.has(column))) {
        headerIndex = index;
        break;
      }
    }

    if (headerIndex < 0) {
      throw new Error(`Could not find the required header columns: ${REQUIRED_COLUMNS.join(", ")}`);
    }

    const headers = (rows[headerIndex] || []).map(cleanText);
    const records = [];
    for (const rawRow of rows.slice(headerIndex + 1)) {
      const row = rawRow || [];
      if (!row.some((value) => cleanText(value))) continue;
      const record = { "Source File": file.name };
      headers.forEach((header, index) => {
        if (header) record[header] = row[index] ?? "";
      });
      records.push(record);
    }

    return records;
  }

  async function discoverLocations(files, onProgress = () => {}) {
    const locations = new Set();
    const warnings = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({
        completed: index,
        total: files.length,
        message: `Finding locations in ${file.name}`,
      });
      try {
        const records = await parseReportFile(file);
        for (const record of records) {
          const location = cleanText(record.Location);
          if (location) locations.add(location);
        }
      } catch (error) {
        warnings.push(`${file.name}: ${error.message}`);
      }
    }

    onProgress({
      completed: files.length,
      total: files.length,
      message: "Location list ready",
    });

    return {
      locations: [...locations].sort((a, b) => a.localeCompare(b)),
      warnings,
    };
  }

  function cleanAndPrepare(records, options) {
    const includeExtensions = !options.excludeExtensions;
    const includeFailed = !options.excludeFailed;
    const selectedLocations = Array.isArray(options.selectedLocations)
      ? new Set(options.selectedLocations)
      : null;
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
      const location = cleanText(record.Location);
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
      const isExtension = (
        EXTENSION_SUFFIX_RE.test(ticket)
        || Boolean(extendedBy)
        || /extension/i.test(description)
      );
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
      const key = JSON.stringify([
        row.Location,
        row["Ticket#"],
        cleanText(row["Transaction Time"]),
        row.Amount,
        row["Duration Raw"],
      ]);
      if (seen.has(key)) {
        stats.duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      deduplicated.push(row);
    }

    stats.rowsAnalyzed = deduplicated.length;
    stats.priceModeRowsAnalyzed = deduplicated.filter(
      (row) => row["Is Price Duration"] !== false,
    ).length;
    stats.nonPriceDurationRowsExcluded = (
      stats.rowsAnalyzed - stats.priceModeRowsAnalyzed
    );
    return { data: deduplicated, stats };
  }

  function summarizeModes(data, dayColumn) {
    const groups = new Map();
    for (const row of data) {
      if (row["Is Price Duration"] === false) continue;

      const keyParts = [
        row.Location,
        row.Year,
        row["Month Number"],
        row.Month,
        row[dayColumn],
        row.Duration,
      ];
      const key = JSON.stringify(keyParts);
      if (!groups.has(key)) {
        groups.set(key, { keyParts, prices: new Map(), totalTickets: 0 });
      }
      const group = groups.get(key);
      group.totalTickets += 1;
      group.prices.set(row.Amount, (group.prices.get(row.Amount) || 0) + 1);
    }

    const dayOrder = dayColumn === "Day Group"
      ? ["Weekday", "Weekend"]
      : WEEKDAY_SORT;
    const dayIndex = new Map(dayOrder.map((value, index) => [value, index]));

    const records = [];
    for (const group of groups.values()) {
      const [location, year, monthNumber, month, dayValue, duration] = group.keyParts;
      const sortedPriceCounts = [...group.prices.entries()].sort((a, b) => a[0] - b[0]);
      const highestCount = Math.max(...sortedPriceCounts.map(([, count]) => count));
      const tiedModes = sortedPriceCounts
        .filter(([, count]) => count === highestCount)
        .map(([price]) => Number(price));

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
        "All Price Counts": [...group.prices.entries()]
          .sort((a, b) => b[1] - a[1] || a[0] - b[0])
          .map(([price, count]) => `${formatMoney(Number(price))}: ${count}`)
          .join(" | "),
      });
    }

    records.sort((left, right) => {
      return (
        left.Location.localeCompare(right.Location)
        || left.Year - right.Year
        || left["Month Number"] - right["Month Number"]
        || (dayIndex.get(left[dayColumn]) ?? 99) - (dayIndex.get(right[dayColumn]) ?? 99)
        || compareTuples(durationSortValue(left.Duration), durationSortValue(right.Duration))
      );
    });

    return records;
  }

  function summarizeMonthlyTotals(data) {
    const groups = new Map();
    for (const row of data) {
      const keyParts = [row.Location, row.Year, row["Month Number"], row.Month];
      const key = JSON.stringify(keyParts);
      if (!groups.has(key)) {
        groups.set(key, { keyParts, tickets: 0, revenue: 0 });
      }
      const group = groups.get(key);
      group.tickets += 1;
      group.revenue += row.Amount;
    }

    const totals = [...groups.values()].map((group) => {
      const [location, year, monthNumber, month] = group.keyParts;
      return {
        Location: location,
        Year: year,
        "Month Number": monthNumber,
        Month: month,
        "Total Tickets": group.tickets,
        "Total Revenue": Math.round((group.revenue + Number.EPSILON) * 100) / 100,
        "Average Ticket": Math.round(((group.revenue / group.tickets) + Number.EPSILON) * 100) / 100,
      };
    });

    totals.sort((left, right) => (
      left.Location.localeCompare(right.Location)
      || left.Year - right.Year
      || left["Month Number"] - right["Month Number"]
    ));
    return totals;
  }

  async function analyzeFiles(files, options = {}, onProgress = () => {}) {
    const allRecords = [];
    const warnings = [];
    let filesRead = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({
        phase: "read",
        completed: index,
        total: files.length,
        message: `Reading ${file.name}`,
      });
      try {
        const records = await parseReportFile(file);

        // Do not use allRecords.push(...records) here. Large reports can contain
        // hundreds of thousands of rows, and spreading that array passes every
        // row as a separate function argument. Browsers limit the number of
        // arguments in one call, which caused large reports to be treated as
        // unreadable. Append rows normally instead.
        for (const record of records) {
          allRecords.push(record);
        }
        filesRead += 1;
      } catch (error) {
        warnings.push(`${file.name}: ${error.message}`);
      }
    }

    if (!filesRead) {
      const details = warnings.length
        ? ` First error: ${warnings[0]}`
        : "";
      throw new Error(`None of the selected CSV reports could be read.${details}`);
    }

    onProgress({ phase: "clean", completed: files.length, total: files.length, message: "Cleaning and deduplicating transactions" });
    const { data, stats } = cleanAndPrepare(allRecords, options);
    if (!data.length) {
      throw new Error("No valid transactions remained after filtering.");
    }
    if (!stats.priceModeRowsAnalyzed) {
      throw new Error(
        "No purchased-duration rows remained for the price tables. "
        + "The selected report may contain elapsed stay durations instead of Scan2Pay price options.",
      );
    }
    if (stats.nonPriceDurationRowsExcluded) {
      warnings.push(
        `${stats.nonPriceDurationRowsExcluded.toLocaleString()} rows contained elapsed or nonstandard durations and were excluded from the price tables. Monthly revenue still includes those valid transactions.`,
      );
    }

    onProgress({ phase: "summarize", completed: files.length, total: files.length, message: "Calculating common prices and monthly revenue" });

    const allWeekdayWeekend = summarizeModes(data, "Day Group");
    const allByWeekday = summarizeModes(data, "Weekday");
    const minimumModeCount = options.excludeLowVolumeModes ? 3 : 1;

    // A displayed result is a specific location + month + day group + duration
    // and its most-common price. Mode Count is the number of tickets bought at
    // that displayed price. When the option is enabled, ordinary duration rows
    // supported by only one or two tickets are omitted. Explicit long-stay
    // products (Overnight, All Day, Until/Till, and 20h+ durations such as
    // 23h 59 mins) are always retained. Monthly revenue and ticket totals still
    // use every otherwise-valid transaction.
    const keepModeRow = (row) => (
      row["Mode Count"] >= minimumModeCount
      || isProtectedLongStayProduct(row.Duration)
    );

    const weekdayWeekend = allWeekdayWeekend.filter(keepModeRow);
    const byWeekday = allByWeekday.filter(keepModeRow);

    stats.lowVolumeModeRowsExcluded = allWeekdayWeekend.length - weekdayWeekend.length;
    stats.lowVolumeWeekdayRowsExcluded = allByWeekday.length - byWeekday.length;

    if (options.excludeLowVolumeModes && stats.lowVolumeModeRowsExcluded) {
      warnings.push(
        `${stats.lowVolumeModeRowsExcluded.toLocaleString()} ordinary weekday/weekend price rows were hidden because fewer than 3 tickets supported the displayed most-common price. Overnight, all-day, Until/Till, and 20h+ products were retained. Monthly revenue and total ticket counts still include all otherwise-valid transactions.`,
      );
    }

    const monthlyTotals = summarizeMonthlyTotals(data);

    return {
      data,
      weekdayWeekend,
      byWeekday,
      monthlyTotals,
      stats: {
        filesRead,
        filesFailed: files.length - filesRead,
        ...stats,
      },
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
  };
})();
