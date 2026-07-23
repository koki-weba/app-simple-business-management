/* クラウド同期 — Puter（無料・クライアント発行の同期ID）/ Firebase（任意）
 * JSONBlob は 429 制限があるため使わない。
 * 同じ同期ID + 同じ Puter アカウントで、snsLogs を含む全データを共有する。
 */
window.CloudSync = (() => {
  "use strict";

  const DEVICE_KEY = "startupRoadmap_deviceId";
  const SYNC_ID_KEY = "startupRoadmap_syncId_v1";
  const POLL_MS = 4000;

  let db = null;
  let unsubscribe = null;
  let pollTimer = null;
  let pushTimer = null;
  let mergeHandler = null;
  let applyingRemote = false;
  let lastSeenRemoteMs = 0;
  let providerName = null;
  let pushInFlight = null;

  function isFirebaseConfigured() {
    const c = window.FirebaseConfig;
    return !!(c && c.enabled && c.projectId && c.apiKey && typeof firebase !== "undefined");
  }

  function isPuterReady() {
    return typeof puter !== "undefined" && !!(puter && puter.kv);
  }

  function isConfigured() {
    return isFirebaseConfigured() || isPuterReady() || typeof puter !== "undefined";
  }

  function getProvider() {
    if (isFirebaseConfigured()) return "firebase";
    if (isPuterReady()) return "puter";
    return null;
  }

  function kvKey(syncId) {
    return "sr_cloud_v1_" + syncId;
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d_${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function generateSyncId() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function loadStoredSyncId() {
    try {
      return (localStorage.getItem(SYNC_ID_KEY) || "").trim();
    } catch {
      return "";
    }
  }

  function storeSyncId(id) {
    try {
      if (!id) localStorage.removeItem(SYNC_ID_KEY);
      else localStorage.setItem(SYNC_ID_KEY, id);
    } catch (_) {}
  }

  function ensureSyncId(syncId) {
    let id = (syncId || loadStoredSyncId() || "").trim();
    if (!id) {
      id = generateSyncId();
      storeSyncId(id);
    }
    return id;
  }

  function setMergeHandler(fn) {
    mergeHandler = fn;
  }

  function setApplyingRemote(v) {
    applyingRemote = v;
  }

  function slimPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const copy = JSON.parse(JSON.stringify(payload));
    let raw = JSON.stringify(copy);
    if (raw.length < 320000) return copy;
    copy.trash = [];
    copy.archives = (copy.archives || []).slice(0, 2);
    raw = JSON.stringify(copy);
    if (raw.length < 320000) return copy;
    copy.journal = (copy.journal || []).slice(-30);
    return copy;
  }

  function wrapDoc(payload) {
    const slim = slimPayload(payload);
    const updatedAtMs =
      Number(slim?._meta?.updatedAtMs) ||
      Date.parse(slim?._meta?.updatedAt || "") ||
      Date.now();
    return {
      payload: slim,
      updatedAtMs,
      revision: Number(slim?._meta?.revision) || 0,
      deviceId: getDeviceId(),
      appVersion: slim?.schemaVersion || 0,
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForPuter(timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isPuterReady()) return true;
      await sleep(150);
    }
    return isPuterReady();
  }

  function isSignedIn() {
    try {
      if (providerName === "firebase" || isFirebaseConfigured()) return true;
      if (!isPuterReady() || !puter.auth) return false;
      return !!puter.auth.isSignedIn();
    } catch {
      return false;
    }
  }

  /** ボタン操作からのみ呼ぶ（ポップアップ制限のため） */
  async function ensureSignedIn() {
    if (isFirebaseConfigured() && providerName === "firebase") return true;
    await waitForPuter();
    if (!isPuterReady()) throw new Error("同期サービスを読み込めませんでした");
    if (puter.auth?.isSignedIn?.()) return true;
    if (!puter.auth?.signIn) throw new Error("ログイン機能が利用できません");
    await puter.auth.signIn();
    if (!puter.auth.isSignedIn()) throw new Error("ログインがキャンセルされました");
    return true;
  }

  async function getAccountLabel() {
    try {
      if (!isSignedIn()) return "";
      if (providerName === "firebase") return "Firebase";
      const user = await puter.auth.getUser();
      return user?.username || user?.email || "ログイン済み";
    } catch {
      return isSignedIn() ? "ログイン済み" : "";
    }
  }

  async function init() {
    if (isFirebaseConfigured()) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(window.FirebaseConfig);
        }
        db = firebase.firestore();
        providerName = "firebase";
        return true;
      } catch (e) {
        console.error("CloudSync Firebase init failed", e);
      }
    }
    const ok = await waitForPuter();
    providerName = ok ? "puter" : null;
    if (!ok) throw new Error("同期サービスを読み込めませんでした。ネット接続のあと再読み込みしてください");
    return true;
  }

  function docRef(syncId) {
    return db.collection("roadmaps").doc(syncId);
  }

  async function pullFirebase(syncId) {
    if (!db || !syncId) return null;
    const snap = await docRef(syncId).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  async function pushFirebase(syncId, payload) {
    if (!db || !syncId) return syncId;
    const doc = wrapDoc(payload);
    await docRef(syncId).set(doc);
    lastSeenRemoteMs = doc.updatedAtMs;
    return syncId;
  }

  function normalizeRemote(raw) {
    if (raw == null || raw === "") return null;
    let data = raw;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (data && data.payload) return data;
    if (data && data.schemaVersion != null) {
      return { payload: data, updatedAtMs: Date.now(), deviceId: "", revision: 0 };
    }
    return data;
  }

  async function pullPuter(syncId) {
    if (!syncId) return null;
    if (!isPuterReady()) await waitForPuter();
    if (!isPuterReady()) throw new Error("クラウド未接続");
    if (!isSignedIn()) throw new Error("未ログインです。「クラウドにログイン」を押してください");
    const raw = await puter.kv.get(kvKey(syncId));
    return normalizeRemote(raw);
  }

  async function pushPuter(syncId, payload) {
    const id = ensureSyncId(syncId);
    if (!isPuterReady()) await waitForPuter();
    if (!isPuterReady()) throw new Error("クラウド未接続");
    if (!isSignedIn()) throw new Error("未ログインです。「クラウドにログイン」を押してください");
    const doc = wrapDoc(payload);
    await puter.kv.set(kvKey(id), doc);
    storeSyncId(id);
    lastSeenRemoteMs = doc.updatedAtMs;
    return id;
  }

  async function pull(syncId) {
    const id = syncId || loadStoredSyncId();
    if (!id) return null;
    if (providerName === "firebase") return pullFirebase(id);
    return pullPuter(id);
  }

  async function push(syncId, payload) {
    if (pushInFlight) {
      try {
        await pushInFlight;
      } catch (_) {}
    }
    const run = (async () => {
      const id = ensureSyncId(syncId);
      if (providerName === "firebase") {
        const out = await pushFirebase(id, payload);
        if (out) storeSyncId(out);
        return out;
      }
      const out = await pushPuter(id, payload);
      if (out) storeSyncId(out);
      return out;
    })();
    pushInFlight = run;
    try {
      return await run;
    } finally {
      if (pushInFlight === run) pushInFlight = null;
    }
  }

  function schedulePush(syncId, getPayload) {
    if (applyingRemote) return;
    if (!providerName) providerName = getProvider();
    if (providerName === "puter" && !isSignedIn()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        const newId = await push(syncId || loadStoredSyncId(), getPayload());
        if (mergeHandler) mergeHandler({ type: "pushed", syncId: newId });
      } catch (e) {
        console.error("CloudSync push failed", e);
        if (mergeHandler) mergeHandler({ type: "error", message: e.message || String(e) });
      }
    }, 1000);
  }

  function emitRemote(remote) {
    if (!remote || applyingRemote) return;
    if (remote.deviceId && remote.deviceId === getDeviceId()) {
      lastSeenRemoteMs = Math.max(lastSeenRemoteMs, Number(remote.updatedAtMs) || 0);
      return;
    }
    const ms = Number(remote.updatedAtMs) || 0;
    if (ms && ms <= lastSeenRemoteMs) return;
    lastSeenRemoteMs = Math.max(lastSeenRemoteMs, ms);
    if (mergeHandler) mergeHandler({ type: "remote", data: remote });
  }

  function startWatch(syncId) {
    stopWatch();
    const id = syncId || loadStoredSyncId();
    if (!id) return;
    if (providerName === "firebase") {
      if (!db) return;
      unsubscribe = docRef(id).onSnapshot(
        (snap) => {
          if (!snap.exists) return;
          emitRemote(snap.data());
        },
        (err) => console.error("CloudSync watch error", err)
      );
      return;
    }
    const tick = async () => {
      if (applyingRemote || document.visibilityState === "hidden") return;
      try {
        const remote = await pullPuter(id);
        if (remote) emitRemote(remote);
      } catch (e) {
        console.error("CloudSync poll error", e);
      }
    };
    pollTimer = setInterval(tick, POLL_MS);
    tick();
  }

  function stopWatch() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function getStatusLabel() {
    const p = providerName || getProvider();
    if (p === "firebase") return "Firebase";
    if (p === "puter") return isSignedIn() ? "無料クラウド" : "未ログイン";
    return "未接続";
  }

  return {
    isConfigured,
    isFirebaseConfigured,
    isPuterReady,
    isSignedIn,
    ensureSignedIn,
    getAccountLabel,
    getProvider,
    getProviderName: () => providerName || getProvider(),
    getStatusLabel,
    getDeviceId,
    generateSyncId,
    ensureSyncId,
    loadStoredSyncId,
    storeSyncId,
    waitForPuter,
    init,
    pull,
    push,
    schedulePush,
    startWatch,
    stopWatch,
    setApplyingRemote,
    setMergeHandler,
  };
})();
