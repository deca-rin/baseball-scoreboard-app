import { connectArchives, totalOf, formatTournamentDateTime } from "./state.js";

const els = {
  setupError: document.getElementById("setup-error"),
  app: document.getElementById("app"),
  searchName: document.getElementById("search-name-input"),
  searchDate: document.getElementById("search-date-input"),
  clearSearchBtn: document.getElementById("clear-search-btn"),
  resultsList: document.getElementById("results-list"),
  resultsEmpty: document.getElementById("results-empty"),
  detailPanel: document.getElementById("detail-panel"),
  closeDetailBtn: document.getElementById("close-detail-btn"),
  detailTournamentName: document.getElementById("detail-tournament-name"),
  detailTournamentDatetime: document.getElementById("detail-tournament-datetime"),
  detailScoreHead: document.getElementById("detail-score-head"),
  detailScoreBody: document.getElementById("detail-score-body"),
  detailTabAway: document.getElementById("detail-tab-away"),
  detailTabHome: document.getElementById("detail-tab-home"),
  detailOrderAway: document.getElementById("detail-order-away"),
  detailOrderHome: document.getElementById("detail-order-home"),
};

let allEntries = [];
let activeDetailTeam = "away";
let currentDetailEntry = null;

function maxInningOfScores(scores) {
  const innings = [
    ...Object.keys(scores?.away || {}),
    ...Object.keys(scores?.home || {}),
  ].map(Number);
  return Math.max(9, ...(innings.length ? innings : [0]));
}

function matchesFilter(entry) {
  const nameQuery = els.searchName.value.trim();
  const dateQuery = els.searchDate.value;
  const tournament = entry.tournament || {};

  if (nameQuery && !(tournament.name || "").includes(nameQuery)) return false;
  if (dateQuery && tournament.date !== dateQuery) return false;
  return true;
}

function renderList() {
  const filtered = allEntries.filter(matchesFilter);
  els.resultsList.innerHTML = "";
  els.resultsEmpty.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((entry) => {
    const tournament = entry.tournament || {};
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";

    const title = tournament.name || "(大会名未設定)";
    const datetime = formatTournamentDateTime(tournament) || "日付未設定";
    const awayName = entry.teams?.away?.name || "アウェイ";
    const homeName = entry.teams?.home?.name || "ホーム";
    const awayTotal = totalOf(entry, "away");
    const homeTotal = totalOf(entry, "home");

    item.innerHTML = `
      <div class="history-item-title">${title}</div>
      <div class="small">${datetime}</div>
      <div class="history-item-score">${awayName} ${awayTotal} - ${homeTotal} ${homeName}</div>
    `;
    item.addEventListener("click", () => showDetail(entry));
    els.resultsList.appendChild(item);
  });
}

function showDetail(entry) {
  const tournament = entry.tournament || {};
  els.detailPanel.style.display = "block";
  els.detailTournamentName.textContent = tournament.name || "(大会名未設定)";
  els.detailTournamentDatetime.textContent = formatTournamentDateTime(tournament) || "日付未設定";

  const maxInning = maxInningOfScores(entry.scores);
  els.detailScoreHead.innerHTML =
    "<th></th>" +
    Array.from({ length: maxInning }, (_, i) => `<th>${i + 1}</th>`).join("") +
    "<th>R</th>";

  els.detailScoreBody.innerHTML = "";
  ["away", "home"].forEach((team) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.className = "team-name";
    nameTd.innerHTML = `<span class="team-tag ${team}"></span>${entry.teams?.[team]?.name || ""}`;
    tr.appendChild(nameTd);

    const teamScores = (entry.scores || {})[team] || {};
    for (let i = 1; i <= maxInning; i++) {
      const td = document.createElement("td");
      td.className = "score-cell";
      const val = teamScores[String(i)];
      td.textContent = val ?? "";
      tr.appendChild(td);
    }
    const totalTd = document.createElement("td");
    totalTd.className = "score-cell total-cell";
    totalTd.textContent = totalOf(entry, team);
    tr.appendChild(totalTd);
    els.detailScoreBody.appendChild(tr);
  });

  currentDetailEntry = entry;
  renderDetailOrder(entry);
  els.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetailOrder(entry) {
  const listEl = activeDetailTeam === "away" ? els.detailOrderAway : els.detailOrderHome;
  els.detailTabAway.classList.toggle("active", activeDetailTeam === "away");
  els.detailTabHome.classList.toggle("active", activeDetailTeam === "home");
  els.detailOrderAway.style.display = activeDetailTeam === "away" ? "flex" : "none";
  els.detailOrderHome.style.display = activeDetailTeam === "home" ? "flex" : "none";

  const order = (entry.battingOrder || {})[activeDetailTeam] || [];
  listEl.innerHTML = "";
  order.forEach((batter, idx) => {
    if (!batter?.name) return;
    const li = document.createElement("li");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = idx + 1;
    li.appendChild(num);
    const name = document.createElement("span");
    name.textContent = batter.name;
    li.appendChild(name);
    if (batter.position) {
      const pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = batter.position;
      li.appendChild(pos);
    }
    listEl.appendChild(li);
  });

  if (!listEl.children.length) {
    const li = document.createElement("li");
    li.textContent = "打順の記録がありません";
    listEl.appendChild(li);
  }
}

function bindEvents() {
  els.searchName.addEventListener("input", renderList);
  els.searchDate.addEventListener("change", renderList);
  els.clearSearchBtn.addEventListener("click", () => {
    els.searchName.value = "";
    els.searchDate.value = "";
    renderList();
  });
  els.closeDetailBtn.addEventListener("click", () => {
    els.detailPanel.style.display = "none";
  });
  els.detailTabAway.addEventListener("click", () => {
    activeDetailTeam = "away";
    if (currentDetailEntry) renderDetailOrder(currentDetailEntry);
  });
  els.detailTabHome.addEventListener("click", () => {
    activeDetailTeam = "home";
    if (currentDetailEntry) renderDetailOrder(currentDetailEntry);
  });
}

async function main() {
  const archives = await connectArchives();
  if (!archives.ok) {
    els.setupError.style.display = "block";
    els.app.style.display = "none";
    return;
  }
  els.setupError.style.display = "none";
  els.app.style.display = "block";

  bindEvents();
  allEntries = await archives.list();
  renderList();
}

main();
