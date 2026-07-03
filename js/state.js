import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const BATTERS_PER_TEAM = 9;
const REGULAR_INNINGS = 9;

export function defaultState() {
  return {
    meta: { updatedAt: Date.now() },
    tournament: { name: "", date: "", startTime: "" },
    teams: {
      away: { name: "アウェイ" },
      home: { name: "ホーム" },
    },
    inning: 1,
    half: "top", // "top" = 表(アウェイ攻撃) / "bottom" = 裏(ホーム攻撃)
    count: { balls: 0, strikes: 0, outs: 0 },
    scores: { away: {}, home: {} },
    battingOrder: {
      away: Array.from({ length: BATTERS_PER_TEAM }, () => ({ name: "", position: "" })),
      home: Array.from({ length: BATTERS_PER_TEAM }, () => ({ name: "", position: "" })),
    },
    currentBatter: { away: 0, home: 0 },
  };
}

export function battingTeamOf(state) {
  return state.half === "top" ? "away" : "home";
}

export function fieldingTeamOf(state) {
  return state.half === "top" ? "home" : "away";
}

export function maxInningOf(state) {
  const innings = [
    ...Object.keys(state.scores?.away || {}),
    ...Object.keys(state.scores?.home || {}),
  ].map(Number);
  return Math.max(REGULAR_INNINGS, state.inning || 1, ...(innings.length ? innings : [0]));
}

// そのチームが指定イニングの打席を(一部でも)迎えたかどうか。
// アウェイは表、ホームは裏でしか打席が来ないため、現在の回・表裏によって判定が変わる。
export function hasBattedInInning(state, team, inningNum) {
  if (inningNum < state.inning) return true;
  if (inningNum > state.inning) return false;
  if (team === "away") return true; // 表は常に裏より先に来る
  return state.half === "bottom";
}

export function totalOf(state, team) {
  const scores = state.scores?.[team] || {};
  return Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function getRoomId() {
  const params = new URLSearchParams(location.search);
  let room = params.get("room");
  if (!room) {
    room = localStorage.getItem("bb-scoreboard-room");
  }
  if (!room) {
    room = Math.random().toString(36).slice(2, 6);
  }
  localStorage.setItem("bb-scoreboard-room", room);
  if (params.get("room") !== room) {
    params.set("room", room);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }
  return room;
}

export function formatTournamentDateTime(tournament) {
  if (!tournament) return "";
  const parts = [];
  if (tournament.date) parts.push(tournament.date.replaceAll("-", "/"));
  if (tournament.startTime) parts.push(`${tournament.startTime} 開始`);
  return parts.join(" ");
}

export function viewerUrlFor(room) {
  const url = new URL("display.html", location.href);
  url.searchParams.set("room", room);
  return url.toString();
}

let firebasePromise = null;

// 同じページ内で複数回 initializeApp を呼ぶとエラーになるため、
// アプリ/DBのインスタンスは1回だけ作って使い回す。
function getFirebase() {
  if (!isFirebaseConfigured) return null;
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"
      );
      const dbModule = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js"
      );
      const app = initializeApp(firebaseConfig);
      const db = dbModule.getDatabase(app);
      return { db, ...dbModule };
    })();
  }
  return firebasePromise;
}

export async function connectGame() {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: "not-configured" };
  const { db, ref, onValue, set, update, get } = await fb;

  const room = getRoomId();
  const gameRef = ref(db, `games/${room}`);

  const snap = await get(gameRef);
  if (!snap.exists()) {
    await set(gameRef, defaultState());
  }

  return {
    ok: true,
    room,
    gameRef,
    subscribe: (cb) => onValue(gameRef, (s) => cb(s.val())),
    patch: (partial) => update(gameRef, { ...partial, "meta/updatedAt": Date.now() }),
    replace: (full) => set(gameRef, { ...full, meta: { updatedAt: Date.now() } }),
  };
}

export async function connectArchives() {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: "not-configured" };
  const { db, ref, push, set, get } = await fb;
  const archivesRef = ref(db, "archives");

  return {
    ok: true,
    save: async (state, room) => {
      const entryRef = push(archivesRef);
      await set(entryRef, {
        savedAt: Date.now(),
        room,
        tournament: state.tournament || { name: "", date: "", startTime: "" },
        teams: state.teams,
        scores: state.scores,
        battingOrder: state.battingOrder,
      });
      return entryRef.key;
    },
    list: async () => {
      const snap = await get(archivesRef);
      if (!snap.exists()) return [];
      const val = snap.val();
      return Object.entries(val)
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    },
  };
}
