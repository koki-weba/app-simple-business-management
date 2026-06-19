/* クラウド同期（Firebase Firestore）— スマホ・PC間でデータ共有 */
window.CloudSync = (() => {
  "use strict";

  const DEVICE_KEY = "startupRoadmap_deviceId";
  let db = null;
  let unsubscribe = null;
  let pushTimer = null;
  let mergeHandler = null;
  let applyingRemote = false;

  function isConfigured() {
    const c = window.FirebaseConfig;
    return !!(c && c.enabled && c.projectId && c.apiKey && typeof firebase !== "undefined");
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

  async function init() {
    if (!isConfigured()) return false;
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FirebaseConfig);
      }
      db = firebase.firestore();
      return true;
    } catch (e) {
      console.error("CloudSync init failed", e);
      return false;
    }
  }

  function docRef(syncId) {
    return db.collection("roadmaps").doc(syncId);
  }

  async function pull(syncId) {
    if (!db || !syncId) return null;
    const snap = await docRef(syncId).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  async function push(syncId, payload) {
    if (!db || !syncId) return;
    await docRef(syncId).set({
      payload,
      updatedAtMs: Date.now(),
      deviceId: getDeviceId(),
      appVersion: payload.schemaVersion || 0,
    });
  }

  function schedulePush(syncId, getPayload) {
    if (!db || !syncId || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        await push(syncId, getPayload());
      } catch (e) {
        console.error("CloudSync push failed", e);
        if (mergeHandler) mergeHandler({ type: "error", message: e.message });
      }
    }, 1500);
  }

  function startWatch(syncId) {
    if (!db || !syncId) return;
    stopWatch();
    unsubscribe = docRef(syncId).onSnapshot(
      (snap) => {
        if (!snap.exists || applyingRemote) return;
        const remote = snap.data();
        if (remote.deviceId === getDeviceId()) return;
        if (mergeHandler) mergeHandler({ type: "remote", data: remote });
      },
      (err) => console.error("CloudSync watch error", err)
    );
  }

  function stopWatch() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function setApplyingRemote(v) {
    applyingRemote = v;
  }

  return {
    isConfigured,
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
