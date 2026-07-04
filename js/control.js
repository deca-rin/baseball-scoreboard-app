import {
  connectGame,
  connectArchives,
  defaultState,
  battingTeamOf,
  maxInningOf,
  finalInningOf,
  viewerUrlFor,
} from "./state.js";

const els = {
  setupError: document.getElementById("setup-error"),
  app: document.getElementById("app"),
  roomCode: document.getElementById("room-code"),
  viewerLink: document.getElementById("viewer-link"),
  qrImg: document.getElementById("qr-img"),
  copyLinkBtn: document.getElementById("copy-link-btn"),
  changeRoomInput: document.getElementById("change-room-input"),
  changeRoomBtn: document.getElementById("change-room-btn"),
  awayName: document.getElementById("away-name-input"),
  homeName: document.getElementById("home-name-input"),
  inningHalfDisplay: document.getElementById("inning-half-display"),
  battingTeamLabel: document.getElementById("batting-team-label"),
  switchHalfBtn: document.getElementById("switch-half-btn"),
  addRunBtn: document.getElementById("add-run-btn"),
  scoreTableBody: document.getElementById("score-table-body"),
  scoreTableHead: document.getElementById("score-table-head"),
  ballsLights: document.getElementById("balls-lights"),
  strikesLights: document.getElementById("strikes-lights"),
  outsLights: document.getElementById("outs-lights"),
  addBallBtn: document.getElementById("add-ball-btn"),
  addStrikeBtn: document.getElementById("add-strike-btn"),
  addOutBtn: document.getElementById("add-out-btn"),
  hitAdvanceBtn: document.getElementById("hit-advance-btn"),
  resetCountBtn: document.getElementById("reset-count-btn"),
  orderTabAway: document.getElementById("order-tab-away"),
  orderTabHome: document.getElementById("order-tab-home"),
  orderListAway: document.getElementById("order-list-away"),
  orderListHome: document.getElementById("order-list-home"),
  advanceBatterBtn: document.getElementById("advance-batter-btn"),
  manualInning: document.getElementById("manual-inning-input"),
  manualHalf: document.getElementById("manual-half-select"),
  applyManualBtn: document.getElementById("apply-manual-btn"),
  tournamentName: document.getElementById("tournament-name-input"),
  tournamentDate: document.getElementById("tournament-date-input"),
  tournamentTime: document.getElementById("tournament-time-input"),
  finalInningSelect: document.getElementById("final-inning-select"),
  saveArchiveBtn: document.getElementById("save-archive-btn"),
  resetGameBtn: document.getElementById("reset-game-btn"),
};

let state = null;
let game = null;
let archives = null;
let activeOrderTeam = "away";

function lights(container, count, max, cls) {
  container.innerHTML = "";
  for (let i = 0; i < max; i++) {
    const dot = document.createElement("span");
    dot.className = `light ${cls}${i < count ? " on" : ""}`;
    container.appendChild(dot);
  }
}

function render() {
  if (!state) return;

  const tournament = state.tournament || {};
  els.tournamentName.value = tournament.name || "";
  els.tournamentDate.value = tournament.date || "";
  els.tournamentTime.value = tournament.startTime || "";
  els.finalInningSelect.value = String(finalInningOf(state));

  els.awayName.value = state.teams.away.name;
  els.homeName.value = state.teams.home.name;

  const halfLabel = state.half === "top" ? "表" : "裏";
  els.inningHalfDisplay.textContent = `${state.inning} 回 ${halfLabel}`;
  const battingTeam = battingTeamOf(state);
  els.battingTeamLabel.textContent = `現在の攻撃: ${state.teams[battingTeam].name}`;
  els.advanceBatterBtn.textContent = `⚾ ヒット等で次の打者へ（${state.teams[battingTeam].name}）`;
  els.hitAdvanceBtn.textContent = `⚾ ヒット等で次の打者へ（${state.teams[battingTeam].name}）`;
  els.manualInning.value = state.inning;
  els.manualHalf.value = state.half;

  lights(els.ballsLights, state.count.balls, 3, "b");
  lights(els.strikesLights, state.count.strikes, 2, "s");
  lights(els.outsLights, state.count.outs, 2, "o");

  renderScoreTable();
  renderOrderList("away");
  renderOrderList("home");
  updateOrderTabs();
}

function renderScoreTable() {
  const maxInning = maxInningOf(state);
  els.scoreTableHead.innerHTML =
    "<th>チーム</th>" +
    Array.from({ length: maxInning }, (_, i) => `<th>${i + 1}</th>`).join("") +
    "<th>R</th>";

  els.scoreTableBody.innerHTML = "";
  ["away", "home"].forEach((team) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.className = "team-name";
    nameTd.textContent = state.teams[team].name;
    tr.appendChild(nameTd);

    const teamScores = (state.scores || {})[team] || {};
    let total = 0;
    for (let i = 1; i <= maxInning; i++) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      const val = teamScores[String(i)];
      input.value = val ?? "";
      total += Number(val) || 0;
      input.addEventListener("change", () => {
        const n = Math.max(0, Number(input.value) || 0);
        game.patch({ [`scores/${team}/${i}`]: n });
      });
      td.appendChild(input);
      tr.appendChild(td);
    }
    const totalTd = document.createElement("td");
    totalTd.textContent = total;
    totalTd.style.fontWeight = "700";
    tr.appendChild(totalTd);
    els.scoreTableBody.appendChild(tr);
  });
}

function renderOrderList(team) {
  const listEl = team === "away" ? els.orderListAway : els.orderListHome;
  listEl.innerHTML = "";
  const order = state.battingOrder[team];
  const current = state.currentBatter[team];

  order.forEach((batter, idx) => {
    const li = document.createElement("li");
    if (idx === current) li.classList.add("current");

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = idx + 1;
    li.appendChild(num);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = `${idx + 1}番`;
    nameInput.value = batter.name || "";
    nameInput.addEventListener("change", () => {
      game.patch({ [`battingOrder/${team}/${idx}/name`]: nameInput.value });
    });
    li.appendChild(nameInput);

    const posInput = document.createElement("input");
    posInput.type = "text";
    posInput.className = "pos";
    posInput.placeholder = "守備";
    posInput.style.maxWidth = "64px";
    posInput.value = batter.position || "";
    posInput.addEventListener("change", () => {
      game.patch({ [`battingOrder/${team}/${idx}/position`]: posInput.value });
    });
    li.appendChild(posInput);

    const setBtn = document.createElement("button");
    setBtn.className = "ghost";
    setBtn.textContent = "▶現在";
    setBtn.addEventListener("click", () => {
      game.patch({ [`currentBatter/${team}`]: idx });
    });
    li.appendChild(setBtn);

    listEl.appendChild(li);
  });
}

function updateOrderTabs() {
  els.orderTabAway.classList.toggle("active", activeOrderTeam === "away");
  els.orderTabHome.classList.toggle("active", activeOrderTeam === "home");
  els.orderListAway.style.display = activeOrderTeam === "away" ? "flex" : "none";
  els.orderListHome.style.display = activeOrderTeam === "home" ? "flex" : "none";
}

function switchHalfFields(s) {
  if (s.half === "top") return { half: "bottom", inning: s.inning };
  return { half: "top", inning: s.inning + 1 };
}

function advanceBatter(team) {
  const order = state.battingOrder[team];
  const next = (state.currentBatter[team] + 1) % order.length;
  return { [`currentBatter/${team}`]: next };
}

function recordOut() {
  const battingTeam = battingTeamOf(state);
  const newOuts = state.count.outs + 1;
  let patch = { ...advanceBatter(battingTeam) };
  if (newOuts >= 3) {
    patch = {
      ...patch,
      "count/balls": 0,
      "count/strikes": 0,
      "count/outs": 0,
      ...switchHalfFields(state),
    };
  } else {
    patch = {
      ...patch,
      "count/balls": 0,
      "count/strikes": 0,
      "count/outs": newOuts,
    };
  }
  game.patch(patch);
}

function recordBall() {
  const newBalls = state.count.balls + 1;
  if (newBalls >= 4) {
    const battingTeam = battingTeamOf(state);
    game.patch({
      "count/balls": 0,
      "count/strikes": 0,
      ...advanceBatter(battingTeam),
    });
  } else {
    game.patch({ "count/balls": newBalls });
  }
}

function recordStrike() {
  const newStrikes = state.count.strikes + 1;
  if (newStrikes >= 3) {
    recordOut();
  } else {
    game.patch({ "count/strikes": newStrikes });
  }
}

function bindEvents() {
  els.tournamentName.addEventListener("change", () => {
    game.patch({ "tournament/name": els.tournamentName.value });
  });
  els.tournamentDate.addEventListener("change", () => {
    game.patch({ "tournament/date": els.tournamentDate.value });
  });
  els.tournamentTime.addEventListener("change", () => {
    game.patch({ "tournament/startTime": els.tournamentTime.value });
  });
  els.finalInningSelect.addEventListener("change", () => {
    game.patch({ finalInning: Number(els.finalInningSelect.value) });
  });

  els.saveArchiveBtn.addEventListener("click", async () => {
    els.saveArchiveBtn.disabled = true;
    els.saveArchiveBtn.textContent = "保存中...";
    try {
      if (!archives) archives = await connectArchives();
      await archives.save(state, game.room);
      els.saveArchiveBtn.textContent = "保存しました";
    } catch {
      els.saveArchiveBtn.textContent = "保存に失敗しました";
    } finally {
      setTimeout(() => {
        els.saveArchiveBtn.textContent = "💾 この試合を記録として保存";
        els.saveArchiveBtn.disabled = false;
      }, 1800);
    }
  });

  els.resetGameBtn.addEventListener("click", () => {
    const ok = confirm(
      "現在の得点・BSO・打順をリセットして次の試合を始めますか？\n（大会名・日付は引き継がれます。保存していない記録は失われます）"
    );
    if (!ok) return;
    game.replace({ ...defaultState(), tournament: state.tournament });
  });

  els.awayName.addEventListener("change", () => {
    game.patch({ "teams/away/name": els.awayName.value || "アウェイ" });
  });
  els.homeName.addEventListener("change", () => {
    game.patch({ "teams/home/name": els.homeName.value || "ホーム" });
  });

  els.switchHalfBtn.addEventListener("click", () => {
    game.patch({
      "count/balls": 0,
      "count/strikes": 0,
      "count/outs": 0,
      ...switchHalfFields(state),
    });
  });

  els.addRunBtn.addEventListener("click", () => {
    const battingTeam = battingTeamOf(state);
    const cur = ((state.scores || {})[battingTeam] || {})[String(state.inning)] || 0;
    game.patch({ [`scores/${battingTeam}/${state.inning}`]: cur + 1 });
  });

  els.addBallBtn.addEventListener("click", recordBall);
  els.addStrikeBtn.addEventListener("click", recordStrike);
  els.addOutBtn.addEventListener("click", recordOut);
  els.hitAdvanceBtn.addEventListener("click", () => {
    const battingTeam = battingTeamOf(state);
    game.patch({
      "count/balls": 0,
      "count/strikes": 0,
      ...advanceBatter(battingTeam),
    });
  });
  els.resetCountBtn.addEventListener("click", () => {
    game.patch({ "count/balls": 0, "count/strikes": 0, "count/outs": 0 });
  });

  els.advanceBatterBtn.addEventListener("click", () => {
    game.patch(advanceBatter(battingTeamOf(state)));
  });

  els.orderTabAway.addEventListener("click", () => {
    activeOrderTeam = "away";
    updateOrderTabs();
  });
  els.orderTabHome.addEventListener("click", () => {
    activeOrderTeam = "home";
    updateOrderTabs();
  });

  els.applyManualBtn.addEventListener("click", () => {
    const inning = Math.max(1, Number(els.manualInning.value) || 1);
    const half = els.manualHalf.value === "bottom" ? "bottom" : "top";
    game.patch({
      inning,
      half,
      "count/balls": 0,
      "count/strikes": 0,
      "count/outs": 0,
    });
  });

  els.copyLinkBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.viewerLink.textContent);
      els.copyLinkBtn.textContent = "コピーしました";
      setTimeout(() => (els.copyLinkBtn.textContent = "リンクをコピー"), 1500);
    } catch {
      /* clipboard unavailable; link text is already selectable */
    }
  });

  els.changeRoomBtn.addEventListener("click", () => {
    const raw = els.changeRoomInput.value.trim();
    const sanitized = raw.replace(/[^a-zA-Z0-9-_]/g, "");
    if (!sanitized) {
      alert("ルーム名は半角英数字・ハイフン・アンダースコアで入力してください。");
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("room", sanitized);
    location.href = url.toString();
  });
}

async function main() {
  game = await connectGame();
  if (!game.ok) {
    els.setupError.style.display = "block";
    els.app.style.display = "none";
    return;
  }

  els.setupError.style.display = "none";
  els.app.style.display = "block";
  els.roomCode.textContent = game.room;
  els.changeRoomInput.value = game.room;
  const link = viewerUrlFor(game.room);
  els.viewerLink.textContent = link;
  els.qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    link
  )}`;

  bindEvents();
  updateOrderTabs();

  game.subscribe((val) => {
    if (!val) return;
    state = val;
    render();
  });
}

main();
