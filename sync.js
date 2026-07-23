/* クラウド同期 — JSONBlob（ログイン不要） / Firebase（任意）
 * 同じ同期IDを両端末で共有すれば、snsLogs を含む全データが同期されます。
 */
window.CloudSync = (() => {
  "use strict";

  const DEVICE_KEY = "startupRoadmap_deviceId";
  const SYNC_ID_KEY = "startupRoadmap_syncId_v1";
  const JSONBLOB_BASE = "https://jsonblob.com/api/jsonBlob";
  const POLL_MS = 3500;

  let db = null;
  let unsubscribe = null;
  let pollTimer = null;
  let pushTimer = null;
  let mergeHandler = null;
  let applyingRemote = false;
  let lastSeenRemoteMs = 0;
  let providerName = null;

  function isFirebaseConfigured() {
    const c = window.FirebaseConfig;
    return !!(c && c.enabled && c.projectId && c.apiKey && typeof firebase !== "undefined");
  }

  function isConfigured() {
    return true; // JSONBlob は常に利用可（ネット必須）
  }

  function getProvider() {
    if (isFirebaseConfigured()) return "firebase";
    return "jsonblob";
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
    for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
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

  function setMergeHandler(fn) {
    mergeHandler = fn;
  }

  function setApplyingRemote(v) {
    applyingRemote = v;
  }

  function slimPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const copy = JSON.parse(JSON.stringify(payload));
    const raw = JSON.stringify(copy);
    if (raw.length < 900000) return copy;
    copy.trash = [];
    copy.archives = (copy.archives || []).slice(0, 2);
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

  function extractBlobId(res) {
    let fromHeader =
      res.headers.get("X-jsonblob") ||
      res.headers.get("x-jsonblob") ||
      res.headers.get("Location") ||
      res.headers.get("location") ||
      "";
    if (!fromHeader) {
      res.headers.forEach((value, key) => {
        const k = String(key).toLowerCase();
        if (k === "x-jsonblob" || k === "location") fromHeader = value;
      });
    }
    if (fromHeader) {
      const parts = String(fromHeader).replace(/\/$/, "").split("/");
      return parts[parts.length - 1];
    }
    if (res.url && res.url.includes("/jsonBlob/")) {
      const parts = res.url.replace(/\/$/, "").split("/");
      return parts[parts.length - 1];
    }
    return "";
  }

  async function init() {
    providerName = getProvider();
    if (providerName === "firebase") {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(window.FirebaseConfig);
        }
        db = firebase.firestore();
        return true;
      } catch (e) {
        console.error("CloudSync Firebase init failed", e);
        providerName = "jsonblob";
      }
    }
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

  async function pullJsonblob(syncId) {
    if (!syncId) return null;
    const res = await fetch(`${JSONBLOB_BASE}/${encodeURIComponent(syncId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("クラウド取得に失敗 (" + res.status + ")");
    const data = await res.json();
    if (data && data.payload) return data;
    // 古い形式や素のペイロードも許容
    if (data && data.schemaVersion != null) {
      return { payload: data, updatedAtMs: Date.now(), deviceId: "", revision: 0 };
    }
    return data;
  }

  async function pushJsonblob(syncId, payload) {
    const doc = wrapDoc(payload);
    const body = JSON.stringify(doc);

    if (syncId) {
      const res = await fetch(`${JSONBLOB_BASE}/${encodeURIComponent(syncId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
      if (res.ok) {
        lastSeenRemoteMs = doc.updatedAtMs;
        return syncId;
      }
      if (res.status !== 404) {
        throw new Error("クラウド送信に失敗 (" + res.status + ")");
      }
      // 404 → 新規作成へ
    }

    const res = await fetch(JSONBLOB_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });
    if (!res.ok) throw new Error("クラウド作成に失敗 (" + res.status + ")");
    const newId = extractBlobId(res);
    if (!newId) throw new Error("同期IDを取得できませんでした（CORS）");
    storeSyncId(newId);
    lastSeenRemoteMs = doc.updatedAtMs;
    return newId;
  }

  async function pull(syncId) {
    const id = syncId || loadStoredSyncId();
    if (providerName === "firebase") return pullFirebase(id);
    return pullJsonblob(id);
  }

  async function push(syncId, payload) {
    const id = syncId || loadStoredSyncId();
    if (providerName === "firebase") {
      const out = await pushFirebase(id, payload);
      if (out) storeSyncId(out);
      return out;
    }
    const out = await pushJsonblob(id, payload);
    if (out) storeSyncId(out);
    return out;
  }

  function schedulePush(syncId, getPayload) {
    if (applyingRemote) return;
    if (!providerName) providerName = getProvider();
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
    if (providerName === "firebase") {
      if (!db || !id) return;
      unsubscribe = docRef(id).onSnapshot(
        (snap) => {
          if (!snap.exists) return;
          emitRemote(snap.data());
        },
        (err) => console.error("CloudSync watch error", err)
      );
      return;
    }
    if (!id) return;
    const tick = async () => {
      if (applyingRemote || document.visibilityState === "hidden") return;
      try {
        const remote = await pullJsonblob(id);
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
    if (p === "jsonblob") return "クラウド同期";
    return "未接続";
  }

  return {
    isConfigured,
    isFirebaseConfigured,
    getProvider,
    getProviderName: () => providerName || getProvider(),
    getStatusLabel,
    getDeviceId,
    generateSyncId,
    loadStoredSyncId,
    storeSyncId,
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
