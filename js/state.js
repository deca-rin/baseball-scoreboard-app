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

const SESSION_HEARTBEAT_MS = 10000;
const SESSION_STALE_MS = 30000;
const mySessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// チーム名(ルーム名)の重複防止(Firebase Authenticationでのメール/パスワード登録)と、
// 同時操作の防止(登録済みルームを開いている間ハートビートを送り、同じルームを
// 別の画面が同時に操作しようとした場合はブロックする)を行う。
// 実際のスコア入力・閲覧(games/archives)はログイン不要のまま。
export async function connectRoomAuth() {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: "not-configured" };
  const { app, db, ref, get, runTransaction, update } = await fb;
  const authModule = await import(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
  );
  const auth = authModule.getAuth(app);

  let heartbeatTimer = null;

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function startHeartbeat(room) {
    stopHeartbeat();
    const tick = () =>
      update(ref(db, `roomRegistry/${room}/session`), {
        sessionId: mySessionId,
        heartbeatAt: Date.now(),
      });
    tick();
    heartbeatTimer = setInterval(tick, SESSION_HEARTBEAT_MS);
    window.addEventListener("beforeunload", stopHeartbeat);
  }

  function friendlyAuthError(err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) return "このメールアドレスは既に登録されています。ログインしてください。";
    if (code.includes("wrong-password") || code.includes("invalid-credential")) return "メールアドレスまたはパスワードが違います。";
    if (code.includes("user-not-found")) return "このメールアドレスはまだ登録されていません。新規登録してください。";
    if (code.includes("weak-password")) return "パスワードは6文字以上にしてください。";
    if (code.includes("invalid-email")) return "メールアドレスの形式が正しくありません。";
    return "エラーが発生しました。もう一度お試しください。";
  }

  // ルーム名の新規登録・確認(「ルーム名を変更」の操作から呼ばれる)。ログイン必須。
  async function claimRoom(room) {
    const user = auth.currentUser;
    if (!user) return { ok: false, message: "先にログインしてください。" };
    let result = { ok: true };
    try {
      await runTransaction(ref(db, `roomRegistry/${room}`), (current) => {
        if (current) {
          if (current.uid !== user.uid) {
            result = { ok: false, message: "このルーム名は既に他の人が使用しています。別の名前を選んでください。" };
            return current; // 変更せず中止
          }
          return current; // 既に自分のものなのでそのまま
        }
        return { uid: user.uid, email: user.email, registeredAt: Date.now() };
      });
    } catch {
      result = { ok: false, message: "登録に失敗しました。時間をおいてもう一度お試しください。" };
    }
    return result;
  }

  // 登録済みルームを開く際に呼ぶ。ログイン不要。同時に他の画面が操作中でなければロックを取得する。
  // ("session" 以下だけを操作することで、claimRoom(ログイン必須)とは別の
  //  ルールパスとして扱えるようにしている。詳しくは README のルール例を参照。)
  async function enterRoomSession(room) {
    let result = { ok: true, locked: false };
    try {
      const snap = await get(ref(db, `roomRegistry/${room}`));
      if (!snap.exists()) return result; // 未登録ルームはロック不要

      await runTransaction(ref(db, `roomRegistry/${room}/session`), (session) => {
        const now = Date.now();
        if (
          session &&
          session.sessionId !== mySessionId &&
          now - (session.heartbeatAt || 0) < SESSION_STALE_MS
        ) {
          result = {
            ok: false,
            locked: true,
            message: "このルームは現在、別の画面で操作中です。少し待ってから開き直してください。",
          };
          return session; // 変更せず中止
        }
        return { sessionId: mySessionId, heartbeatAt: now };
      });
    } catch {
      // ルームロックの確認に失敗した場合は、ブロックせずそのまま利用を許可する
      result = { ok: true, locked: false };
    }
    if (result.ok) startHeartbeat(room);
    return result;
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
    enterRoomSession,
    stopHeartbeat,
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
