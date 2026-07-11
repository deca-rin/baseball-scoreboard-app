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
    finalInning: REGULAR_INNINGS,
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

export function finalInningOf(state) {
  return state.finalInning || REGULAR_INNINGS;
}

export function maxInningOf(state) {
  const innings = [
    ...Object.keys(state.scores?.away || {}),
    ...Object.keys(state.scores?.home || {}),
  ].map(Number);
  return Math.max(finalInningOf(state), state.inning || 1, ...(innings.length ? innings : [0]));
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

// 最終回(以降)の裏で、ホームが表の時点で既にリードしていて
// 裏の攻撃をする必要がない場合に「×」を表示するための判定。
export function shouldShowX(state, inningNum) {
  if (inningNum !== state.inning) return false;
  if (inningNum < finalInningOf(state)) return false;
  if (state.half !== "bottom") return false;
  return totalOf(state, "home") > totalOf(state, "away");
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
      return { app, db, ...dbModule };
    })();
  }
  return firebasePromise;
}

// チーム名(ルーム名)の重複を防ぐための、Firebase Authenticationを使った登録・確認。
// メール/パスワードでサインアップ/ログインし、そのUIDをルーム名の「所有者」として
// roomRegistry に記録する。実際のスコア入力・閲覧(games/archives)はログイン不要のまま。
export async function connectRoomAuth() {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: "not-configured" };
  const { app, db, ref, get, set } = await fb;
  const authModule = await import(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
  );
  const auth = authModule.getAuth(app);

  function friendlyAuthError(err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) return "このメールアドレスは既に登録されています。ログインしてください。";
    if (code.includes("wrong-password") || code.includes("invalid-credential")) return "メールアドレスまたはパスワードが違います。";
    if (code.includes("user-not-found")) return "このメールアドレスはまだ登録されていません。新規登録してください。";
    if (code.includes("weak-password")) return "パスワードは6文字以上にしてください。";
    if (code.includes("invalid-email")) return "メールアドレスの形式が正しくありません。";
    return "エラーが発生しました。もう一度お試しください。";
  }

  async function claimRoom(room) {
    const user = auth.currentUser;
    if (!user) return { ok: false, message: "先にログインしてください。" };
    const registryRef = ref(db, `roomRegistry/${room}`);
    const snap = await get(registryRef);
    if (snap.exists()) {
      const entry = snap.val();
      if (entry.uid !== user.uid) {
        return { ok: false, message: "このルーム名は既に他の人が使用しています。別の名前を選んでください。" };
      }
      return { ok: true };
    }
    await set(registryRef, { uid: user.uid, email: user.email, registeredAt: Date.now() });
    return { ok: true };
  }

  return {
    ok: true,
    onAuthChange: (cb) => authModule.onAuthStateChanged(auth, cb),
    currentUser: () => auth.currentUser,
    signUp: async (email, password) => {
      try {
        await authModule.createUserWithEmailAndPassword(auth, email, password);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: friendlyAuthError(err) };
      }
    },
    signIn: async (email, password) => {
      try {
        await authModule.signInWithEmailAndPassword(auth, email, password);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: friendlyAuthError(err) };
      }
    },
    signOut: () => authModule.signOut(auth),
    claimRoom,
  };
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
