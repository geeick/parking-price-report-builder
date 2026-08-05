(() => {
  "use strict";

  const elements = {
    fileInput: document.getElementById("fileInput"),
    folderInput: document.getElementById("folderInput"),
    dropZone: document.getElementById("dropZone"),
    clearButton: document.getElementById("clearButton"),
    buildButton: document.getElementById("buildButton"),
    downloadButton: document.getElementById("downloadButton"),
    fileSummary: document.getElementById("fileSummary"),
    fileCount: document.getElementById("fileCount"),
    fileSize: document.getElementById("fileSize"),
    fileList: document.getElementById("fileList"),
    excludeExtensions: document.getElementById("excludeExtensions"),
    excludeFailed: document.getElementById("excludeFailed"),
    hideCounts: document.getElementById("hideCounts"),
    excludeLowVolumeModes: document.getElementById("excludeLowVolumeModes"),
    locationSelector: document.getElementById("locationSelector"),
    locationSelectionCount: document.getElementById("locationSelectionCount"),
    locationSearch: document.getElementById("locationSearch"),
    selectAllLocations: document.getElementById("selectAllLocations"),
    locationList: document.getElementById("locationList"),
    progressCard: document.getElementById("progressCard"),
    progressBar: document.getElementById("progressBar"),
    statusPercent: document.getElementById("statusPercent"),
    statusTitle: document.getElementById("statusTitle"),
    statusMessage: document.getElementById("statusMessage"),
    resultsCard: document.getElementById("resultsCard"),
    resultsDescription: document.getElementById("resultsDescription"),
    statsGrid: document.getElementById("statsGrid"),
    totalsBody: document.getElementById("totalsBody"),
    warningDetails: document.getElementById("warningDetails"),
    warningList: document.getElementById("warningList"),
  };

  let selectedFiles = [];
  let availableLocations = [];
  let selectedLocations = new Set();
  let locationDiscoveryWarnings = [];
  let findingLocations = false;
  let workbookBlob = null;
  let workbookName = "parking_price_analysis.xlsx";

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  function uniqueCsvFiles(files) {
    const map = new Map();
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) continue;
      const key = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
      map.set(key, file);
    }
    return [...map.values()].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
  }

  function updateBuildButton() {
    elements.buildButton.disabled = (
      selectedFiles.length === 0
      || findingLocations
      || selectedLocations.size === 0
    );
  }

  function updateLocationSelectionState() {
    const selectedCount = selectedLocations.size;
    const totalCount = availableLocations.length;
    elements.locationSelectionCount.textContent = `${selectedCount} of ${totalCount} ${totalCount === 1 ? "location" : "locations"} selected`;
    elements.selectAllLocations.checked = totalCount > 0 && selectedCount === totalCount;
    elements.selectAllLocations.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    updateBuildButton();
  }

  function renderLocationList() {
    const query = elements.locationSearch.value.trim().toLowerCase();
    const visibleLocations = availableLocations.filter((location) => location.toLowerCase().includes(query));

    if (!visibleLocations.length) {
      const empty = document.createElement("p");
      empty.className = "location-list-empty";
      empty.textContent = availableLocations.length ? "No locations match your search." : "No locations were found in the selected reports.";
      elements.locationList.replaceChildren(empty);
      return;
    }

    elements.locationList.replaceChildren(...visibleLocations.map((location, index) => {
      const label = document.createElement("label");
      label.className = "location-choice";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedLocations.has(location);
      checkbox.value = location;
      checkbox.id = `location-${index}`;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedLocations.add(location);
        else selectedLocations.delete(location);
        workbookBlob = null;
        elements.resultsCard.hidden = true;
        updateLocationSelectionState();
      });

      const name = document.createElement("span");
      name.textContent = location;
      label.append(checkbox, name);
      return label;
    }));
  }

  async function findLocations() {
    availableLocations = [];
    selectedLocations = new Set();
    locationDiscoveryWarnings = [];
    elements.locationSearch.value = "";
    elements.locationSelector.hidden = selectedFiles.length === 0;
    elements.locationList.innerHTML = '<p class="location-list-empty">Finding locations…</p>';
    findingLocations = selectedFiles.length > 0;
    updateBuildButton();

    if (!selectedFiles.length) {
      findingLocations = false;
      updateLocationSelectionState();
      return;
    }

    try {
      const result = await ParkingAnalysis.discoverLocations(selectedFiles);
      availableLocations = result.locations;
      selectedLocations = new Set(availableLocations);
      locationDiscoveryWarnings = result.warnings;
    } catch (error) {
      availableLocations = [];
      selectedLocations = new Set();
      locationDiscoveryWarnings = [error.message || String(error)];
    } finally {
      findingLocations = false;
      renderLocationList();
      updateLocationSelectionState();
    }
  }

  async function setFiles(files) {
    selectedFiles = uniqueCsvFiles(files);
    workbookBlob = null;
    elements.resultsCard.hidden = true;
    elements.progressCard.hidden = true;
    elements.clearButton.disabled = selectedFiles.length === 0;
    elements.fileSummary.hidden = selectedFiles.length === 0;

    if (!selectedFiles.length) {
      elements.fileList.replaceChildren();
      elements.locationSelector.hidden = true;
      await findLocations();
      return;
    }

    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    elements.fileCount.textContent = `${selectedFiles.length} CSV ${selectedFiles.length === 1 ? "file" : "files"} selected`;
    elements.fileSize.textContent = formatBytes(totalSize);
    elements.fileList.replaceChildren(...selectedFiles.slice(0, 40).map((file) => {
      const item = document.createElement("li");
      const name = document.createElement("div");
      name.textContent = file.webkitRelativePath || file.name;
      const size = document.createElement("span");
      size.textContent = formatBytes(file.size);
      item.append(name, size);
      return item;
    }));

    if (selectedFiles.length > 40) {
      const item = document.createElement("li");
      item.textContent = `…and ${selectedFiles.length - 40} more files`;
      elements.fileList.append(item);
    }

    await findLocations();
  }

  function updateProgress(percent, title, message) {
    const bounded = Math.max(0, Math.min(100, Math.round(percent)));
    elements.progressCard.hidden = false;
    elements.progressBar.style.width = `${bounded}%`;
    elements.statusPercent.textContent = `${bounded}%`;
    elements.statusTitle.textContent = title;
    elements.statusMessage.textContent = message;
  }

  function showError(error) {
    updateProgress(100, "Could not build workbook", error.message || String(error));
    elements.progressBar.style.background = "#a4262c";
    updateBuildButton();
  }

  function formatCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("en-US") : "0";
  }

  function statCard(value, label) {
    const card = document.createElement("div");
    card.className = "stat";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    return card;
  }

  function showResults(analysis) {
    const data = Array.isArray(analysis?.data) ? analysis.data : [];
    const monthlyTotals = Array.isArray(analysis?.monthlyTotals) ? analysis.monthlyTotals : [];
    const stats = analysis?.stats || {};
    const locationCount = new Set(data.map((row) => row.Location).filter(Boolean)).size;

    elements.resultsDescription.textContent = `${locationCount} selected ${locationCount === 1 ? "location" : "locations"} and ${monthlyTotals.length} location-month summaries were added to the workbook.`;
    elements.statsGrid.replaceChildren(
      statCard(formatCount(locationCount), "Locations included"),
      statCard(formatCount(stats.rowsAnalyzed), "Tickets analyzed"),
      statCard(formatCount(stats.extensionsRemoved), "Extensions removed"),
      statCard(formatCount(stats.nonPriceDurationRowsExcluded), "Elapsed durations skipped"),
      statCard(formatCount(stats.lowVolumeModeRowsExcluded), "Low-volume price rows hidden"),
      statCard(formatCount(stats.duplicatesRemoved), "Duplicates removed"),
    );

    elements.totalsBody.replaceChildren(...monthlyTotals.map((row) => {
      const tr = document.createElement("tr");
      const values = [
        row.Location || "",
        `${row.Month || ""} ${row.Year || ""}`.trim(),
        formatCount(row["Total Tickets"]),
        ParkingAnalysis.formatMoney(Number(row["Total Revenue"]) || 0),
        ParkingAnalysis.formatMoney(Number(row["Average Ticket"]) || 0),
      ];
      values.forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (index >= 2) td.className = "number";
        tr.append(td);
      });
      return tr;
    }));

    const warnings = [
      ...locationDiscoveryWarnings,
      ...(Array.isArray(analysis?.warnings) ? analysis.warnings : []),
    ];
    elements.warningDetails.hidden = warnings.length === 0;
    elements.warningList.replaceChildren(...warnings.map((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      return li;
    }));

    elements.resultsCard.hidden = false;
    elements.resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function build() {
    if (!selectedFiles.length || !selectedLocations.size) return;
    elements.buildButton.disabled = true;
    elements.resultsCard.hidden = true;
    elements.progressBar.style.background = "";
    workbookBlob = null;

    try {
      updateProgress(2, "Reading reports", "Starting analysis.");
      const options = {
        excludeExtensions: elements.excludeExtensions.checked,
        excludeFailed: elements.excludeFailed.checked,
        hideCounts: elements.hideCounts.checked,
        excludeLowVolumeModes: elements.excludeLowVolumeModes.checked,
        selectedLocations: [...selectedLocations],
      };

      const analysis = await ParkingAnalysis.analyzeFiles(selectedFiles, options, (progress) => {
        let percent = 5;
        if (progress.phase === "read") {
          percent = 5 + (progress.completed / Math.max(progress.total, 1)) * 40;
        } else if (progress.phase === "clean") {
          percent = 50;
        } else if (progress.phase === "summarize") {
          percent = 58;
        }
        updateProgress(percent, "Analyzing reports", progress.message);
      });

      workbookBlob = await ParkingWorkbook.buildWorkbook(analysis, options, (progress) => {
        const percent = 62 + (progress.completed / Math.max(progress.total, 1)) * 34;
        updateProgress(percent, "Building workbook", progress.message);
      });

      const date = new Date().toISOString().slice(0, 10);
      workbookName = `parking_price_analysis_${date}.xlsx`;
      updateProgress(100, "Workbook ready", "Download the workbook, then upload it to Google Drive and open it with Google Sheets.");
      showResults(analysis);
    } catch (error) {
      console.error(error);
      showError(error);
    } finally {
      updateBuildButton();
    }
  }

  function downloadWorkbook() {
    if (!workbookBlob) return;
    const url = URL.createObjectURL(workbookBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = workbookName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clear() {
    selectedFiles = [];
    availableLocations = [];
    selectedLocations = new Set();
    locationDiscoveryWarnings = [];
    workbookBlob = null;
    elements.fileInput.value = "";
    elements.folderInput.value = "";
    elements.locationSearch.value = "";
    elements.locationSelector.hidden = true;
    elements.fileSummary.hidden = true;
    elements.progressCard.hidden = true;
    elements.resultsCard.hidden = true;
    elements.clearButton.disabled = true;
    elements.fileList.replaceChildren();
    elements.locationList.replaceChildren();
    updateBuildButton();
  }

  elements.fileInput.addEventListener("change", (event) => { void setFiles([...event.target.files]); });
  elements.folderInput.addEventListener("change", (event) => { void setFiles([...event.target.files]); });
  elements.clearButton.addEventListener("click", clear);
  elements.buildButton.addEventListener("click", build);
  elements.downloadButton.addEventListener("click", downloadWorkbook);
  elements.locationSearch.addEventListener("input", renderLocationList);
  elements.selectAllLocations.addEventListener("change", () => {
    selectedLocations = elements.selectAllLocations.checked
      ? new Set(availableLocations)
      : new Set();
    workbookBlob = null;
    elements.resultsCard.hidden = true;
    renderLocationList();
    updateLocationSelectionState();
  });

  elements.dropZone.addEventListener("click", (event) => {
    if (event.target.closest("label")) return;
    elements.fileInput.click();
  });
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  });
  elements.dropZone.addEventListener("drop", (event) => {
    void setFiles([...event.dataTransfer.files]);
  });
})();
