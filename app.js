/* 起業ロードマップ PWA v3 — メインロジック */
(() => {
  "use strict";

  const D = window.StartupDefaults;
  const STORAGE_KEY = D.STORAGE_KEY;
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
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      data = D.migrateUserData(saved);
    } catch {
      data = D.createDefaultUserData();
    }
    saveData(false);
  }

  function saveData(render = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      toast("保存に失敗しました。ストレージ容量を確認してください。");
      console.error(e);
    }
    if (render) renderAll();
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
      existing.count = (existing.count || 1) + count;
    } else {
      data.salesLogs.unshift({
        id: uid(),
        type: "dm",
        date: todayStr(),
        count,
        channel: "X",
        notes: "",
        createdAt: new Date().toISOString(),
      });
    }
    saveData();
    toast(`DM +${count} を記録しました`);
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
    const plan = D.getMonthPlan(month);
    if (plan?.month?.kpis?.monthlyTarget) return plan.month.kpis.monthlyTarget;
    if (plan?.phase) {
      const mid = (plan.phase.revenueMin + plan.phase.revenueMax) / 2;
      return mid;
    }
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
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
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
    const phaseId = D.getCurrentPhaseKey();
    const phase = D.PHASES.find((p) => p.id === phaseId);
    const month = currentMonthStr();
    const plan = D.getMonthPlan(month);
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
      ul.innerHTML = plan.month.actions
        .map((a) => `<li>${escapeHtml(a)}</li>`)
        .join("");
    }

    renderPhaseStrip(phaseId);
    renderMilestonePreview();
  }

  function renderPhaseStrip(activeId) {
    const strip = $("#phaseStrip");
    strip.innerHTML = D.PHASES.map((p) => {
      const done = currentMonthStr() > p.end;
      const active = p.id === activeId;
      return `<div class="phase-dot ${active ? "active" : ""} ${done ? "done" : ""}" title="第${p.number}期"></div>`;
    }).join("");
  }

  function renderMilestonePreview() {
    const phaseId = D.getCurrentPhaseKey();
    const phase = D.PHASES.find((p) => p.id === phaseId);
    if (!phase) return;
    const ms = phase.milestones;
    const done = ms.filter((m) => data.milestones[m.id]?.done).length;
    $("#milestoneProgress").textContent = `${done}/${ms.length}`;
    const el = $("#milestonePreview");
    el.innerHTML = ms
      .slice(0, 4)
      .map(
        (m) => `
      <div class="ms-item">
        <button type="button" class="ms-check ${data.milestones[m.id]?.done ? "done" : ""}" data-ms="${m.id}" aria-label="達成切替">
          ${data.milestones[m.id]?.done ? "✓" : ""}
        </button>
        <span>${escapeHtml(m.text)}</span>
      </div>`
      )
      .join("");
    el.querySelectorAll("[data-ms]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.ms;
        const cur = data.milestones[id];
        cur.done = !cur.done;
        cur.doneAt = cur.done ? new Date().toISOString() : null;
        saveData();
      });
    });
  }

  /* ── Render: Roadmap ── */
  function renderRoadmap() {
    const bar = $("#timelineBar");
    const now = currentMonthStr();
    bar.innerHTML = D.PHASES.map((p) => {
      const past = now >= p.end;
      const cur = now >= p.start && now <= p.end;
      return `<div class="timeline-seg ${past || cur ? "past" : "future"}" style="background:${p.color}" title="${p.title}"></div>`;
    }).join("");

    const container = $("#roadmapPhases");
    container.innerHTML = D.PHASES.map((p) => {
      const monthsHtml = p.months
        .map(
          (m) => `
        <div class="month-block">
          <h5><span>${m.label}</span>${escapeHtml(m.title)}</h5>
          <p class="muted small">行動</p>
          <ul class="action-list">${m.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
          <p class="muted small">成果</p>
          <ul class="outcome-list">${m.outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        </div>`
        )
        .join("");
      const msHtml = p.milestones
        .map(
          (m) => `
        <label>
          <input type="checkbox" data-ms="${m.id}" ${data.milestones[m.id]?.done ? "checked" : ""} />
          ${escapeHtml(m.text)}
        </label>`
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
          <svg class="phase-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="phase-body">
          ${monthsHtml}
          <div class="month-block ms-roadmap">${msHtml}</div>
        </div>
      </article>`;
    }).join("");

    container.querySelectorAll(".phase-header").forEach((h) => {
      const toggle = () => h.closest(".phase-block").classList.toggle("open");
      h.addEventListener("click", toggle);
      h.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });

    const curPhase = D.getCurrentPhaseKey();
    const openBlock = container.querySelector(`[data-phase="${curPhase}"]`);
    if (openBlock) openBlock.classList.add("open");

    container.querySelectorAll("[data-ms]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.ms;
        data.milestones[id].done = cb.checked;
        data.milestones[id].doneAt = cb.checked ? new Date().toISOString() : null;
        saveData();
      });
    });
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
        <span class="record-month">${r.month}</span>
        <span class="record-val">${formatYen(total, true)}</span>
      </div>`;
      })
      .join("");
    list.querySelectorAll(".record-item").forEach((el) => {
      el.addEventListener("click", () => openRecordModal(el.dataset.month));
    });
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
      <label class="field"><span>対象月</span><input type="month" id="mMonth" class="input" value="${m}" /></label>
      <label class="field"><span>新規売上（円）</span><input type="number" id="mRevenue" class="input" min="0" value="${existing?.revenue ?? ""}" /></label>
      <label class="field"><span>継続売上（円）</span><input type="number" id="mRecurring" class="input" min="0" value="${existing?.recurring ?? ""}" /></label>
      <label class="field"><span>手取り（円・任意）</span><input type="number" id="mTakeHome" class="input" min="0" value="${existing?.takeHome ?? ""}" /></label>
      <label class="field"><span>メモ</span><textarea id="mNotes" class="input">${escapeHtml(existing?.notes ?? "")}</textarea></label>
    `,
      `<button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
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
      if (idx >= 0) data.monthlyRecords[idx] = { ...data.monthlyRecords[idx], ...payload };
      else data.monthlyRecords.push(payload);
      closeModal();
      saveData();
      toast("月次記録を保存しました");
    };
  }

  function updateSim() {
    const rev = parseNum($("#simRevenue")?.value);
    const rate = parseNum($("#simRate")?.value) / 100;
    $("#simRateLabel").textContent = `${Math.round(rate * 100)}%`;
    $("#simTakeHome").textContent = formatYen(rev * rate);
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

    $("#dmTemplates").innerHTML = D.DM_TEMPLATES.map(
      (t) => `
      <div class="tpl-item">
        <h4>${escapeHtml(t.name)}</h4>
        <ol>${t.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      </div>`
    ).join("");

    const allLogs = [...data.salesLogs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const list = $("#salesLogList");
    if (!allLogs.length) {
      list.innerHTML = '<p class="empty-state">営業ログがありません</p>';
      return;
    }
    list.innerHTML = allLogs
      .slice(0, 30)
      .map(
        (l) => `
      <div class="log-item" data-id="${l.id}">
        <div class="log-date">${l.date} · ${l.type === "dm" ? `DM ${l.count || 1}件` : escapeHtml(l.channel || "営業")}</div>
        <div class="log-body">${escapeHtml(l.notes || "(メモなし)")}</div>
      </div>`
      )
      .join("");
  }

  function openSalesLogModal() {
    openModal(
      "営業ログ",
      `
      <label class="field"><span>日付</span><input type="date" id="sDate" class="input" value="${todayStr()}" /></label>
      <label class="field"><span>チャネル</span>
        <select id="sChannel" class="input">
          <option>X (Twitter)</option><option>Instagram</option><option>紹介</option><option>その他</option>
        </select>
      </label>
      <label class="field"><span>内容</span><textarea id="sNotes" class="input" placeholder="反応・次のアクションなど"></textarea></label>
    `,
      `<button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalSave").onclick = () => {
      data.salesLogs.unshift({
        id: uid(),
        type: "log",
        date: $("#sDate").value,
        channel: $("#sChannel").value,
        notes: $("#sNotes").value.trim(),
        createdAt: new Date().toISOString(),
      });
      closeModal();
      saveData();
      toast("営業ログを追加しました");
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

    const testimonials = data.clients.filter((c) => c.testimonial?.trim());
    const tList = $("#testimonialList");
    if (!testimonials.length) {
      tList.innerHTML = '<p class="empty-state">お客様の声を案件に登録するとここに表示されます</p>';
    } else {
      tList.innerHTML = testimonials
        .map(
          (c) => `
        <blockquote class="testimonial-card">
          ${escapeHtml(c.testimonial)}
          <cite>— ${escapeHtml(c.name)}</cite>
        </blockquote>`
        )
        .join("");
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
      <label class="field"><span>お客様の声</span><textarea id="cTestimonial" class="input" placeholder="〇〇院長にも喜ばれました！">${escapeHtml(c?.testimonial ?? "")}</textarea></label>
      <label class="field"><span>メモ</span><textarea id="cMemo" class="input">${escapeHtml(c?.memo ?? "")}</textarea></label>
    `,
      `<button type="button" class="btn btn-danger btn-sm" id="modalDelete" ${c ? "" : "hidden"}>削除</button>
       <button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    if (c) {
      $("#modalDelete").onclick = () => {
        if (!confirm("この案件を削除しますか？")) return;
        data.clients = data.clients.filter((x) => x.id !== id);
        closeModal();
        saveData();
        toast("案件を削除しました");
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
        testimonial: $("#cTestimonial").value.trim(),
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
    const all = [...data.tasks, ...data.customTasks];
    const filtered =
      taskFilter === "all" ? all : all.filter((t) => t.category === taskFilter);
    const list = $("#taskList");
    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">タスクがありません</p>';
      return;
    }
    list.innerHTML = filtered
      .map(
        (t) => `
      <div class="task-item" data-id="${t.id}">
        <button type="button" class="task-check ${t.done ? "done" : ""}" data-task="${t.id}">${t.done ? "✓" : ""}</button>
        <span class="task-text ${t.done ? "done" : ""}">${escapeHtml(t.text)}</span>
      </div>`
      )
      .join("");
    list.querySelectorAll("[data-task]").forEach((btn) => {
      btn.addEventListener("click", () => toggleTask(btn.dataset.task));
    });
  }

  function toggleTask(id) {
    let t = data.tasks.find((x) => x.id === id) || data.customTasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    saveData();
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
        <div class="note-date">${n.date || ""}</div>
        ${escapeHtml(n.text)}
      </div>`
      )
      .join("");
  }

  function openTaskModal() {
    openModal(
      "タスクを追加",
      `<label class="field"><span>内容</span><input type="text" id="tText" class="input" /></label>
       <label class="field"><span>カテゴリ</span>
         <select id="tCat" class="input">
           <option value="sales">営業</option><option value="delivery">納品</option>
           <option value="retention">継続</option><option value="product">プロダクト</option>
         </select>
       </label>`,
      `<button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">追加</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalSave").onclick = () => {
      const text = $("#tText").value.trim();
      if (!text) return toast("内容を入力してください");
      data.customTasks.push({
        id: uid(),
        text,
        category: $("#tCat").value,
        phaseId: D.getCurrentPhaseKey(),
        done: false,
        createdAt: new Date().toISOString(),
      });
      closeModal();
      saveData();
      toast("タスクを追加しました");
    };
  }

  function openNoteModal() {
    openModal(
      "戦略メモ",
      `<label class="field"><span>日付</span><input type="date" id="nDate" class="input" value="${todayStr()}" /></label>
       <label class="field"><span>内容</span><textarea id="nText" class="input"></textarea></label>`,
      `<button type="button" class="btn btn-ghost" id="modalCancel">キャンセル</button>
       <button type="button" class="btn btn-primary" id="modalSave">保存</button>`
    );
    $("#modalCancel").onclick = closeModal;
    $("#modalSave").onclick = () => {
      const text = $("#nText").value.trim();
      if (!text) return toast("内容を入力してください");
      data.notes.unshift({ id: uid(), date: $("#nDate").value, text, createdAt: new Date().toISOString() });
      closeModal();
      saveData();
      toast("メモを保存しました");
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
  }

  function saveSettingsFromForm() {
    data.profile.name = $("#profileName").value.trim();
    data.profile.businessName = $("#profileBusiness").value.trim();
    data.profile.motto = $("#profileMotto").value.trim();
    data.settings.ultimateMonthly = parseNum($("#settingUltimate").value);
    data.settings.ultimateTakeHome = parseNum($("#settingTakeHome").value);
    data.settings.dmDailyGoal = parseNum($("#settingDmDaily").value) || 10;
    data.settings.dmWeeklyGoal = parseNum($("#settingDmWeekly").value) || 50;
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
    if (!confirm("すべての記録が削除されます。本当にリセットしますか？")) return;
    if (!confirm("最終確認：この操作は取り消せません。")) return;
    localStorage.removeItem(STORAGE_KEY);
    data = D.createDefaultUserData();
    saveData();
    toast("データをリセットしました");
  }

  /* ── Focus notification ── */
  function showFocusAlert() {
    const plan = D.getMonthPlan(currentMonthStr());
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
  function init() {
    loadData();

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
        data.salesLogs = data.salesLogs.filter((x) => x.id !== l.id);
      } else l.count -= 1;
      saveData();
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
    $("#addSalesLogBtn").addEventListener("click", openSalesLogModal);
    $("#addClientBtn").addEventListener("click", () => openClientModal());
    $("#addTaskBtn").addEventListener("click", openTaskModal);
    $("#addNoteBtn").addEventListener("click", openNoteModal);
    $("#saveSettingsBtn").addEventListener("click", saveSettingsFromForm);
    $("#exportBtn").addEventListener("click", exportData);
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importData(f);
      e.target.value = "";
    });
    $("#resetDataBtn").addEventListener("click", resetData);
    $("#notifBtn").addEventListener("click", showFocusAlert);

    $$("#chartRangeSeg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("#chartRangeSeg .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        chartRange = parseInt(btn.dataset.range, 10);
        renderChart();
      });
    });

    $("#simRevenue")?.addEventListener("input", updateSim);
    $("#simRate")?.addEventListener("input", updateSim);

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

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    attachRipples();
    renderAll();
    updateNavIndicator("home");

    setTimeout(() => {
      const plan = D.getMonthPlan(currentMonthStr());
      if (plan && getCurrentMonthRevenue() === 0 && !localStorage.getItem("startupRoadmap_welcomed")) {
        localStorage.setItem("startupRoadmap_welcomed", "1");
        toast(`第${plan.phase.number}期スタート: ${plan.month.title}`);
      }
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else init();
})();
