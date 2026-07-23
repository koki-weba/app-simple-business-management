/* クラウド同期 — Puter（設定不要・同一アカウントで自動） / Firebase（任意） */
window.CloudSync = (() => {
  "use strict";

  const DEVICE_KEY = "startupRoadmap_deviceId";
  const PUTER_KV_KEY = "startupRoadmap_cloud_v1";
  const POLL_MS = 4000;

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

  function isPuterAvailable() {
    return typeof puter !== "undefined" && !!(puter && puter.kv);
  }

  function isConfigured() {
    return isFirebaseConfigured() || isPuterAvailable();
  }

  function getProvider() {
    if (isFirebaseConfigured()) return "firebase";
    if (isPuterAvailable()) return "puter";
    return null;
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
    if (raw.length < 350000) return copy;
    copy.trash = [];
    copy.archives = (copy.archives || []).slice(0, 3);
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

  async function init() {
    providerName = getProvider();
    if (!providerName) return false;
    if (providerName === "firebase") {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(window.FirebaseConfig);
        }
        db = firebase.firestore();
        return true;
      } catch (e) {
        console.error("CloudSync Firebase init failed", e);
        providerName = isPuterAvailable() ? "puter" : null;
        return !!providerName;
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
    if (!db || !syncId) return;
    const doc = wrapDoc(payload);
    await docRef(syncId).set(doc);
    lastSeenRemoteMs = doc.updatedAtMs;
  }

  async function pullPuter() {
    const raw = await puter.kv.get(PUTER_KV_KEY);
    if (raw == null || raw === "") return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function pushPuter(payload) {
    const doc = wrapDoc(payload);
    await puter.kv.set(PUTER_KV_KEY, doc);
    lastSeenRemoteMs = doc.updatedAtMs;
  }

  async function pull(syncId) {
    if (providerName === "firebase") return pullFirebase(syncId);
    if (providerName === "puter") return pullPuter();
    return null;
  }

  async function push(syncId, payload) {
    if (providerName === "firebase") return pushFirebase(syncId, payload);
    if (providerName === "puter") return pushPuter(payload);
  }

  function schedulePush(syncId, getPayload) {
    if (applyingRemote || !providerName) return;
    if (providerName === "firebase" && !syncId) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        await push(syncId, getPayload());
        if (mergeHandler) mergeHandler({ type: "pushed" });
      } catch (e) {
        console.error("CloudSync push failed", e);
        if (mergeHandler) mergeHandler({ type: "error", message: e.message || String(e) });
      }
    }, 1200);
  }

  function emitRemote(remote) {
    if (!remote || applyingRemote) return;
    if (remote.deviceId === getDeviceId()) {
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
    if (providerName === "firebase") {
      if (!db || !syncId) return;
      unsubscribe = docRef(syncId).onSnapshot(
        (snap) => {
          if (!snap.exists) return;
          emitRemote(snap.data());
        },
        (err) => console.error("CloudSync watch error", err)
      );
      return;
    }
    if (providerName === "puter") {
      const tick = async () => {
        if (applyingRemote || document.visibilityState === "hidden") return;
        try {
          const remote = await pullPuter();
          if (remote) emitRemote(remote);
        } catch (e) {
          console.error("CloudSync poll error", e);
        }
      };
      pollTimer = setInterval(tick, POLL_MS);
      tick();
    }
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
    if (p === "puter") return "クラウド（自動）";
    return "未接続";
  }

  return {
    isConfigured,
    isFirebaseConfigured,
    isPuterAvailable,
    getProvider,
    getProviderName: () => providerName || getProvider(),
    getStatusLabel,
    getDeviceId,
    generateSyncId,
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
