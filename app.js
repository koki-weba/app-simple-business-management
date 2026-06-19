/* 起業ロードマップ PWA v3 — メインロジック */
(() => {
  "use strict";

  const D = window.StartupDefaults;
  const STORAGE_KEY = D.STORAGE_KEY;
  const APP_VERSION = 11;
  const CIRC = 326.7;

  const PAGE_META = {
    home: { title: "ホーム", sub: "今日のフォーカスと進捗" },
    roadmap: { title: "ロードマップ", sub: "5期間・全マイルストーン" },
    kpi: { title: "KPI", sub: "月次売上と手取り" },
    sales: { title: "営業", sub: "DM・テンプレート・ログ" },
    clients: { title: "案件", sub: "クライアントと実績" },
    tasks: { title: "タスク", sub: "行動と戦略メモ" },
    settings: { title: "設定", sub: "目標・データ管理" },
  };

  let data = null;
  let chartRange = 6;
  let revenueChart = null;
  let taskFilter = "all";
  let deferredInstall = null;
  let undoCallback = null;
  let swRegistration = null;
  let swReloading = false;
  let serverVersionRemote = null;
  let cloudPushPaused = false;

  const ENTITY_LABELS = {
    client: "案件",
    customTask: "タスク",
    defaultTask: "タスク",
    note: "メモ",
    salesLog: "営業ログ",
    monthlyRecord: "月次記録",
    customMilestone: "マイルストーン",
    customDmTemplate: "DMテンプレート",
    monthOverride: "月次計画",
    monthTarget: "月別目標",
    phaseOverride: "期間計画",
    roadmapIntro: "ロードマップ概要",
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const currentMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const formatYen = (n, short) => {
    if (n == null || isNaN(n)) return "--";
    if (short && Math.abs(n) >= 10000) return `${Math.round(n / 10000)}万`;
    return `${Math.round(n).toLocaleString("ja-JP")}円`;
  };
  const parseNum = (v) => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Storage（アプリ更新と独立したユーザーデータキー） ── */
  function touchMeta() {
    if (!data) return;
    if (!data._meta) data._meta = {};
    data._meta.deviceId = window.CloudSync?.getDeviceId?.() || data._meta.deviceId || "";
    data._meta.updatedAt = new Date().toISOString();
  }

  function loadDataLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      data = D.migrateUserData(saved);
    } catch {
      data = D.createDefaultUserData();
    }
    touchMeta();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function loadData() {
    loadDataLocal();
  }

  function saveData(render = true) {
    touchMeta();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      toast("保存に失敗しました。ストレージ容量を確認してください。");
      console.error(e);
    }
    if (
      !cloudPushPaused &&
      data.sync?.enabled &&
      data.sync.syncId &&
      window.CloudSync?.isConfigured?.()
    ) {
      const syncId = data.sync.syncId;
      CloudSync.schedulePush(syncId, () => JSON.parse(JSON.stringify(data)));
      data.sync.lastSyncStatus = "pending";
    }
    if (render) renderAll();
  }

  async function applyRemoteCloud(remoteDoc, silent) {
    if (!remoteDoc?.payload) return false;
    const remotePayload = remoteDoc.payload;
    const localMs = new Date(data._meta?.updatedAt || 0).getTime();
    const remoteMs =
      remoteDoc.updatedAtMs || new Date(remotePayload._meta?.updatedAt || 0).getTime();
    if (remoteMs <= localMs) return false;

    CloudSync.setApplyingRemote(true);
    try {
      data = D.migrateUserData(remotePayload);
      touchMeta();
      cloudPushPaused = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      cloudPushPaused = false;
      if (!data.sync) data.sync = {};
      data.sync.lastSyncAt = new Date().toISOString();
      data.sync.lastSyncStatus = "ok";
      data.sync.lastSyncMessage = "クラウドから取得";
      if (!silent) toast("クラウドからデータを同期しました");
      renderAll();
      return true;
    } finally {
      CloudSync.setApplyingRemote(false);
    }
  }

  async function syncPullNow(showToast = true) {
    if (!data.sync?.syncId) {
      if (showToast) toast("同期IDを入力してください");
      return;
    }
    if (!CloudSync.isConfigured()) {
      if (showToast) toast("Firebaseが未設定です。firebase-config.js を設定してください");
      return;
    }
    data.sync.lastSyncStatus = "syncing";
    renderSyncSettings();
    try {
      await CloudSync.init();
      const remote = await CloudSync.pull(data.sync.syncId);
      const payload = JSON.parse(JSON.stringify(data));
      if (!remote) {
        await CloudSync.push(data.sync.syncId, payload);
        data.sync.lastSyncMessage = "クラウドに初回アップロード";
        if (showToast) toast("クラウドにデータをアップロードしました");
      } else {
        const merged = await applyRemoteCloud(remote, true);
        if (!merged) {
          await CloudSync.push(data.sync.syncId, payload);
          data.sync.lastSyncMessage = "ローカルが最新";
          if (showToast) toast("ローカルが最新です");
        } else if (showToast) {
          toast("クラウドから同期しました");
        }
      }
      data.sync.lastSyncAt = new Date().toISOString();
      data.sync.lastSyncStatus = "ok";
      CloudSync.startWatch(data.sync.syncId);
      cloudPushPaused = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      cloudPushPaused = false;
    } catch (e) {
      data.sync.lastSyncStatus = "error";
      data.sync.lastSyncMessage = e.message || "同期エラー";
      if (showToast) toast("同期に失敗しました");
    }
    renderSyncSettings();
  }

  function renderSyncSettings() {
    const statusEl = $("#syncStatusText");
    if (!statusEl || !data.sync) return;
    if (!CloudSync.isConfigured()) {
      statusEl.textContent = "Firebase未設定 — firebase-config.js の enabled を true にし、キーを入力してください";
      statusEl.className = "sync-status sync-warn";
    } else {
      const labels = { idle: "待機中", pending: "送信待ち", syncing: "同期中", ok: "同期済み", error: "エラー" };
      let text = labels[data.sync.lastSyncStatus] || data.sync.lastSyncStatus;
      if (data.sync.lastSyncMessage) text += " — " + data.sync.lastSyncMessage;
      if (data.sync.lastSyncAt) text += "（" + data.sync.lastSyncAt.slice(0, 16).replace("T", " ") + "）";
      statusEl.textContent = text;
      statusEl.className =
        "sync-status " +
        (data.sync.lastSyncStatus === "error" ? "sync-error" : data.sync.lastSyncStatus === "ok" ? "sync-ok" : "");
    }
    const idInput = $("#syncIdInput");
    if (idInput && document.activeElement !== idInput) idInput.value = data.sync.syncId || "";
    const en = $("#syncEnabled");
    if (en) en.checked = !!data.sync.enabled;
  }

  function saveSyncSettings() {
    if (!window.CloudSync) return;
    const enabled = !!$("#syncEnabled")?.checked;
    let syncId = ($("#syncIdInput")?.value || "").trim();
    if (enabled && !syncId) syncId = CloudSync.generateSyncId();
    const wasEnabled = data.sync.enabled;
    const oldId = data.sync.syncId;
    data.sync.enabled = enabled;
    data.sync.syncId = syncId;
    if ($("#syncIdInput")) $("#syncIdInput").value = syncId;
    saveData(false);
    if (enabled && CloudSync.isConfigured()) {
      if (!wasEnabled || oldId !== syncId) {
        syncPullNow(false);
      } else {
        CloudSync.startWatch(syncId);
      }
    } else if (!enabled) {
      CloudSync.stopWatch?.();
    }
    renderSyncSettings();
    toast(enabled ? "クラウド同期を有効にしました" : "クラウド同期をオフにしました");
  }

  function copySyncId() {
    const id = data.sync?.syncId || $("#syncIdInput")?.value;
    if (!id) return toast("同期IDがありません");
    navigator.clipboard?.writeText(id).then(
      () => toast("同期IDをコピーしました"),
      () => toast("コピーに失敗しました")
    );
  }

  async function bootstrapCloud() {
    CloudSync.setMergeHandler((ev) => {
      if (ev.type === "remote") applyRemoteCloud(ev.data, false);
    });
    if (!CloudSync.isConfigured() || !data.sync?.enabled || !data.sync.syncId) return;
    await CloudSync.init();
    await syncPullNow(false);
  }

  /* ── 可逆性: ゴミ箱・アーカイブ・マージ ── */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function resolvePhase(phase) {
    const ov = data.phaseOverrides[phase.id] || {};
    return {
      ...phase,
      title: ov.title != null ? ov.title : phase.title,
      period: ov.period != null ? ov.period : phase.period,
      theme: ov.theme != null ? ov.theme : phase.theme,
      revenueLabel: ov.revenueLabel != null ? ov.revenueLabel : phase.revenueLabel,
      revenueMin: ov.revenueMin != null ? ov.revenueMin : phase.revenueMin,
      revenueMax: ov.revenueMax != null ? ov.revenueMax : phase.revenueMax,
      start: ov.start != null ? ov.start : phase.start,
      end: ov.end != null ? ov.end : phase.end,
      hidden: !!ov.hidden,
    };
  }

  function getResolvedPhases() {
    return D.PHASES.map(resolvePhase).filter((p) => !p.hidden);
  }

  function getActivePhaseKey() {
    const ym = currentMonthStr();
    const phases = getResolvedPhases();
    for (const p of phases) {
      if (ym >= p.start && ym <= p.end) return p.id;
    }
    if (phases.length && ym < phases[0].start) return phases[0].id;
    return phases[phases.length - 1]?.id || D.PHASES[0].id;
  }

  function getRoadmapIntro() {
    const defaults = {
      title: "5期間ロードマップ",
      description:
        "2026年5月から2028年3月まで、0→1・単価UP・ストック収益・外注化・月商60万を段階的に達成します。",
    };
    return { ...defaults, ...(data.roadmapIntro || {}) };
  }

  function resolveMonth(monthKey) {
    const plan = D.getMonthPlan(monthKey);
    if (!plan) return null;
    const ov = data.monthOverrides[monthKey] || {};
    const phase = resolvePhase(plan.phase);
    return {
      phase,
      month: {
        ...plan.month,
        label: ov.label != null ? ov.label : plan.month.label,
        title: ov.title != null ? ov.title : plan.month.title,
        actions: ov.actions != null ? ov.actions : plan.month.actions,
        outcomes: ov.outcomes != null ? ov.outcomes : plan.month.outcomes,
        hidden: !!ov.hidden,
      },
    };
  }

  function resolvePhaseMilestones(phase) {
    const defaults = phase.milestones
      .filter((m) => !data.milestoneOverrides[m.id]?.hidden)
      .map((m) => ({
        id: m.id,
        text: data.milestoneOverrides[m.id]?.text ?? m.text,
        isCustom: false,
        done: !!data.milestones[m.id]?.done,
        doneAt: data.milestones[m.id]?.doneAt ?? null,
      }));
    const custom = data.customMilestones
      .filter((m) => m.phaseId === phase.id)
      .map((m) => ({
        id: m.id,
        text: m.text,
        isCustom: true,
        done: !!m.done,
        doneAt: m.doneAt ?? null,
      }));
    return [...defaults, ...custom];
  }

  function isMonthTaskDone(monthKey, idx) {
    return !!data.monthTaskChecks[monthKey]?.[String(idx)];
  }

  function setMonthTaskDone(monthKey, idx, done) {
    if (!data.monthTaskChecks[monthKey]) data.monthTaskChecks[monthKey] = {};
    if (done) data.monthTaskChecks[monthKey][String(idx)] = true;
    else delete data.monthTaskChecks[monthKey][String(idx)];
  }

  function toggleMonthTask(monthKey, idx, done) {
    const wasDone = isMonthTaskDone(monthKey, idx);
    setMonthTaskDone(monthKey, idx, done);
    saveData(false);
    toast(done ? "タスクを完了にしました" : "タスクを未完了に戻しました", () => {
      setMonthTaskDone(monthKey, idx, wasDone);
      saveData();
    });
    renderHome();
    renderRoadmap();
  }

  function renderMonthTaskList(monthKey, actions) {
    return actions
      .map((a, i) => {
        const done = isMonthTaskDone(monthKey, i);
        return `
      <li class="check-row">
        <label class="month-task-row">
          <input type="checkbox" class="month-task-check" data-month="${monthKey}" data-idx="${i}" ${done ? "checked" : ""} />
          <span class="month-task-text ${done ? "done" : ""}">${escapeHtml(a)}</span>
        </label>
      </li>`;
      })
      .join("");
  }

  function bindMonthTaskChecks(root) {
    (root || document).querySelectorAll(".month-task-check").forEach((cb) => {
      cb.addEventListener("change", () => {
        toggleMonthTask(cb.dataset.month, parseInt(cb.dataset.idx, 10), cb.checked);
      });
    });
  }

  function getActiveTasks() {
    return [
      ...data.tasks.filter((t) => !data.deletedDefaultTaskIds.includes(t.id)),
      ...data.customTasks,
    ];
  }

  function findTask(id) {
    return data.tasks.find((t) => t.id === id) || data.customTasks.find((t) => t.id === id);
  }

  function isDefaultTask(id) {
    return data.tasks.some((t) => t.id === id);
  }

  function getDmTemplatesList() {
    const defaults = D.DM_TEMPLATES.filter((t) => !data.hiddenDmTemplateIds.includes(t.id)).map((t) => ({
      ...t,
      isCustom: false,
    }));
    const custom = data.customDmTemplates.map((t) => ({ ...t, isCustom: true }));
    return [...defaults, ...custom];
  }

  function addToTrash(entityType, item, label) {
    data.trash.unshift({
      trashId: uid(),
      entityType,
      item: deepClone(item),
      deletedAt: new Date().toISOString(),
      label: label || ENTITY_LABELS[entityType] || "項目",
    });
  }

  function restoreFromTrash(trashId, silent = false) {
    const idx = data.trash.findIndex((t) => t.trashId === trashId);
    if (idx < 0) return false;
    const entry = data.trash[idx];
    const item = entry.item;

    switch (entry.entityType) {
      case "client": {
        const exists = data.clients.some((c) => c.id === item.id);
        if (!exists) data.clients.unshift(item);
        break;
      }
      case "customTask":
        if (!data.customTasks.some((t) => t.id === item.id)) data.customTasks.push(item);
        break;
      case "defaultTask":
        data.deletedDefaultTaskIds = data.deletedDefaultTaskIds.filter((id) => id !== item.id);
        break;
      case "note":
        if (!data.notes.some((n) => n.id === item.id)) data.notes.unshift(item);
        break;
      case "salesLog":
        if (!data.salesLogs.some((l) => l.id === item.id)) data.salesLogs.unshift(item);
        break;
      case "monthlyRecord": {
        const i = data.monthlyRecords.findIndex((r) => r.month === item.month);
        if (i >= 0) data.monthlyRecords[i] = item;
        else data.monthlyRecords.push(item);
        break;
      }
      case "customMilestone":
        if (!data.customMilestones.some((m) => m.id === item.id)) data.customMilestones.push(item);
        break;
      case "customDmTemplate":
        if (!data.customDmTemplates.some((t) => t.id === item.id)) data.customDmTemplates.push(item);
        break;
      case "monthOverride":
        data.monthOverrides[item.monthKey] = item.override;
        break;
      case "monthTarget": {
        const { monthKey, value } = item;
        if (value == null) delete data.monthTargetOverrides[monthKey];
        else data.monthTargetOverrides[monthKey] = value;
        break;
      }
      case "phaseOverride":
        data.phaseOverrides[item.phaseId] = item.override;
        break;
      case "roadmapIntro":
        data.roadmapIntro = item.intro;
        break;
      default:
        return false;
    }

    data.trash.splice(idx, 1);
    saveData();
    if (!silent) toast("復元しました");
    return true;
  }

  function purgeTrash(trashId) {
    data.trash = data.trash.filter((t) => t.trashId !== trashId);
    saveData();
    toast("完全に削除しました");
  }

  function emptyTrash() {
    if (!data.trash.length) return toast("ゴミ箱は空です");
    if (!confirm(`${data.trash.length}件を完全に削除しますか？復元できなくなります。`)) return;
    data.trash = [];
    saveData();
    toast("ゴミ箱を空にしました");
  }

  function softDelete(entityType, item, label, removeFn) {
    addToTrash(entityType, item, label);
    const entryTrashId = data.trash[0].trashId;
    removeFn();
    saveData(false);
    toast(`「${label}」を削除しました`, () => restoreFromTrash(entryTrashId, true));
    renderAll();
  }

  function createArchive(label) {
    const snapshot = deepClone(data);
    snapshot.trash = [];
    snapshot.archives = [];
    data.archives.unshift({
      id: uid(),
      label: label || "手動バックアップ",
      createdAt: new Date().toISOString(),
      snapshot,
    });
    data.archives = data.archives.slice(0, 5);
  }

  function restoreArchive(archiveId) {
    const arch = data.archives.find((a) => a.id === archiveId);
    if (!arch) return;
    if (!confirm("現在のデータはアーカイブに退避されます。復元しますか？")) return;
    createArchive("復元前の自動バックアップ");
    data = D.migrateUserData(arch.snapshot);
    saveData();
    toast("アーカイブから復元しました");
  }

  function actionButtons() {
    return `<div class="item-actions">
      <button type="button" class="icon-action" data-act="edit" title="編集">✎</button>
      <button type="button" class="icon-action danger" data-act="delete" title="削除">🗑</button>
    </div>`;
  }

  function bindItemActions(container, onEdit, onDelete) {
    container.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest("[data-id], [data-month], [data-ms]");
        const id = row?.dataset.id || row?.dataset.month || row?.dataset.ms;
        if (btn.dataset.act === "edit") onEdit(id, row);
        else onDelete(id, row);
      });
    });
  }

  /* ── DM helpers ── */
  function getDmLogsForDate(dateStr) {
    return data.salesLogs.filter((l) => l.date === dateStr && l.type === "dm");
  }

  function getDmCountForDate(dateStr) {
    return getDmLogsForDate(dateStr).reduce((s, l) => s + (l.count || 1), 0);
  }

  function getWeekDmCount() {
    const d = new Date();
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      const ds = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      total += getDmCountForDate(ds);
    }
    return total;
  }

  function addDm(count = 1) {
    const existing = getDmLogsForDate(todayStr())[0];
    if (existing) {
      const prev = existing.count || 1;
      existing.count = prev + count;
      saveData(false);
      toast(`DM +${count} を記録しました`, () => {
        existing.count = prev;
        if (existing.count <= 0) data.salesLogs = data.salesLogs.filter((x) => x.id !== existing.id);
        saveData();
      });
    } else {
      const entry = {
        id: uid(),
        type: "dm",
        date: todayStr(),
        count,
        channel: "X",
        notes: "",
        createdAt: new Date().toISOString(),
      };
      data.salesLogs.unshift(entry);
      saveData(false);
      toast(`DM +${count} を記録しました`, () => {
        data.salesLogs = data.salesLogs.filter((x) => x.id !== entry.id);
        saveData();
      });
    }
    renderSales();
    renderHome();
  }

  /* ── Monthly records ── */
  function getRecord(month) {
    return data.monthlyRecords.find((r) => r.month === month);
  }

  function getCurrentMonthRevenue() {
    const r = getRecord(currentMonthStr());
    if (!r) return 0;
    return parseNum(r.revenue) + parseNum(r.recurring);
  }

  function getMonthTarget(month = currentMonthStr()) {
    if (data.monthTargetOverrides[month] != null) return data.monthTargetOverrides[month];
    const plan = resolveMonth(month) || D.getMonthPlan(month);
    if (plan?.month?.kpis?.monthlyTarget) return plan.month.kpis.monthlyTarget;
    if (plan?.phase) return (plan.phase.revenueMin + plan.phase.revenueMax) / 2;
    return data.settings.ultimateMonthly;
  }

  function getRecurringTotal() {
    return data.clients
      .filter((c) => c.status === "recurring" || c.recurringFee > 0)
      .reduce((s, c) => s + parseNum(c.recurringFee), 0);
  }

  function getRecurringCount() {
    return data.clients.filter((c) => c.recurringFee > 0 && c.status !== "closed").length;
  }

  /* ── Animation ── */
  const _numCache = new WeakMap();
  function animateNumber(el, to, opts = {}) {
    if (!el) return;
    const { duration = 650, suffix = "", prefix = "" } = opts;
    const target = Number(to);
    if (isNaN(target)) {
      el.textContent = prefix + (to ?? "") + suffix;
      return;
    }
    const from = _numCache.get(el) ?? 0;
    _numCache.set(el, target);
    if (prefersReducedMotion()) {
      el.textContent = prefix + Math.round(target) + suffix;
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + Math.round(from + (target - from) * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function setRing(el, pct) {
    if (!el) return;
    const off = CIRC * (1 - Math.min(100, Math.max(0, pct)) / 100);
    el.style.strokeDashoffset = String(off);
  }

  /* ── Toast & Modal ── */
  let toastTimer = null;
  function toast(msg, undoFn) {
    const t = $("#toast");
    const msgEl = $("#toastMsg");
    const undoBtn = $("#toastUndoBtn");
    if (msgEl) msgEl.textContent = msg;
    else t.textContent = msg;

    undoCallback = undoFn || null;
    if (undoBtn) {
      undoBtn.hidden = !undoFn;
      undoBtn.onclick = undoFn
        ? () => {
            undoCallback?.();
            undoCallback = null;
            undoBtn.hidden = true;
            t.classList.remove("show");
          }
        : null;
    }

    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
      undoCallback = null;
      if (undoBtn) undoBtn.hidden = true;
    }, undoFn ? 8000 : 2400);
  }

  function openModal(title, bodyHtml, footHtml) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modalFoot").innerHTML = footHtml || "";
    $("#modalBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#modalBackdrop").hidden = true;
    document.body.style.overflow = "";
  }

  /* ── Navigation ── */
  function switchView(view) {
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
    $$(".nav-btn").forEach((b) => {
      const on = b.dataset.nav === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "page" : null);
    });
    const meta = PAGE_META[view] || PAGE_META.home;
    $("#page-title").textContent = meta.title;
    $("#page-subtitle").textContent = meta.sub;
    updateNavIndicator(view);
    if (view === "kpi") renderChart();
    if (view === "settings") compareWithServerVersion(false);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function updateNavIndicator(view) {
    const nav = $("#bottomNav");
    const btn = nav.querySelector(`[data-nav="${view}"]`);
    const ind = $("#navIndicator");
    if (!btn || !ind) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    ind.style.left = `${btnRect.left - navRect.left + (btnRect.width - 40) / 2}px`;
  }

  /* ── Render: Home ── */
  function renderHome() {
    const phaseId = getActivePhaseKey();
    const basePhase = D.PHASES.find((p) => p.id === phaseId);
    const phase = basePhase ? resolvePhase(basePhase) : null;
    const month = currentMonthStr();
    const plan = resolveMonth(month);
    const revenue = getCurrentMonthRevenue();
    const ultimate = parseNum(data.settings.ultimateMonthly);
    const pct = ultimate ? Math.min(100, (revenue / ultimate) * 100) : 0;
    const target = getMonthTarget(month);

    $("#heroPhaseLabel").textContent = phase ? `第${phase.number}期` : "ロードマップ";
    animateNumber($("#heroRevenuePct"), pct, { suffix: "%" });
    $("#heroRevenueSub").textContent = `最終目標 ${formatYen(ultimate, true)} への進捗`;
    $("#heroRingLabel").textContent = `${Math.round(pct)}%`;
    setRing($("#heroRing"), pct);

    const chips = $("#heroChips");
    chips.innerHTML = "";
    if (phase) {
      ["revenueLabel", "theme"].forEach((k) => {
        const span = document.createElement("span");
        span.className = "chip-tag";
        span.textContent = phase[k];
        chips.appendChild(span);
      });
    }

    $("#statMonthRevenue").textContent = formatYen(revenue, true);
    $("#statMonthTarget").textContent = `目標 ${formatYen(target, true)}`;
    $("#statRecurring").textContent = formatYen(getRecurringTotal(), true);
    $("#statRecurringCount").textContent = `${getRecurringCount()}社`;
    const weekDm = getWeekDmCount();
    const weekGoal = parseNum(data.settings.dmWeeklyGoal);
    $("#statWeekDm").textContent = String(weekDm);
    $("#statWeekDmGoal").textContent = `/ ${weekGoal}件`;

    if (plan) {
      $("#currentMonthBadge").textContent = plan.month.label;
      $("#focusTitle").textContent = plan.month.title;
      const ul = $("#focusActions");
      ul.className = "focus-list check-list";
      ul.innerHTML = renderMonthTaskList(month, plan.month.actions);
      bindMonthTaskChecks(ul);
    }

    renderPhaseStrip(phaseId);
    renderMilestonePreview();
  }

  function renderPhaseStrip(activeId) {
    const strip = $("#phaseStrip");
    const now = currentMonthStr();
    strip.innerHTML = getResolvedPhases()
      .map((p) => {
        const done = now > p.end;
        const active = p.id === activeId;
        return `<div class="phase-dot ${active ? "active" : ""} ${done ? "done" : ""}" title="第${p.number}期"></div>`;
      })
      .join("");
  }

  function renderMilestonePreview() {
    const phaseId = getActivePhaseKey();
    const basePhase = D.PHASES.find((p) => p.id === phaseId);
    const phase = basePhase ? resolvePhase(basePhase) : null;
    if (!phase) return;
    const ms = resolvePhaseMilestones(phase);
    const done = ms.filter((m) => m.done).length;
    $("#milestoneProgress").textContent = `${done}/${ms.length}`;
    const el = $("#milestonePreview");
    el.innerHTML = ms
      .slice(0, 4)
      .map(
        (m) => `
      <div class="ms-item" data-ms="${m.id}" data-custom="${m.isCustom}">
        <button type="button" class="ms-check ${m.done ? "done" : ""}" data-ms-toggle="${m.id}" data-custom="${m.isCustom}" aria-label="達成切替">
          ${m.done ? "✓" : ""}
        </button>
        <span class="ms-item-text">${escapeHtml(m.text)}</span>
        <button type="button" class="icon-action" data-ms-edit="${m.id}" data-custom="${m.isCustom}" title="編集">✎</button>
      </div>`
      )
      .join("");
    el.querySelectorAll("[data-ms-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggleMilestone(btn.dataset.msToggle, btn.dataset.custom === "true"));
    });
    el.querySelectorAll("[data-ms-edit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMilestoneModal(btn.dataset.msEdit, btn.dataset.custom === "true", phaseId);
      });
    });
  }

  function toggleMilestone(id, isCustom) {
    let target;
    if (isCustom) {
      target = data.customMilestones.find((x) => x.id === id);
    } else {
      target = data.milestones[id];
    }
    if (!target) return;
    const wasDone = !!target.done;
    target.done = !wasDone;
    target.doneAt = target.done ? new Date().toISOString() : null;
    saveData(false);
    toast(target.done ? "マイルストーンを達成にしました" : "マイルストーンを未達に戻しました", () => {
      target.done = wasDone;
      target.doneAt = wasDone ? target.doneAt : null;
      saveData();
    });
    renderHome();
    renderRoadmap();
  }

  /* ── Render: Roadmap ── */
  function renderRoadmap() {
    const intro = getRoadmapIntro();
    const titleEl = $("#roadmapIntroTitle");
    const descEl = $("#roadmapIntroDesc");
    if (titleEl) titleEl.textContent = intro.title;
    if (descEl) descEl.textContent = intro.description;

    const bar = $("#timelineBar");
    const now = currentMonthStr();
    const phases = getResolvedPhases();
    bar.innerHTML = phases
      .map((p) => {
        const past = now >= p.end;
        const cur = now >= p.start && now <= p.end;
        return `<div class="timeline-seg ${past || cur ? "past" : "future"}" style="background:${p.color}" title="${escapeHtml(p.title)}"></div>`;
      })
      .join("");

    const container = $("#roadmapPhases");
    container.innerHTML = phases
      .map((p) => {
        const basePhase = D.PHASES.find((x) => x.id === p.id);
        const monthsHtml = (basePhase?.months || [])
          .map((m) => {
            const resolved = resolveMonth(m.key);
            if (resolved?.month?.hidden) return "";
            const month = resolved?.month || m;
            return `
        <div class="month-block" data-month-key="${m.key}">
          <div class="month-block-head">
            <h5><span>${escapeHtml(month.label)}</span>${escapeHtml(month.title)}</h5>
            <button type="button" class="icon-action" data-edit-month="${m.key}" title="月次計画を編集">✎</button>
          </div>
          <p class="muted small">タスク</p>
          <ul class="action-list check-list">${renderMonthTaskList(m.key, month.actions)}</ul>
          <p class="muted small">達成</p>
          <ul class="outcome-list">${month.outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        </div>`;
          })
          .join("");
        const msList = resolvePhaseMilestones(basePhase);
        const msHtml = msList
          .map(
            (m) => `
        <div class="ms-row" data-ms="${m.id}" data-custom="${m.isCustom}">
          <label style="flex:1;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" data-ms-check="${m.id}" data-custom="${m.isCustom}" ${m.done ? "checked" : ""} />
            ${escapeHtml(m.text)}
          </label>
          <button type="button" class="icon-action" data-ms-edit="${m.id}" data-custom="${m.isCustom}" data-phase="${p.id}" title="編集">✎</button>
          ${m.isCustom ? `<button type="button" class="icon-action danger" data-ms-del="${m.id}" title="削除">🗑</button>` : ""}
        </div>`
          )
          .join("");
        return `
      <article class="phase-block" data-phase="${p.id}">
        <div class="phase-header" role="button" tabindex="0">
          <div class="phase-num" style="background:${p.color}">${p.number}</div>
          <div class="phase-meta">
            <h4>第${p.number}期：${escapeHtml(p.title)}</h4>
            <p>${escapeHtml(p.period)} · ${escapeHtml(p.theme)}</p>
            <p class="phase-revenue">${escapeHtml(p.revenueLabel)}</p>
          </div>
          <button type="button" class="icon-action" data-edit-phase="${p.id}" title="期間を編集">✎</button>
          <svg class="phase-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="phase-body">
          ${monthsHtml}
          <div class="month-block ms-roadmap">
            <div class="month-block-head">
              <p class="muted small" style="margin:0">マイルストーン</p>
              <button type="button" class="btn btn-ghost btn-sm" data-add-ms="${p.id}">+ 追加</button>
            </div>
            ${msHtml}
          </div>
        </div>
      </article>`;
      })
      .join("");

    container.querySelectorAll(".phase-header").forEach((h) => {
      const toggle = () => h.closest(".phase-block").classList.toggle("open");
      h.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit-phase]")) return;
        toggle();
      });
      h.addEventListener("keydown", (e) => {
        if (e.target.closest("[data-edit-phase]")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });

    const curPhase = getActivePhaseKey();
    const openBlock = container.querySelector(`[data-phase="${curPhase}"]`);
    if (openBlock) openBlock.classList.add("open");

    container.querySelectorAll("[data-ms-check]").forEach((cb) => {
      cb.addEventListener("change", () => {
        toggleMilestone(cb.dataset.msCheck, cb.dataset.custom === "true");
      });
    });
    container.querySelectorAll("[data-ms-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openMilestoneModal(btn.dataset.msEdit, btn.dataset.custom === "true", btn.dataset.phase);
      });
    });
    container.querySelectorAll("[data-ms-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = data.customMilestones.find((x) => x.id === btn.dataset.msDel);
        if (!m) return;
        softDelete("customMilestone", m, m.text, () => {
          data.customMilestones = data.customMilestones.filter((x) => x.id !== m.id);
        });
      });
    });
    container.querySelectorAll("[data-add-ms]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMilestoneModal(null, true, btn.dataset.addMs);
      });
    });
    container.querySelectorAll("[data-edit-month]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMonthPlanModal(btn.dataset.editMonth);
      });
    });
    container.querySelectorAll("[data-edit-phase]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPhaseModal(btn.dataset.editPhase);
      });
    });
    bindMonthTaskChecks(container);
  }

  function openRoadmapIntroModal() {
    const intro = getRoadmapIntro();
    const hasCustom = !!data.roadmapIntro;
    openModal(
      "ロードマップ概要を編集",
      `
      <label class="field"><span>タイトル</span><input type="text" id="riTitle" class="input" value="${escapeHtml(intro.title)}" /></label>
      <label class="field"><span>説明文</span><textarea id="riDesc" class="input" rows="4">${escapeHtml(intro.description)}</textarea></label>
    `,
      `<button type="button" class="btn btn-ghost btn-sm" id="modalReset" ${hasCustom ? "" : "hidden"}>初期値に戻す</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalReset")?.addEventListener("click", () => {
      const prev = data.roadmapIntro ? deepClone(data.roadmapIntro) : null;
      data.roadmapIntro = null;
      closeModal();
      saveData();
      toast("概要を初期値に戻しました", () => {
        data.roadmapIntro = prev;
        saveData();
      });
    });
    $("#modalSave").onclick = () => {
      const title = $("#riTitle").value.trim();
      const description = $("#riDesc").value.trim();
      if (!title || !description) return toast("タイトルと説明を入力してください");
      data.roadmapIntro = { title, description };
      closeModal();
      saveData();
      toast("ロードマップ概要を保存しました");
    };
  }

  function openPhaseModal(phaseId) {
    const base = D.PHASES.find((p) => p.id === phaseId);
    if (!base) return;
    const p = resolvePhase(base);
    const ov = data.phaseOverrides[phaseId] || {};
    const hasOverride = Object.keys(ov).length > 0;
    openModal(
      `第${p.number}期を編集`,
      `
      <label class="field"><span>期間タイトル</span><input type="text" id="phTitle" class="input" value="${escapeHtml(p.title)}" /></label>
      <label class="field"><span>期間表記（例：2026年5月〜7月）</span><input type="text" id="phPeriod" class="input" value="${escapeHtml(p.period)}" /></label>
      <label class="field"><span>テーマ</span><input type="text" id="phTheme" class="input" value="${escapeHtml(p.theme)}" /></label>
      <label class="field"><span>月商目標ラベル</span><input type="text" id="phRevenueLabel" class="input" value="${escapeHtml(p.revenueLabel)}" /></label>
      <div class="btn-row">
        <label class="field" style="flex:1"><span>開始月</span><input type="month" id="phStart" class="input" value="${p.start}" /></label>
        <label class="field" style="flex:1"><span>終了月</span><input type="month" id="phEnd" class="input" value="${p.end}" /></label>
      </div>
      <div class="btn-row">
        <label class="field" style="flex:1"><span>月商下限（円）</span><input type="number" id="phRevMin" class="input" min="0" value="${p.revenueMin}" /></label>
        <label class="field" style="flex:1"><span>月商上限（円）</span><input type="number" id="phRevMax" class="input" min="0" value="${p.revenueMax}" /></label>
      </div>
      <label class="field">
        <span style="display:flex;align-items:center;gap:8px;font-size:0.88rem;">
          <input type="checkbox" id="phHidden" ${p.hidden ? "checked" : ""} />
          この期間をロードマップから非表示にする
        </span>
      </label>
    `,
      `<button type="button" class="btn btn-ghost btn-sm" id="modalReset" ${hasOverride ? "" : "hidden"}>初期値に戻す</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalReset")?.addEventListener("click", () => {
      const prev = data.phaseOverrides[phaseId] ? deepClone(data.phaseOverrides[phaseId]) : null;
      delete data.phaseOverrides[phaseId];
      closeModal();
      saveData();
      toast("第" + p.number + "期を初期値に戻しました", () => {
        if (prev) data.phaseOverrides[phaseId] = prev;
        else delete data.phaseOverrides[phaseId];
        saveData();
      });
    });
    $("#modalSave").onclick = () => {
      const title = $("#phTitle").value.trim();
      if (!title) return toast("タイトルを入力してください");
      data.phaseOverrides[phaseId] = {
        title,
        period: $("#phPeriod").value.trim(),
        theme: $("#phTheme").value.trim(),
        revenueLabel: $("#phRevenueLabel").value.trim(),
        start: $("#phStart").value,
        end: $("#phEnd").value,
        revenueMin: parseNum($("#phRevMin").value),
        revenueMax: parseNum($("#phRevMax").value),
        hidden: $("#phHidden").checked,
      };
      closeModal();
      saveData();
      toast("期間計画を保存しました");
    };
  }

  /* ── Render: KPI ── */
  function renderRecords() {
    const list = $("#recordsList");
    const sorted = [...data.monthlyRecords].sort((a, b) => b.month.localeCompare(a.month));
    if (!sorted.length) {
      list.innerHTML = '<p class="empty-state">月次記録がありません。「+ 記録」から追加してください。</p>';
      return;
    }
    list.innerHTML = sorted
      .map((r) => {
        const total = parseNum(r.revenue) + parseNum(r.recurring);
        return `
      <div class="record-item" data-month="${r.month}">
        <div class="record-item-main">
          <span class="record-month">${r.month}</span>
          <span class="record-val">${formatYen(total, true)}</span>
        </div>
        ${actionButtons()}
      </div>`;
      })
      .join("");
    list.querySelectorAll(".record-item-main").forEach((el) => {
      el.addEventListener("click", () => openRecordModal(el.closest(".record-item").dataset.month));
    });
    bindItemActions(
      list,
      (month) => openRecordModal(month),
      (month) => {
        const r = getRecord(month);
        if (!r) return;
        softDelete("monthlyRecord", r, `${month}の記録`, () => {
          data.monthlyRecords = data.monthlyRecords.filter((x) => x.month !== month);
        });
      }
    );
  }

  function renderChart() {
    if (typeof Chart === "undefined") return;
    const sorted = [...data.monthlyRecords].sort((a, b) => a.month.localeCompare(b.month));
    const slice = sorted.slice(-chartRange);
    const labels = slice.map((r) => r.month.slice(5));
    const values = slice.map((r) => parseNum(r.revenue) + parseNum(r.recurring));
    const targets = slice.map((r) => getMonthTarget(r.month));

    const ctx = $("#revenueChart");
    if (!ctx) return;
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "実績",
            data: values,
            backgroundColor: "rgba(37, 99, 235, 0.75)",
            borderRadius: 6,
          },
          {
            label: "目標",
            data: targets,
            type: "line",
            borderColor: "#94a3b8",
            borderDash: [4, 4],
            pointRadius: 3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => (v >= 10000 ? `${v / 10000}万` : v),
            },
          },
        },
      },
    });
  }

  function openRecordModal(month) {
    const existing = month ? getRecord(month) : null;
    const m = month || currentMonthStr();
    openModal(
      existing ? "月次記録を編集" : "月次記録を追加",
      `
      <label class="field"><span>対象月</span><input type="month" id="mMonth" class="input" value="${m}" ${existing ? "" : ""} /></label>
      <label class="field"><span>新規売上（円）</span><input type="number" id="mRevenue" class="input" min="0" value="${existing?.revenue ?? ""}" /></label>
      <label class="field"><span>継続売上（円）</span><input type="number" id="mRecurring" class="input" min="0" value="${existing?.recurring ?? ""}" /></label>
      <label class="field"><span>手取り（円・任意）</span><input type="number" id="mTakeHome" class="input" min="0" value="${existing?.takeHome ?? ""}" /></label>
      <label class="field"><span>メモ</span><textarea id="mNotes" class="input">${escapeHtml(existing?.notes ?? "")}</textarea></label>
    `,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${existing ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (existing) {
      $("#modalDelete").onclick = () => {
        const rec = getRecord(m);
        closeModal();
        softDelete("monthlyRecord", rec, `${m}の記録`, () => {
          data.monthlyRecords = data.monthlyRecords.filter((x) => x.month !== m);
        });
      };
    }
    $("#modalSave").onclick = () => {
      const monthKey = $("#mMonth").value;
      if (!monthKey) return toast("月を選択してください");
      const payload = {
        month: monthKey,
        revenue: parseNum($("#mRevenue").value),
        recurring: parseNum($("#mRecurring").value),
        takeHome: parseNum($("#mTakeHome").value),
        notes: $("#mNotes").value.trim(),
        updatedAt: new Date().toISOString(),
      };
      const idx = data.monthlyRecords.findIndex((r) => r.month === monthKey);
      const oldMonth = existing?.month;
      if (idx >= 0) data.monthlyRecords[idx] = { ...data.monthlyRecords[idx], ...payload };
      else data.monthlyRecords.push(payload);
      if (oldMonth && oldMonth !== monthKey) {
        data.monthlyRecords = data.monthlyRecords.filter((r) => r.month !== oldMonth || r.month === monthKey);
      }
      closeModal();
      saveData();
      toast("月次記録を保存しました");
    };
  }

  function openMonthPlanModal(monthKey) {
    const resolved = resolveMonth(monthKey);
    if (!resolved) return;
    const base = D.getMonthPlan(monthKey)?.month;
    const hasOverride =
      !!data.monthOverrides[monthKey] || data.monthTargetOverrides[monthKey] != null;
    openModal(
      `${resolved.month.label}の計画を編集`,
      `
      <label class="field"><span>月ラベル（例：5月）</span><input type="text" id="mpLabel" class="input" value="${escapeHtml(resolved.month.label)}" /></label>
      <label class="field"><span>タイトル</span><input type="text" id="mpTitle" class="input" value="${escapeHtml(resolved.month.title)}" /></label>
      <label class="field"><span>タスク（1行1項目）</span><textarea id="mpActions" class="input" rows="4">${escapeHtml(resolved.month.actions.join("\n"))}</textarea></label>
      <label class="field"><span>達成（1行1項目）</span><textarea id="mpOutcomes" class="input" rows="3">${escapeHtml(resolved.month.outcomes.join("\n"))}</textarea></label>
      <label class="field"><span>月商目標（円・空欄でデフォルト）</span><input type="number" id="mpTarget" class="input" min="0" step="1000" value="${data.monthTargetOverrides[monthKey] ?? ""}" placeholder="${base ? getMonthTarget(monthKey) : ""}" /></label>
      <label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;margin-top:8px;">
        <input type="checkbox" id="mpHidden" ${resolved.month.hidden ? "checked" : ""} />
        この月をロードマップから非表示にする
      </label>
      <p class="muted small">デフォルトの計画に戻す場合は「初期値に戻す」を押してください。</p>
    `,
      `<button type="button" class="btn btn-ghost btn-sm" id="modalReset" ${hasOverride || data.monthTargetOverrides[monthKey] != null ? "" : "hidden"}>初期値に戻す</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalReset")?.addEventListener("click", () => {
      const prevOv = data.monthOverrides[monthKey] ? deepClone(data.monthOverrides[monthKey]) : null;
      const prevTarget = data.monthTargetOverrides[monthKey] ?? null;
      delete data.monthOverrides[monthKey];
      delete data.monthTargetOverrides[monthKey];
      closeModal();
      saveData();
      toast("初期の計画に戻しました", () => {
        if (prevOv) data.monthOverrides[monthKey] = prevOv;
        else delete data.monthOverrides[monthKey];
        if (prevTarget != null) data.monthTargetOverrides[monthKey] = prevTarget;
        else delete data.monthTargetOverrides[monthKey];
        saveData();
      });
    });
    $("#modalSave").onclick = () => {
      const label = $("#mpLabel").value.trim();
      const title = $("#mpTitle").value.trim();
      const actions = $("#mpActions").value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const outcomes = $("#mpOutcomes").value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const targetRaw = $("#mpTarget").value;
      data.monthOverrides[monthKey] = {
        label,
        title,
        actions,
        outcomes,
        hidden: $("#mpHidden").checked,
      };
      if (targetRaw === "") delete data.monthTargetOverrides[monthKey];
      else data.monthTargetOverrides[monthKey] = parseNum(targetRaw);
      closeModal();
      saveData();
      toast("月次計画を保存しました");
    };
  }

  function openMonthTargetModal() {
    const month = currentMonthStr();
    openMonthPlanModal(month);
  }

  function openMilestoneModal(id, isCustom, phaseId) {
    let text = "";
    let isNew = !id;
    if (isCustom && id) {
      text = data.customMilestones.find((m) => m.id === id)?.text || "";
    } else if (id) {
      const phase = D.PHASES.find((p) => p.id === phaseId);
      const def = phase?.milestones.find((m) => m.id === id);
      text = data.milestoneOverrides[id]?.text ?? def?.text ?? "";
    }
    openModal(
      isNew ? "マイルストーンを追加" : "マイルストーンを編集",
      `<label class="field"><span>内容</span><input type="text" id="msText" class="input" value="${escapeHtml(text)}" /></label>`,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${isCustom && id ? "" : id && !isCustom ? "" : "hidden"}>${isCustom ? "削除" : "非表示"}</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    const delBtn = $("#modalDelete");
    if (delBtn && !delBtn.hidden) {
      delBtn.onclick = () => {
        closeModal();
        if (isCustom && id) {
          const m = data.customMilestones.find((x) => x.id === id);
          softDelete("customMilestone", m, m.text, () => {
            data.customMilestones = data.customMilestones.filter((x) => x.id !== id);
          });
        } else if (id) {
          const phase = D.PHASES.find((p) => p.id === phaseId);
          const def = phase?.milestones.find((m) => m.id === id);
          const label = data.milestoneOverrides[id]?.text ?? def?.text ?? id;
          data.milestoneOverrides[id] = { ...(data.milestoneOverrides[id] || {}), hidden: true };
          saveData();
          toast(`「${label}」を非表示にしました`, () => {
            if (data.milestoneOverrides[id]) {
              data.milestoneOverrides[id].hidden = false;
              saveData();
            }
          });
        }
      };
      if (!isCustom && id) delBtn.textContent = "非表示";
    }
    $("#modalSave").onclick = () => {
      const newText = $("#msText").value.trim();
      if (!newText) return toast("内容を入力してください");
      if (isNew) {
        data.customMilestones.push({
          id: uid(),
          phaseId,
          text: newText,
          done: false,
          doneAt: null,
          createdAt: new Date().toISOString(),
        });
      } else if (isCustom) {
        const m = data.customMilestones.find((x) => x.id === id);
        if (m) m.text = newText;
      } else {
        data.milestoneOverrides[id] = { ...(data.milestoneOverrides[id] || {}), text: newText };
      }
      closeModal();
      saveData();
      toast("マイルストーンを保存しました");
    };
  }

  function updateSim() {
    const rev = parseNum($("#simRevenue")?.value);
    const rateVal = parseNum($("#simRate")?.value);
    const rate = (rateVal || data.settings.defaultTakeHomeRate || 67) / 100;
    if ($("#simRateLabel")) $("#simRateLabel").textContent = `${Math.round(rate * 100)}%`;
    if ($("#simTakeHome")) $("#simTakeHome").textContent = formatYen(rev * rate);
  }

  /* ── Render: Sales ── */
  function renderSales() {
    const today = getDmCountForDate(todayStr());
    const dailyGoal = parseNum(data.settings.dmDailyGoal);
    const week = getWeekDmCount();
    const weekGoal = parseNum(data.settings.dmWeeklyGoal);
    $("#dmTodayCount").textContent = String(today);
    $("#dmTodayBadge").textContent = `今日 ${today}/${dailyGoal}`;
    $("#dmWeekText").textContent = `今週 ${week} / ${weekGoal} 件`;
    $("#dmWeekBar").style.width = `${Math.min(100, (week / weekGoal) * 100)}%`;

    $("#dmTemplates").innerHTML = getDmTemplatesList()
      .map(
        (t) => `
      <div class="tpl-item" data-id="${t.id}" data-custom="${t.isCustom}">
        <div class="tpl-head">
          <h4>${escapeHtml(t.name)}</h4>
          <div class="tpl-actions">
            <button type="button" class="icon-action" data-tpl-edit="${t.id}" data-custom="${t.isCustom}" title="編集">✎</button>
            <button type="button" class="icon-action danger" data-tpl-del="${t.id}" data-custom="${t.isCustom}" title="削除">🗑</button>
          </div>
        </div>
        <ol>${t.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      </div>`
      )
      .join("");

    $("#dmTemplates").querySelectorAll("[data-tpl-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openDmTemplateModal(btn.dataset.tplEdit, btn.dataset.custom === "true"));
    });
    $("#dmTemplates").querySelectorAll("[data-tpl-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tplDel;
        const isCustom = btn.dataset.custom === "true";
        if (isCustom) {
          const tpl = data.customDmTemplates.find((x) => x.id === id);
          if (!tpl) return;
          softDelete("customDmTemplate", tpl, tpl.name, () => {
            data.customDmTemplates = data.customDmTemplates.filter((x) => x.id !== id);
          });
        } else {
          const tpl = D.DM_TEMPLATES.find((x) => x.id === id);
          if (!tpl) return;
          data.hiddenDmTemplateIds.push(id);
          saveData();
          toast(`「${tpl.name}」を非表示にしました`, () => {
            data.hiddenDmTemplateIds = data.hiddenDmTemplateIds.filter((x) => x !== id);
            saveData();
          });
        }
      });
    });

    const allLogs = [...data.salesLogs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const list = $("#salesLogList");
    if (!allLogs.length) {
      list.innerHTML = '<p class="empty-state">営業ログがありません</p>';
      return;
    }
    list.innerHTML = allLogs
      .slice(0, 50)
      .map(
        (l) => `
      <div class="log-item" data-id="${l.id}">
        <div class="log-item-body">
          <div class="log-date">${l.date} · ${l.type === "dm" ? `DM ${l.count || 1}件` : escapeHtml(l.channel || "営業")}</div>
          <div class="log-body">${escapeHtml(l.notes || "(メモなし)")}</div>
        </div>
        ${actionButtons()}
      </div>`
      )
      .join("");
    list.querySelectorAll(".log-item-body").forEach((el) => {
      el.addEventListener("click", () => openSalesLogModal(el.closest(".log-item").dataset.id));
    });
    bindItemActions(
      list,
      (id) => openSalesLogModal(id),
      (id) => {
        const log = data.salesLogs.find((x) => x.id === id);
        if (!log) return;
        const label = log.type === "dm" ? `${log.date} DM ${log.count || 1}件` : log.notes?.slice(0, 20) || "営業ログ";
        softDelete("salesLog", log, label, () => {
          data.salesLogs = data.salesLogs.filter((x) => x.id !== id);
        });
      }
    );
  }

  function openDmTemplateModal(id, isCustom) {
    let tpl = null;
    if (isCustom && id) tpl = data.customDmTemplates.find((x) => x.id === id);
    else if (id) tpl = D.DM_TEMPLATES.find((x) => x.id === id);
    openModal(
      tpl ? "DMテンプレートを編集" : "DMテンプレートを追加",
      `
      <label class="field"><span>名前</span><input type="text" id="dtName" class="input" value="${escapeHtml(tpl?.name ?? "")}" /></label>
      <label class="field"><span>ステップ（1行1ステップ）</span><textarea id="dtSteps" class="input" rows="5">${escapeHtml((tpl?.steps || []).join("\n"))}</textarea></label>
    `,
      `<button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalSave").onclick = () => {
      const name = $("#dtName").value.trim();
      const steps = $("#dtSteps").value.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!name || !steps.length) return toast("名前とステップを入力してください");
      if (isCustom && id) {
        const t = data.customDmTemplates.find((x) => x.id === id);
        if (t) {
          t.name = name;
          t.steps = steps;
        }
      } else if (!id) {
        data.customDmTemplates.push({ id: uid(), name, steps, createdAt: new Date().toISOString() });
      } else {
        data.customDmTemplates.push({
          id: uid(),
          name,
          steps,
          basedOn: id,
          createdAt: new Date().toISOString(),
        });
      }
      closeModal();
      saveData();
      toast("テンプレートを保存しました");
    };
  }

  function openSalesLogModal(logId) {
    const existing = logId ? data.salesLogs.find((x) => x.id === logId) : null;
    const isDm = existing?.type === "dm";
    openModal(
      existing ? "営業ログを編集" : "営業ログを追加",
      `
      <label class="field"><span>日付</span><input type="date" id="sDate" class="input" value="${existing?.date || todayStr()}" /></label>
      ${isDm ? `<label class="field"><span>DM件数</span><input type="number" id="sCount" class="input" min="1" value="${existing?.count || 1}" /></label>` : `
      <label class="field"><span>チャネル</span>
        <select id="sChannel" class="input">
          ${["X (Twitter)", "Instagram", "紹介", "その他"]
            .map((c) => `<option ${existing?.channel === c ? "selected" : ""}>${c}</option>`)
            .join("")}
        </select>
      </label>`}
      <label class="field"><span>内容</span><textarea id="sNotes" class="input" placeholder="反応・次のアクションなど">${escapeHtml(existing?.notes ?? "")}</textarea></label>
    `,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${existing ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (existing) {
      $("#modalDelete").onclick = () => {
        const log = existing;
        closeModal();
        softDelete("salesLog", log, log.notes?.slice(0, 20) || "営業ログ", () => {
          data.salesLogs = data.salesLogs.filter((x) => x.id !== logId);
        });
      };
    }
    $("#modalSave").onclick = () => {
      if (existing) {
        existing.date = $("#sDate").value;
        existing.notes = $("#sNotes").value.trim();
        if (isDm) existing.count = parseNum($("#sCount").value) || 1;
        else existing.channel = $("#sChannel").value;
        existing.updatedAt = new Date().toISOString();
      } else {
        data.salesLogs.unshift({
          id: uid(),
          type: "log",
          date: $("#sDate").value,
          channel: $("#sChannel").value,
          notes: $("#sNotes").value.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      closeModal();
      saveData();
      toast(existing ? "営業ログを更新しました" : "営業ログを追加しました");
    };
  }

  /* ── Render: Clients ── */
  function renderClients() {
    const active = data.clients.filter((c) => c.status !== "closed");
    const projectTotal = active.reduce((s, c) => s + parseNum(c.projectFee), 0);
    const recurringTotal = getRecurringTotal();

    $("#clientSummary").innerHTML = `
      <div class="summary-box"><strong>${active.length}</strong><span>進行中案件</span></div>
      <div class="summary-box"><strong>${formatYen(projectTotal, true)}</strong><span>受注合計</span></div>
      <div class="summary-box"><strong>${getRecurringCount()}</strong><span>継続契約</span></div>
      <div class="summary-box"><strong>${formatYen(recurringTotal, true)}</strong><span>月額ストック</span></div>`;

    const list = $("#clientList");
    if (!data.clients.length) {
      list.innerHTML = '<p class="empty-state">案件がありません。クイック記録または「+ 追加」から登録してください。</p>';
    } else {
      list.innerHTML = data.clients
        .map(
          (c) => `
        <div class="client-item" data-id="${c.id}">
          <h4>${escapeHtml(c.name)}</h4>
          ${c.memo?.trim() ? `<p class="client-memo">${escapeHtml(c.memo)}</p>` : ""}
          <div class="client-tags">
            <span class="tag ${c.status}">${statusLabel(c.status)}</span>
            ${c.projectFee ? `<span class="tag">制作 ${formatYen(c.projectFee, true)}</span>` : ""}
            ${c.recurringFee ? `<span class="tag recurring">月額 ${formatYen(c.recurringFee, true)}</span>` : ""}
          </div>
        </div>`
        )
        .join("");
      list.querySelectorAll(".client-item").forEach((el) => {
        el.addEventListener("click", () => openClientModal(el.dataset.id));
      });
    }
  }

  function statusLabel(s) {
    return { lead: "見込み", active: "進行中", delivered: "納品済", recurring: "継続", closed: "完了" }[s] || s;
  }

  function openClientModal(id) {
    const c = id ? data.clients.find((x) => x.id === id) : null;
    openModal(
      c ? "案件を編集" : "案件を追加",
      `
      <label class="field"><span>クライアント名</span><input type="text" id="cName" class="input" value="${escapeHtml(c?.name ?? "")}" placeholder="例：〇〇クリニック" /></label>
      <label class="field"><span>ステータス</span>
        <select id="cStatus" class="input">
          ${["lead", "active", "delivered", "recurring", "closed"]
            .map((s) => `<option value="${s}" ${c?.status === s ? "selected" : ""}>${statusLabel(s)}</option>`)
            .join("")}
        </select>
      </label>
      <label class="field"><span>制作費（円）</span><input type="number" id="cProject" class="input" min="0" value="${c?.projectFee ?? ""}" /></label>
      <label class="field"><span>月額継続（円）</span><input type="number" id="cRecurring" class="input" min="0" value="${c?.recurringFee ?? ""}" /></label>
      <label class="field"><span>メモ</span><textarea id="cMemo" class="input" placeholder="連絡先・納品予定・メモなど">${escapeHtml(c?.memo ?? "")}</textarea></label>
    `,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${c ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (c) {
      $("#modalDelete").onclick = () => {
        const client = { ...c };
        closeModal();
        softDelete("client", client, client.name, () => {
          data.clients = data.clients.filter((x) => x.id !== id);
        });
      };
    }
    $("#modalSave").onclick = () => {
      const name = $("#cName").value.trim();
      if (!name) return toast("名前を入力してください");
      const payload = {
        id: c?.id || uid(),
        name,
        status: $("#cStatus").value,
        projectFee: parseNum($("#cProject").value),
        recurringFee: parseNum($("#cRecurring").value),
        memo: $("#cMemo").value.trim(),
        phaseId: D.getCurrentPhaseKey(),
        updatedAt: new Date().toISOString(),
      };
      if (c) {
        const idx = data.clients.findIndex((x) => x.id === id);
        data.clients[idx] = { ...c, ...payload };
      } else data.clients.unshift(payload);
      closeModal();
      saveData();
      toast("案件を保存しました");
    };
  }

  /* ── Render: Tasks ── */
  function renderTasks() {
    const all = getActiveTasks();
    const filtered = taskFilter === "all" ? all : all.filter((t) => t.category === taskFilter);
    const list = $("#taskList");
    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">タスクがありません</p>';
      return;
    }
    list.innerHTML = filtered
      .map(
        (t) => `
      <div class="task-item" data-id="${t.id}">
        <div class="task-main">
          <button type="button" class="task-check ${t.done ? "done" : ""}" data-task="${t.id}">${t.done ? "✓" : ""}</button>
          <span class="task-text ${t.done ? "done" : ""}">${escapeHtml(t.text)}</span>
        </div>
        ${actionButtons()}
      </div>`
      )
      .join("");
    list.querySelectorAll("[data-task]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleTask(btn.dataset.task);
      });
    });
    bindItemActions(
      list,
      (id) => openTaskModal(id),
      (id) => deleteTask(id)
    );
  }

  function deleteTask(id) {
    const t = findTask(id);
    if (!t) return;
    const isDefault = isDefaultTask(id);
    softDelete(isDefault ? "defaultTask" : "customTask", t, t.text, () => {
      if (isDefault) {
        if (!data.deletedDefaultTaskIds.includes(id)) data.deletedDefaultTaskIds.push(id);
      } else {
        data.customTasks = data.customTasks.filter((x) => x.id !== id);
      }
    });
  }

  function toggleTask(id) {
    const t = findTask(id);
    if (!t) return;
    const wasDone = !!t.done;
    const prevDoneAt = t.doneAt;
    t.done = !wasDone;
    t.doneAt = t.done ? new Date().toISOString() : null;
    saveData(false);
    toast(t.done ? "タスクを完了にしました" : "タスクを未完了に戻しました", () => {
      t.done = wasDone;
      t.doneAt = prevDoneAt;
      saveData();
    });
    renderTasks();
  }

  function renderNotes() {
    const list = $("#notesList");
    if (!data.notes.length) {
      list.innerHTML = '<p class="empty-state">戦略メモがありません</p>';
      return;
    }
    list.innerHTML = data.notes
      .map(
        (n) => `
      <div class="note-item" data-id="${n.id}">
        <div class="note-main">
          <div class="note-date">${n.date || ""}</div>
          ${escapeHtml(n.text)}
        </div>
        ${actionButtons()}
      </div>`
      )
      .join("");
    list.querySelectorAll(".note-main").forEach((el) => {
      el.addEventListener("click", () => openNoteModal(el.closest(".note-item").dataset.id));
    });
    bindItemActions(
      list,
      (id) => openNoteModal(id),
      (id) => {
        const note = data.notes.find((x) => x.id === id);
        if (!note) return;
        softDelete("note", note, note.text.slice(0, 24), () => {
          data.notes = data.notes.filter((x) => x.id !== id);
        });
      }
    );
  }

  function openTaskModal(taskId) {
    const existing = taskId ? findTask(taskId) : null;
    openModal(
      existing ? "タスクを編集" : "タスクを追加",
      `<label class="field"><span>内容</span><input type="text" id="tText" class="input" value="${escapeHtml(existing?.text ?? "")}" /></label>
       <label class="field"><span>カテゴリ</span>
         <select id="tCat" class="input">
           ${["sales", "delivery", "retention", "product"]
             .map(
               (c) =>
                 `<option value="${c}" ${existing?.category === c ? "selected" : ""}>${
                   { sales: "営業", delivery: "納品", retention: "継続", product: "プロダクト" }[c]
                 }</option>`
             )
             .join("")}
         </select>
       </label>`,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${existing ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">${existing ? "保存" : "追加"}</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (existing) {
      $("#modalDelete").onclick = () => {
        closeModal();
        deleteTask(taskId);
      };
    }
    $("#modalSave").onclick = () => {
      const text = $("#tText").value.trim();
      if (!text) return toast("内容を入力してください");
      const category = $("#tCat").value;
      if (existing) {
        existing.text = text;
        existing.category = category;
        existing.updatedAt = new Date().toISOString();
      } else {
        data.customTasks.push({
          id: uid(),
          text,
          category,
          phaseId: D.getCurrentPhaseKey(),
          done: false,
          createdAt: new Date().toISOString(),
        });
      }
      closeModal();
      saveData();
      toast(existing ? "タスクを更新しました" : "タスクを追加しました");
    };
  }

  function openNoteModal(noteId) {
    const existing = noteId ? data.notes.find((x) => x.id === noteId) : null;
    openModal(
      existing ? "戦略メモを編集" : "戦略メモ",
      `<label class="field"><span>日付</span><input type="date" id="nDate" class="input" value="${existing?.date || todayStr()}" /></label>
       <label class="field"><span>内容</span><textarea id="nText" class="input">${escapeHtml(existing?.text ?? "")}</textarea></label>`,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${existing ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (existing) {
      $("#modalDelete").onclick = () => {
        const note = existing;
        closeModal();
        softDelete("note", note, note.text.slice(0, 24), () => {
          data.notes = data.notes.filter((x) => x.id !== noteId);
        });
      };
    }
    $("#modalSave").onclick = () => {
      const text = $("#nText").value.trim();
      if (!text) return toast("内容を入力してください");
      if (existing) {
        existing.date = $("#nDate").value;
        existing.text = text;
        existing.updatedAt = new Date().toISOString();
      } else {
        data.notes.unshift({ id: uid(), date: $("#nDate").value, text, createdAt: new Date().toISOString() });
      }
      closeModal();
      saveData();
      toast(existing ? "メモを更新しました" : "メモを保存しました");
    };
  }

  /* ── Settings ── */
  function renderSettings() {
    $("#profileName").value = data.profile.name || "";
    $("#profileBusiness").value = data.profile.businessName || "";
    $("#profileMotto").value = data.profile.motto || "";
    $("#settingUltimate").value = data.settings.ultimateMonthly;
    $("#settingTakeHome").value = data.settings.ultimateTakeHome;
    $("#settingDmDaily").value = data.settings.dmDailyGoal;
    $("#settingDmWeekly").value = data.settings.dmWeeklyGoal;
    const rate = data.settings.defaultTakeHomeRate ?? 67;
    if ($("#simRate")) $("#simRate").value = rate;
    renderTrash();
    renderArchives();
    renderSyncSettings();
    const verEl = $("#appVersionLabel");
    if (verEl) verEl.textContent = `v${APP_VERSION}`;
    const serverEl = $("#serverVersionLabel");
    if (serverEl) {
      serverEl.textContent = serverVersionRemote != null ? `v${serverVersionRemote}` : "未確認";
      if (serverVersionRemote != null && serverVersionRemote > APP_VERSION) {
        serverEl.classList.add("version-new");
      } else {
        serverEl.classList.remove("version-new");
      }
    }
  }

  async function fetchServerVersion() {
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      const v = parseInt(json.version, 10);
      return isNaN(v) ? null : v;
    } catch {
      return null;
    }
  }

  async function compareWithServerVersion(showToast) {
    const remote = await fetchServerVersion();
    serverVersionRemote = remote;
    renderSettings();
    if (remote != null && remote > APP_VERSION) {
      showUpdateBanner(swRegistration);
      if (showToast) {
        toast(
          `新しいバージョンがあります（サーバー v${remote} / この端末 v${APP_VERSION}）。「更新する」または「キャッシュを消去」を押してください`
        );
      }
      return true;
    }
    return false;
  }

  /* ── Service Worker / 更新 ── */
  function showUpdateBanner(reg) {
    const banner = $("#updateBanner");
    if (!banner || banner.classList.contains("show")) return;
    banner.classList.add("show");
    swRegistration = reg || swRegistration;
    const btn = $("#updateAppBtn");
    if (btn) {
      btn.onclick = () => applyServiceWorkerUpdate();
    }
    $("#dismissUpdateBtn")?.addEventListener("click", () => {
      banner.classList.remove("show");
    }, { once: true });
  }

  function applyServiceWorkerUpdate() {
    const waiting = swRegistration?.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      toast("更新を適用しています…");
      return;
    }
    if (serverVersionRemote != null && serverVersionRemote > APP_VERSION) {
      forceClearCacheAndReload(true);
      return;
    }
    window.location.reload();
  }

  async function checkForAppUpdate(showToast = true) {
    const remoteFirst = await fetchServerVersion();
    serverVersionRemote = remoteFirst;
    renderSettings();

    if (remoteFirst != null && remoteFirst > APP_VERSION) {
      showUpdateBanner(swRegistration);
      if (showToast) {
        toast(
          `新しいバージョンがあります（サーバー v${remoteFirst} / この端末 v${APP_VERSION}）`
        );
      }
    }

    if (!("serviceWorker" in navigator)) {
      if (showToast && !(remoteFirst != null && remoteFirst > APP_VERSION)) {
        toast("この環境では自動更新に対応していません");
      }
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      swRegistration = reg;
      await reg.update();
      if (reg.waiting) {
        showUpdateBanner(reg);
        if (showToast) {
          toast("新しいバージョンがあります。「更新する」を押してください");
        }
      } else if (showToast && !(remoteFirst != null && remoteFirst > APP_VERSION)) {
        toast(`最新版を使用中です（v${APP_VERSION}）`);
      }
    } catch {
      if (showToast && !(remoteFirst != null && remoteFirst > APP_VERSION)) {
        toast("更新の確認に失敗しました。キャッシュを消去をお試しください");
      }
    }
  }

  async function forceClearCacheAndReload(skipConfirm = false) {
    if (
      !skipConfirm &&
      !confirm("キャッシュを消去して最新版を読み込みます。データは端末に残ります。続行しますか？")
    ) {
      return;
    }
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {}
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swReloading) return;
      swReloading = true;
      window.location.reload();
    });

    try {
      const reg = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      swRegistration = reg;

      if (reg.waiting) showUpdateBanner(reg);

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(reg);
          }
        });
      });

      await reg.update();

      compareWithServerVersion(false);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update();
          compareWithServerVersion(false);
          if (data.sync?.enabled && data.sync.syncId && CloudSync.isConfigured()) {
            syncPullNow(false);
          }
        }
      });

      setInterval(() => reg.update(), 60 * 60 * 1000);
    } catch (_) {}
  }

  function renderTrash() {
    const list = $("#trashList");
    const summary = $("#trashSummary");
    if (!list) return;
    if (summary) summary.textContent = data.trash.length ? `${data.trash.length}件の削除済み項目` : "削除した項目はここから復元できます";
    if (!data.trash.length) {
      list.innerHTML = '<p class="empty-state">ゴミ箱は空です</p>';
      return;
    }
    list.innerHTML = data.trash
      .map(
        (t) => `
      <div class="trash-item" data-trash="${t.trashId}">
        <div class="trash-item-meta">
          <div class="trash-item-label">${escapeHtml(t.label)}</div>
          <div class="trash-item-type">${ENTITY_LABELS[t.entityType] || t.entityType} · ${(t.deletedAt || "").slice(0, 10)}</div>
        </div>
        <div class="trash-item-actions">
          <button type="button" class="btn btn-primary btn-sm" data-restore="${t.trashId}">復元</button>
          <button type="button" class="btn btn-ghost btn-sm danger-text" data-purge="${t.trashId}">完全削除</button>
        </div>
      </div>`
      )
      .join("");
    list.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", () => restoreFromTrash(btn.dataset.restore));
    });
    list.querySelectorAll("[data-purge]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!confirm("完全に削除しますか？復元できなくなります。")) return;
        purgeTrash(btn.dataset.purge);
      });
    });
  }

  function renderArchives() {
    const list = $("#archiveList");
    if (!list) return;
    if (!data.archives.length) {
      list.innerHTML = '<p class="empty-state">アーカイブはありません（リセット時に自動作成されます）</p>';
      return;
    }
    list.innerHTML = data.archives
      .map(
        (a) => `
      <div class="archive-item" data-archive="${a.id}">
        <div class="archive-item-meta">
          <div class="trash-item-label">${escapeHtml(a.label)}</div>
          <div class="archive-item-date">${(a.createdAt || "").slice(0, 16).replace("T", " ")}</div>
        </div>
        <div class="archive-item-actions">
          <button type="button" class="btn btn-primary btn-sm" data-restore-arch="${a.id}">復元</button>
        </div>
      </div>`
      )
      .join("");
    list.querySelectorAll("[data-restore-arch]").forEach((btn) => {
      btn.addEventListener("click", () => restoreArchive(btn.dataset.restoreArch));
    });
  }

  function saveSettingsFromForm() {
    data.profile.name = $("#profileName").value.trim();
    data.profile.businessName = $("#profileBusiness").value.trim();
    data.profile.motto = $("#profileMotto").value.trim();
    data.settings.ultimateMonthly = parseNum($("#settingUltimate").value);
    data.settings.ultimateTakeHome = parseNum($("#settingTakeHome").value);
    data.settings.dmDailyGoal = parseNum($("#settingDmDaily").value) || 10;
    data.settings.dmWeeklyGoal = parseNum($("#settingDmWeekly").value) || 50;
    if ($("#simRate")) data.settings.defaultTakeHomeRate = parseNum($("#simRate").value) || 67;
    saveData();
    toast("設定を保存しました");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `startup-roadmap-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("データをエクスポートしました");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        data = D.migrateUserData(parsed);
        saveData();
        toast("インポートが完了しました");
      } catch {
        toast("ファイルの形式が正しくありません");
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!confirm("すべての記録が初期状態に戻ります。続行しますか？")) return;
    createArchive("リセット前の自動バックアップ");
    const archives = data.archives;
    data = D.createDefaultUserData();
    data.archives = archives;
    saveData();
    toast("データをリセットしました。設定のアーカイブから復元できます。");
  }

  /* ── Focus notification ── */
  function showFocusAlert() {
    const plan = resolveMonth(currentMonthStr());
    if (!plan) return toast("今月のプランがありません");
    toast(`${plan.month.label}: ${plan.month.title}`);
  }

  /* ── Utils ── */
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAll() {
    renderHome();
    renderRoadmap();
    renderRecords();
    renderSales();
    renderClients();
    renderTasks();
    renderNotes();
    renderSettings();
    updateSim();
    const rev = getCurrentMonthRevenue();
    if ($("#simRevenue") && !$("#simRevenue").matches(":focus")) {
      $("#simRevenue").value = rev || "";
    }
  }

  function attachRipples() {
    document.body.addEventListener(
      "pointerdown",
      (e) => {
        const el = e.target.closest(".btn, .quick-btn, .nav-btn, .seg-btn, .dm-btn");
        if (!el || prefersReducedMotion()) return;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.3;
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
        el.appendChild(ripple);
        setTimeout(() => ripple.remove(), 550);
      },
      { passive: true }
    );
  }

  /* ── Init ── */
  async function init() {
    loadDataLocal();

    await bootstrapCloud();

    $$(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => switchView(b.dataset.nav));
    });

    $("#modalClose").addEventListener("click", closeModal);
    $("#modalBackdrop").addEventListener("click", (e) => {
      if (e.target === $("#modalBackdrop")) closeModal();
    });

    $("#dmPlus").addEventListener("click", () => addDm(1));
    $("#dmMinus").addEventListener("click", () => {
      const logs = getDmLogsForDate(todayStr());
      if (!logs.length) return toast("今日のDM記録がありません");
      const l = logs[0];
      if ((l.count || 1) <= 1) {
        const copy = { ...l };
        softDelete("salesLog", copy, `今日のDM記録`, () => {
          data.salesLogs = data.salesLogs.filter((x) => x.id !== l.id);
        });
      } else {
        const prev = l.count;
        l.count -= 1;
        saveData(false);
        toast("DMを1件減らしました", () => {
          l.count = prev;
          saveData();
        });
        renderSales();
        renderHome();
      }
    });

    $$(".quick-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.quick;
        if (q === "dm") {
          addDm(1);
          switchView("sales");
        } else if (q === "revenue") {
          openRecordModal();
          switchView("kpi");
        } else if (q === "client") {
          openClientModal();
          switchView("clients");
        } else if (q === "task") {
          switchView("tasks");
        }
      });
    });

    $("#addRecordBtn").addEventListener("click", () => openRecordModal());
    $("#editMonthTargetBtn")?.addEventListener("click", openMonthTargetModal);
    $("#editFocusBtn")?.addEventListener("click", () => openMonthPlanModal(currentMonthStr()));
    $("#editRoadmapIntroBtn")?.addEventListener("click", openRoadmapIntroModal);
    $("#addSalesLogBtn").addEventListener("click", () => openSalesLogModal());
    $("#addDmTemplateBtn")?.addEventListener("click", () => openDmTemplateModal(null, true));
    $("#addClientBtn").addEventListener("click", () => openClientModal());
    $("#addTaskBtn").addEventListener("click", () => openTaskModal());
    $("#addNoteBtn").addEventListener("click", () => openNoteModal());
    $("#emptyTrashBtn")?.addEventListener("click", emptyTrash);
    $("#saveSettingsBtn").addEventListener("click", saveSettingsFromForm);
    $("#exportBtn").addEventListener("click", exportData);
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importData(f);
      e.target.value = "";
    });
    $("#resetDataBtn").addEventListener("click", resetData);
    $("#notifBtn").addEventListener("click", showFocusAlert);
    $("#checkUpdateBtn")?.addEventListener("click", () => checkForAppUpdate(true));
    $("#forceUpdateBtn")?.addEventListener("click", forceClearCacheAndReload);
    $("#syncEnabled")?.addEventListener("change", saveSyncSettings);
    $("#saveSyncBtn")?.addEventListener("click", saveSyncSettings);
    $("#syncNowBtn")?.addEventListener("click", () => syncPullNow(true));
    $("#copySyncIdBtn")?.addEventListener("click", copySyncId);
    $("#newSyncIdBtn")?.addEventListener("click", () => {
      if (!confirm("新しい同期IDを発行しますか？別のIDは別データになります。")) return;
      $("#syncIdInput").value = CloudSync.generateSyncId();
      saveSyncSettings();
    });

    $$("#chartRangeSeg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("#chartRangeSeg .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        chartRange = parseInt(btn.dataset.range, 10);
        renderChart();
      });
    });

    $("#simRevenue")?.addEventListener("input", updateSim);
    $("#simRate")?.addEventListener("input", () => {
      updateSim();
      data.settings.defaultTakeHomeRate = parseNum($("#simRate").value) || 67;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (_) {}
    });

    $$("#taskFilters .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$("#taskFilters .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        taskFilter = chip.dataset.filter;
        renderTasks();
      });
    });

    ["profileName", "profileBusiness", "profileMotto"].forEach((id) => {
      $("#" + id)?.addEventListener("blur", saveSettingsFromForm);
    });

    window.addEventListener("resize", () => {
      const active = document.querySelector(".nav-btn.active")?.dataset.nav || "home";
      updateNavIndicator(active);
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      $("#installCard").hidden = false;
    });
    $("#installBtn")?.addEventListener("click", async () => {
      if (!deferredInstall) return toast("ブラウザメニューから「ホーム画面に追加」を選んでください");
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      $("#installCard").hidden = true;
    });

    registerServiceWorker();

    attachRipples();
    renderAll();
    updateNavIndicator("home");

    setTimeout(() => {
      const plan = resolveMonth(currentMonthStr());
      if (plan && getCurrentMonthRevenue() === 0 && !localStorage.getItem("startupRoadmap_welcomed")) {
        localStorage.setItem("startupRoadmap_welcomed", "1");
        toast(`第${plan.phase.number}期スタート: ${plan.month.title}`);
      }
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else init();
})();
