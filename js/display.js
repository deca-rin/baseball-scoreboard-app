import {
  connectGame,
  battingTeamOf,
  maxInningOf,
  totalOf,
  formatTournamentDateTime,
} from "./state.js";

const els = {
  setupError: document.getElementById("setup-error"),
  app: document.getElementById("app"),
  tournamentInfo: document.getElementById("display-tournament-info"),
  tournamentName: document.getElementById("display-tournament-name"),
  tournamentDatetime: document.getElementById("display-tournament-datetime"),
  awayName: document.getElementById("display-away-name"),
  homeName: document.getElementById("display-home-name"),
  inningHalf: document.getElementById("display-inning-half"),
  halfArrow: document.getElementById("half-arrow"),
  scoreTableHead: document.getElementById("display-score-head"),
  scoreTableBody: document.getElementById("display-score-body"),
  ballsLights: document.getElementById("display-balls-lights"),
  strikesLights: document.getElementById("display-strikes-lights"),
  outsLights: document.getElementById("display-outs-lights"),
  battingTeamName: document.getElementById("display-batting-team"),
  orderList: document.getElementById("display-order-list"),
  updatedAt: document.getElementById("display-updated-at"),
};

let lastUpdatedAt = null;

function lights(container, count, max, cls) {
  container.innerHTML = "";
  for (let i = 0; i < max; i++) {
    const dot = document.createElement("span");
    dot.className = `light ${cls}${i < count ? " on" : ""}`;
    container.appendChild(dot);
  }
}

function render(state) {
  const tournament = state.tournament || {};
  if (tournament.name || tournament.date || tournament.startTime) {
    els.tournamentInfo.style.display = "block";
    els.tournamentName.textContent = tournament.name || "";
    els.tournamentDatetime.textContent = formatTournamentDateTime(tournament);
  } else {
    els.tournamentInfo.style.display = "none";
  }

  els.awayName.textContent = state.teams.away.name;
  els.homeName.textContent = state.teams.home.name;

  const halfLabel = state.half === "top" ? "表" : "裏";
  els.inningHalf.textContent = `${state.inning} 回 ${halfLabel}`;
  els.halfArrow.textContent = state.half === "top" ? "▲" : "▼";

  lights(els.ballsLights, state.count.balls, 3, "b");
  lights(els.strikesLights, state.count.strikes, 2, "s");
  lights(els.outsLights, state.count.outs, 2, "o");

  renderScoreTable(state);
  renderOrder(state);

  lastUpdatedAt = state.meta?.updatedAt || Date.now();
  updateTimestampLabel();
}

function renderScoreTable(state) {
  const maxInning = maxInningOf(state);
  els.scoreTableHead.innerHTML =
    "<th></th>" +
    Array.from({ length: maxInning }, (_, i) => `<th>${i + 1}</th>`).join("") +
    "<th>R</th>";

  els.scoreTableBody.innerHTML = "";
  ["away", "home"].forEach((team) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.className = "team-name";
    nameTd.innerHTML = `<span class="team-tag ${team}"></span>${state.teams[team].name}`;
    tr.appendChild(nameTd);

    const teamScores = (state.scores || {})[team] || {};
    for (let i = 1; i <= maxInning; i++) {
      const td = document.createElement("td");
      td.className = "score-cell";
      const isActive = i === state.inning && battingTeamOf(state) === team;
      if (isActive) td.classList.add("active-cell");
      const val = teamScores[String(i)];
      td.textContent = val ?? (i < state.inning || (i === state.inning && !isActive) ? "0" : "");
      tr.appendChild(td);
    }
    const totalTd = document.createElement("td");
    totalTd.className = "score-cell total-cell";
    totalTd.textContent = totalOf(state, team);
    tr.appendChild(totalTd);
    els.scoreTableBody.appendChild(tr);
  });
}

function renderOrder(state) {
  const team = battingTeamOf(state);
  els.battingTeamName.innerHTML = `<span class="team-tag ${team}"></span>${state.teams[team].name} の攻撃`;

  const order = state.battingOrder[team];
  const current = state.currentBatter[team];
  els.orderList.innerHTML = "";

  const displayCount = Math.min(order.length, 4);
  for (let offset = 0; offset < displayCount; offset++) {
    const idx = (current + offset) % order.length;
    const batter = order[idx];
    const li = document.createElement("li");
    if (offset === 0) li.classList.add("current");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = idx + 1;
    li.appendChild(num);
    if (batter.name) {
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = batter.name.slice(0, 3);
      li.appendChild(name);
    }
    if (batter.position) {
      const pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = batter.position;
      li.appendChild(pos);
    }
    els.orderList.appendChild(li);
  }
}

function updateTimestampLabel() {
  if (!lastUpdatedAt) return;
  const sec = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
  let label;
  if (sec < 3) label = "たった今";
  else if (sec < 60) label = `${sec}秒前に更新`;
  else label = `${Math.floor(sec / 60)}分前に更新`;
  els.updatedAt.textContent = label;
}

setInterval(updateTimestampLabel, 1000);

async function main() {
  const game = await connectGame();
  if (!game.ok) {
    els.setupError.style.display = "block";
    els.app.style.display = "none";
    return;
  }
  els.setupError.style.display = "none";
  els.app.style.display = "block";

  game.subscribe((val) => {
    if (!val) return;
    render(val);
  });
}

main();
