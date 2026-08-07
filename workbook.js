(() => {
  "use strict";

  const COLORS = {
    navy: "FF1F4E78",
    blue: "FF5B9BD5",
    paleBlue: "FFD9EAF7",
    headerBlue: "FFEAF2F8",
    green: "FFE2F0D9",
    border: "FFD9D9D9",
    headerBorder: "FFC7D1DA",
    white: "FFFFFFFF",
    dark: "FF1F1F1F",
    muted: "FF666666",
    tieBackground: "FFFFF2CC",
    tieText: "FF9C6500",
  };

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const CHART_COLORS = [
    "#4472C4", "#C0504D", "#70AD47", "#8064A2", "#ED7D31", "#5B9BD5",
  ];

  function thinBorder(color = COLORS.border) {
    return {
      top: { style: "thin", color: { argb: color } },
      bottom: { style: "thin", color: { argb: color } },
      left: { style: "thin", color: { argb: color } },
      right: { style: "thin", color: { argb: color } },
    };
  }

  function fill(argb) {
    return { type: "pattern", pattern: "solid", fgColor: { argb } };
  }

  function safeSheetName(location, usedNames) {
    let name = String(location)
      .replace(/\s+Parking\s*$/i, "")
      .replace(/[\\/*?:\[\]]/g, "-")
      .trim();
    if (!name) name = "Location";
    name = name.slice(0, 31);

    let candidate = name;
    let suffixNumber = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      const suffix = ` (${suffixNumber})`;
      candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
      suffixNumber += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  function styleTitle(cell) {
    cell.fill = fill(COLORS.navy);
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 16 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  function styleGroup(cell) {
    cell.fill = fill(COLORS.blue);
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder("FFA6A6A6");
  }

  function styleHeader(cell) {
    cell.fill = fill(COLORS.headerBlue);
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder(COLORS.headerBorder);
  }

  function styleSummaryHeader(cell) {
    cell.fill = fill(COLORS.navy);
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder(COLORS.navy);
  }

  function styleBody(cell, alignment = "left") {
    cell.alignment = { horizontal: alignment, vertical: "middle" };
    cell.border = thinBorder();
  }

  function styleTie(cell) {
    styleBody(cell, "right");
    cell.fill = fill(COLORS.tieBackground);
    cell.font = { color: { argb: COLORS.tieText } };
  }

  function compactMoney(value) {
    const number = Number(value);
    return Number.isInteger(number)
      ? `$${number.toLocaleString("en-US")}`
      : `$${number.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
  }

  function groupBy(items, keyFunction) {
    const groups = new Map();
    for (const item of items) {
      const key = keyFunction(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  function monthlyLookup(totals) {
    const lookup = new Map();
    for (const total of totals) {
      lookup.set(`${total.Year}|${total["Month Number"]}`, total);
    }
    return lookup;
  }

  function durationSortValue(value) {
    const text = String(value ?? "").trim();
    const match = text.match(/^(?:(\d+)h)?\s*(?:(\d+)\s*mins?)?$/i);
    if (match && (match[1] || match[2])) {
      return [0, Number(match[1] || 0) * 60 + Number(match[2] || 0), text.toLowerCase()];
    }
    return [1, 0, text.toLowerCase()];
  }

  function compareTuples(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function renderYearComparisonChart(location, totals, years, canvas) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const lookup = monthlyLookup(totals);

    const datasets = years.map((year, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      return {
        label: String(year),
        data: MONTH_NAMES.map((_, monthIndex) => {
          const total = lookup.get(`${year}|${monthIndex + 1}`);
          return total ? total["Total Revenue"] : null;
        }),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        tension: 0,
        spanGaps: false,
        fill: false,
      };
    });

    const chart = new Chart(context, {
      type: "line",
      data: { labels: MONTH_NAMES, datasets },
      options: {
        responsive: false,
        animation: false,
        devicePixelRatio: 2,
        layout: { padding: { top: 3, right: 8, bottom: 2, left: 2 } },
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              color: "#34495E",
              boxWidth: 18,
              boxHeight: 2,
              padding: 12,
              font: { size: 11 },
            },
          },
          title: { display: false, text: location },
          tooltip: {
            callbacks: {
              label: (contextValue) => (
                `${contextValue.dataset.label}: $${Number(contextValue.parsed.y).toLocaleString("en-US")}`
              ),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#34495E",
              maxRotation: 48,
              minRotation: 48,
              autoSkip: false,
              font: { size: 9 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#D9E1E8" },
            title: {
              display: true,
              text: "Revenue",
              color: "#34495E",
              font: { size: 10, weight: "bold" },
            },
            ticks: {
              color: "#34495E",
              font: { size: 9 },
              callback: (value) => `$${Number(value).toLocaleString("en-US")}`,
            },
          },
        },
      },
    });

    chart.update("none");
    const image = chart.toBase64Image("image/png", 1);
    chart.destroy();
    return image;
  }

  function addSummarySheet(workbook, monthlyTotals, canvas) {
    const worksheet = workbook.addWorksheet("Summary", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
    });

    const years = [...new Set(monthlyTotals.map((row) => Number(row.Year)))].sort((a, b) => a - b);
    const totalsByLocation = groupBy(monthlyTotals, (row) => row.Location);
    const locations = [...totalsByLocation.keys()].sort((a, b) => a.localeCompare(b));

    worksheet.getColumn(1).width = 28;
    worksheet.getColumn(2).width = 14;
    worksheet.getCell(1, 1).value = "Location";
    worksheet.getCell(1, 2).value = "Month";
    styleSummaryHeader(worksheet.getCell(1, 1));
    styleSummaryHeader(worksheet.getCell(1, 2));

    const yearColumns = new Map();
    let nextColumn = 3;
    for (const year of years) {
      const revenueColumn = nextColumn;
      const ticketsColumn = nextColumn + 1;
      const averageColumn = nextColumn + 2;
      yearColumns.set(year, { revenueColumn, ticketsColumn, averageColumn });

      worksheet.getColumn(revenueColumn).width = 16;
      worksheet.getColumn(ticketsColumn).width = 14;
      worksheet.getColumn(averageColumn).width = 17;
      worksheet.getColumn(ticketsColumn).hidden = true;
      worksheet.getColumn(averageColumn).hidden = true;

      worksheet.getCell(1, revenueColumn).value = `${year} Revenue`;
      worksheet.getCell(1, ticketsColumn).value = `${year} Tickets`;
      worksheet.getCell(1, averageColumn).value = `${year} Avg Ticket`;
      styleSummaryHeader(worksheet.getCell(1, revenueColumn));
      styleSummaryHeader(worksheet.getCell(1, ticketsColumn));
      styleSummaryHeader(worksheet.getCell(1, averageColumn));
      nextColumn += 3;
    }

    const chartStartColumn = nextColumn + 1;
    for (let column = nextColumn; column <= chartStartColumn + 6; column += 1) {
      worksheet.getColumn(column).width = column === nextColumn ? 2 : 12;
    }

    worksheet.getRow(1).height = 24;
    worksheet.properties.defaultRowHeight = 18;

    let currentRow = 2;
    for (const location of locations) {
      const locationTotals = totalsByLocation.get(location) || [];
      const lookup = monthlyLookup(locationTotals);
      const groupStartRow = currentRow;

      for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
        const locationCell = worksheet.getCell(currentRow, 1);
        const monthCell = worksheet.getCell(currentRow, 2);
        locationCell.value = String(location).replace(/\s+Parking\s*$/i, "");
        monthCell.value = MONTH_NAMES[monthNumber - 1];
        styleBody(locationCell);
        styleBody(monthCell);
        if (monthNumber === 1) locationCell.font = { bold: true };

        for (const year of years) {
          const columns = yearColumns.get(year);
          const total = lookup.get(`${year}|${monthNumber}`);
          const revenueCell = worksheet.getCell(currentRow, columns.revenueColumn);
          const ticketsCell = worksheet.getCell(currentRow, columns.ticketsColumn);
          const averageCell = worksheet.getCell(currentRow, columns.averageColumn);

          styleBody(revenueCell, "right");
          styleBody(ticketsCell, "right");
          styleBody(averageCell, "right");

          if (total) {
            revenueCell.value = total["Total Revenue"];
            revenueCell.numFmt = "$#,##0.00";
            ticketsCell.value = total["Total Tickets"];
            ticketsCell.numFmt = "0";
            averageCell.value = total["Average Ticket"];
            averageCell.numFmt = "$#,##0.00";
          } else {
            revenueCell.value = "-";
            ticketsCell.value = "-";
            averageCell.value = "-";
            revenueCell.alignment = { horizontal: "center", vertical: "middle" };
            ticketsCell.alignment = { horizontal: "center", vertical: "middle" };
            averageCell.alignment = { horizontal: "center", vertical: "middle" };
          }
        }
        currentRow += 1;
      }

      const chartImage = renderYearComparisonChart(location, locationTotals, years, canvas);
      const imageId = workbook.addImage({ base64: chartImage, extension: "png" });
      worksheet.addImage(imageId, {
        tl: { col: chartStartColumn - 1, row: groupStartRow - 1 },
        ext: { width: 390, height: 214 },
      });
      currentRow += 1;
    }

    worksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15,
      },
    };
    worksheet.printTitlesRow = "1:1";
  }

  function collectDurations(summaryRows, dayGroup) {
    return [...new Set(
      summaryRows
        .filter((row) => row["Day Group"] === dayGroup)
        .map((row) => row.Duration),
    )].sort((left, right) => compareTuples(durationSortValue(left), durationSortValue(right)));
  }

  function createPriceLookup(summaryRows) {
    return new Map(summaryRows.map((row) => [
      `${row["Day Group"]}|${row.Year}|${row["Month Number"]}|${row.Duration}`,
      row,
    ]));
  }

  function buildGridLayout(durations, years, startColumn = 1) {
    const dateColumn = startColumn;
    const durationGroups = [];
    let nextColumn = dateColumn + 1;

    for (const duration of durations) {
      const groupStart = nextColumn;
      const yearColumns = new Map();
      for (const year of years) {
        const priceColumn = nextColumn;
        const countColumn = nextColumn + 1;
        yearColumns.set(year, { priceColumn, countColumn });
        nextColumn += 2;
      }
      durationGroups.push({
        duration,
        startColumn: groupStart,
        endColumn: nextColumn - 1,
        yearColumns,
      });
    }

    return {
      dateColumn,
      durationGroups,
      endColumn: Math.max(dateColumn, nextColumn - 1),
      nextColumn,
    };
  }

  function configureGridColumns(worksheet, layout, hideCounts) {
    worksheet.getColumn(layout.dateColumn).width = 13;
    for (const group of layout.durationGroups) {
      for (const columns of group.yearColumns.values()) {
        worksheet.getColumn(columns.priceColumn).width = 12;
        worksheet.getColumn(columns.countColumn).width = 14;
        worksheet.getColumn(columns.countColumn).hidden = Boolean(hideCounts);
      }
    }
  }

  function writePriceValue(priceCell, countCell, record) {
    styleBody(priceCell, "right");
    styleBody(countCell, "right");
    if (!record) return;

    countCell.value = record["Mode Count"];
    countCell.numFmt = "0";
    if (record["Is Tie"]) {
      priceCell.value = record["Mode Prices"].map(compactMoney).join(" / ");
      styleTie(priceCell);
    } else {
      priceCell.value = record["Most Common Price"];
      priceCell.numFmt = "$0.##";
    }
  }

  function writePriceGrid(
    worksheet,
    startRow,
    title,
    dayGroup,
    layout,
    years,
    priceLookup,
  ) {
    const groupRow = startRow;
    const durationHeaderRow = startRow + 1;
    const yearHeaderRow = startRow + 2;
    const firstDataRow = startRow + 3;

    worksheet.mergeCells(groupRow, layout.dateColumn, groupRow, layout.endColumn);
    worksheet.getCell(groupRow, layout.dateColumn).value = title;
    styleGroup(worksheet.getCell(groupRow, layout.dateColumn));

    worksheet.mergeCells(durationHeaderRow, layout.dateColumn, yearHeaderRow, layout.dateColumn);
    worksheet.getCell(durationHeaderRow, layout.dateColumn).value = "Date";
    styleHeader(worksheet.getCell(durationHeaderRow, layout.dateColumn));

    for (const group of layout.durationGroups) {
      worksheet.mergeCells(durationHeaderRow, group.startColumn, durationHeaderRow, group.endColumn);
      worksheet.getCell(durationHeaderRow, group.startColumn).value = group.duration;
      styleHeader(worksheet.getCell(durationHeaderRow, group.startColumn));

      for (const year of years) {
        const columns = group.yearColumns.get(year);
        worksheet.getCell(yearHeaderRow, columns.priceColumn).value = `${year} Price`;
        worksheet.getCell(yearHeaderRow, columns.countColumn).value = `${year} Tickets`;
        styleHeader(worksheet.getCell(yearHeaderRow, columns.priceColumn));
        styleHeader(worksheet.getCell(yearHeaderRow, columns.countColumn));
      }
    }

    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const row = firstDataRow + monthNumber - 1;
      const monthCell = worksheet.getCell(row, layout.dateColumn);
      monthCell.value = MONTH_NAMES[monthNumber - 1];
      styleBody(monthCell);

      for (const group of layout.durationGroups) {
        for (const year of years) {
          const columns = group.yearColumns.get(year);
          const record = priceLookup.get(
            `${dayGroup}|${year}|${monthNumber}|${group.duration}`,
          );
          writePriceValue(
            worksheet.getCell(row, columns.priceColumn),
            worksheet.getCell(row, columns.countColumn),
            record,
          );
        }
      }
    }

    return firstDataRow + 12;
  }

  function writeRevenueGrid(
    worksheet,
    startRow,
    startColumn,
    years,
    totalsLookup,
    hideCounts,
  ) {
    const endColumn = startColumn + years.length * 2;
    worksheet.mergeCells(startRow, startColumn, startRow, endColumn);
    worksheet.getCell(startRow, startColumn).value = "Monthly Revenue";
    styleGroup(worksheet.getCell(startRow, startColumn));

    worksheet.mergeCells(startRow + 1, startColumn, startRow + 2, startColumn);
    worksheet.getCell(startRow + 1, startColumn).value = "Date";
    styleHeader(worksheet.getCell(startRow + 1, startColumn));
    worksheet.getColumn(startColumn).width = 13;

    years.forEach((year, index) => {
      const revenueColumn = startColumn + 1 + index * 2;
      const ticketsColumn = revenueColumn + 1;
      worksheet.getCell(startRow + 2, revenueColumn).value = `${year} Revenue`;
      worksheet.getCell(startRow + 2, ticketsColumn).value = `${year} Tickets`;
      styleHeader(worksheet.getCell(startRow + 2, revenueColumn));
      styleHeader(worksheet.getCell(startRow + 2, ticketsColumn));
      worksheet.getColumn(revenueColumn).width = 14;
      worksheet.getColumn(ticketsColumn).width = 14;
      worksheet.getColumn(ticketsColumn).hidden = Boolean(hideCounts);
    });

    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const row = startRow + 2 + monthNumber;
      const monthCell = worksheet.getCell(row, startColumn);
      monthCell.value = MONTH_NAMES[monthNumber - 1];
      styleBody(monthCell);

      years.forEach((year, index) => {
        const revenueColumn = startColumn + 1 + index * 2;
        const ticketsColumn = revenueColumn + 1;
        const revenueCell = worksheet.getCell(row, revenueColumn);
        const ticketsCell = worksheet.getCell(row, ticketsColumn);
        styleBody(revenueCell, "right");
        styleBody(ticketsCell, "right");
        const total = totalsLookup.get(`${year}|${monthNumber}`);
        if (!total) return;

        revenueCell.value = total["Total Revenue"];
        revenueCell.numFmt = "$#,##0.00";
        revenueCell.fill = fill(COLORS.green);
        ticketsCell.value = total["Total Tickets"];
        ticketsCell.numFmt = "0";
      });
    }

    return endColumn;
  }

  function addLocationSheet(
    workbook,
    location,
    summaryRows,
    locationMonthlyTotals,
    options,
    usedNames,
  ) {
    const sheetName = safeSheetName(location, usedNames);
    const years = [...new Set([
      ...summaryRows.map((row) => Number(row.Year)),
      ...locationMonthlyTotals.map((row) => Number(row.Year)),
    ])].sort((left, right) => left - right);

    const weekdayDurations = collectDurations(summaryRows, "Weekday");
    const weekendDurations = collectDurations(summaryRows, "Weekend");
    const weekdayLayout = buildGridLayout(weekdayDurations, years, 1);
    const weekendLayout = buildGridLayout(weekendDurations, years, 1);
    const priceLookup = createPriceLookup(summaryRows);
    const totalsLookup = monthlyLookup(locationMonthlyTotals);

    const revenueStartColumn = Math.max(
      weekdayLayout.endColumn,
      weekendLayout.endColumn,
    ) + 2;
    const revenueEndColumn = revenueStartColumn + years.length * 2;
    const finalColumn = Math.max(
      weekdayLayout.endColumn,
      weekendLayout.endColumn,
      revenueEndColumn,
    );

    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
    });
    configureGridColumns(worksheet, weekdayLayout, options.hideCounts);
    configureGridColumns(worksheet, weekendLayout, options.hideCounts);
    worksheet.getColumn(revenueStartColumn - 1).width = 3;

    worksheet.properties.defaultRowHeight = 18;
    worksheet.getRow(1).height = 27;
    worksheet.mergeCells(1, 1, 1, finalColumn);
    worksheet.getCell(1, 1).value = location;
    styleTitle(worksheet.getCell(1, 1));

    worksheet.mergeCells(2, 1, 2, finalColumn);
    worksheet.getCell(2, 1).value = (
      "Months run down the left. Within each duration, yearly prices are beside each other; ticket-count columns remain between them and are hidden by default."
    );
    worksheet.getCell(2, 1).font = {
      italic: true,
      color: { argb: COLORS.muted },
      size: 9,
    };

    const weekdayEndRow = writePriceGrid(
      worksheet,
      4,
      "Weekdays",
      "Weekday",
      weekdayLayout,
      years,
      priceLookup,
    );

    writeRevenueGrid(
      worksheet,
      4,
      revenueStartColumn,
      years,
      totalsLookup,
      options.hideCounts,
    );

    writePriceGrid(
      worksheet,
      weekdayEndRow + 2,
      "Weekends",
      "Weekend",
      weekendLayout,
      years,
      priceLookup,
    );

    worksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15,
      },
    };
    worksheet.printTitlesRow = "1:2";
  }

  async function buildWorkbook(analysis, options = {}, onProgress = () => {}) {
    if (!window.ExcelJS) {
      throw new Error("ExcelJS did not load. Check the internet connection and refresh the page.");
    }
    if (!window.Chart) {
      throw new Error("Chart.js did not load. Check the internet connection and refresh the page.");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Safety Park Parking Price Report Builder";
    workbook.created = new Date();
    workbook.modified = new Date();

    const canvas = document.getElementById("chartCanvas");
    addSummarySheet(workbook, analysis.monthlyTotals, canvas);

    const summariesByLocation = groupBy(analysis.weekdayWeekend, (row) => row.Location);
    const totalsByLocation = groupBy(analysis.monthlyTotals, (row) => row.Location);
    const locations = [...new Set([
      ...summariesByLocation.keys(),
      ...totalsByLocation.keys(),
    ])].sort((left, right) => left.localeCompare(right));
    const usedNames = new Set(["summary"]);

    for (let index = 0; index < locations.length; index += 1) {
      const location = locations[index];
      onProgress({
        completed: index,
        total: locations.length,
        message: `Formatting ${location}`,
      });
      addLocationSheet(
        workbook,
        location,
        summariesByLocation.get(location) || [],
        totalsByLocation.get(location) || [],
        options,
        usedNames,
      );
    }

    onProgress({
      completed: locations.length,
      total: locations.length,
      message: "Writing workbook file",
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  window.ParkingWorkbook = { buildWorkbook };
})();
