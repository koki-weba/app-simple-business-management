/* 起業ロードマップ PWA — デフォルト定義（アプリ更新時もユーザー記録は別キーで保持） */
(() => {
  "use strict";

  const SCHEMA_VERSION = 4;
  const STORAGE_KEY = "startupRoadmap_userData_v3";
  const META_KEY = "startupRoadmap_meta_v3";

  const ULTIMATE = {
    monthlyRevenue: 600000,
    takeHome: 400000,
    deadline: "2028-03",
    label: "月商60万・手取り40万の安定化",
  };

  const PHASES = [
    {
      id: "p1",
      number: 1,
      title: "0→1突破と実績づくり",
      period: "2026年5月〜7月",
      start: "2026-05",
      end: "2026-07",
      revenueMin: 30000,
      revenueMax: 90000,
      revenueLabel: "月商3万〜9万円",
      theme: "モニター実績3件・初受注",
      color: "#2563eb",
      months: [
        {
          key: "2026-05",
          label: "5月",
          title: "最初の1件の獲得",
          actions: [
            "2ステップDM（感想＋質問）を1日10件、週50件送信",
            "見込み客リストの整備とフォローアップ",
            "Cursorでデモサイト制作・納品フローの確立",
          ],
          outcomes: [
            "3万円のデモサイト制作を1件受注",
            "月末までにCursorで納品完了",
          ],
          kpis: { dmDaily: 10, dmWeekly: 50, newProjects: 1, projectFee: 30000 },
        },
        {
          key: "2026-06",
          label: "6月",
          title: "実績の横展開とお客様の声",
          actions: [
            "納品サイトをGitHub Pagesで実績公開",
            "「〇〇院長にも喜ばれました！」を武器にDM営業継続",
            "Before/After・お客様の声を素材化",
          ],
          outcomes: ["新規3万円制作を1〜2件受注"],
          kpis: { dmDaily: 10, dmWeekly: 50, newProjects: 2, projectFee: 30000 },
        },
        {
          key: "2026-07",
          label: "7月",
          title: "モニター期間の終了（決断の月）",
          actions: [
            "3件の実績が揃ったらモニター価格3万円を終了",
            "次フェーズに向けた単価・提案の準備",
            "ポートフォリオの最終整備",
          ],
          outcomes: ["モニター3件達成", "価格改定の意思決定完了"],
          kpis: { monitorCases: 3, newProjects: 0, projectFee: 30000 },
        },
      ],
      milestones: [
        { id: "p1-m1", text: "初受注（3万円）獲得" },
        { id: "p1-m2", text: "GitHub Pagesで実績公開" },
        { id: "p1-m3", text: "モニター実績3件達成" },
        { id: "p1-m4", text: "制作費3万円モニター終了" },
      ],
    },
    {
      id: "p2",
      number: 2,
      title: "単価UP・継続契約の初受注",
      period: "2026年8月〜11月",
      start: "2026-08",
      end: "2026-11",
      revenueMin: 150000,
      revenueMax: 250000,
      revenueLabel: "月商15万〜25万円",
      theme: "労働集約からの脱却",
      color: "#1d4ed8",
      months: [
        {
          key: "2026-08",
          label: "8月",
          title: "提案のアップグレード（夏休み）",
          actions: [
            "制作単価を10万〜15万円に引き上げ",
            "「綺麗なサイト」→「集客できるサイト」へトーク変更",
            "15万円プランの提案資料を整備",
          ],
          outcomes: ["15万円サイトを1件受注（月商15万）"],
          kpis: { newProjects: 1, projectFee: 150000, recurringClients: 0 },
        },
        {
          key: "2026-09",
          label: "9月",
          title: "ストック収益の提案開始",
          actions: [
            "過去3万円クライアントへ月額3万円のMEO・Instagram運用を提案",
            "継続契約の契約書・レポート雛形を用意",
          ],
          outcomes: ["初の継続契約（月額3万）1件獲得（月商18万）"],
          kpis: { recurringFee: 30000, recurringClients: 1 },
        },
        {
          key: "2026-10",
          label: "10月",
          title: "新規＋継続の両輪",
          actions: [
            "月1件の新規制作（15万円）",
            "継続契約クライアントを2〜3社へ増枠",
          ],
          outcomes: ["制作15万＋継続の積み上げ"],
          kpis: { newProjects: 1, projectFee: 150000, recurringClients: 2 },
        },
        {
          key: "2026-11",
          label: "11月",
          title: "収益構造の安定化",
          actions: [
            "継続契約の解約防止・成果レポート",
            "紹介案件の仕組みづくり",
          ],
          outcomes: ["制作15万＋継続9万＝月商24万円"],
          kpis: { monthlyTarget: 240000, recurringClients: 3 },
        },
      ],
      milestones: [
        { id: "p2-m1", text: "15万円案件を初受注" },
        { id: "p2-m2", text: "初の継続契約（月額3万）獲得" },
        { id: "p2-m3", text: "月商24万円達成" },
      ],
    },
    {
      id: "p3",
      number: 3,
      title: "ストック収益の土台固め",
      period: "2026年12月〜2027年4月",
      start: "2026-12",
      end: "2027-04",
      revenueMin: 300000,
      revenueMax: 400000,
      revenueLabel: "月商30万〜40万円",
      theme: "限界突破と仕組み化の準備",
      color: "#1e40af",
      months: [
        {
          key: "2026-12",
          label: "12月",
          title: "既存クライアント深耕",
          actions: [
            "新規営業より既存の売上アップ（MEO・キャンペーン画像）",
            "解約防止と信頼強化",
          ],
          outcomes: ["継続契約の拡大開始"],
          kpis: { recurringClients: 4, recurringRevenue: 120000 },
        },
        {
          key: "2027-01",
          label: "1月",
          title: "ストック収益の積み上げ",
          actions: ["継続クライアントへの追加提案", "紹介案件の受け皿整備"],
          outcomes: ["毎月確定売上の増加"],
          kpis: { recurringClients: 5, recurringRevenue: 150000 },
        },
        {
          key: "2027-02",
          label: "2月",
          title: "家賃・生活費を越える継続収入",
          actions: ["継続契約5〜7社を目指す運用", "成果の可視化レポート"],
          outcomes: ["毎月1日に20万円の売上が確定する状態"],
          kpis: { recurringClients: 6, recurringRevenue: 200000 },
        },
        {
          key: "2027-03",
          label: "3月",
          title: "外注先選定開始（大学4年）",
          actions: [
            "後輩・X等でコーディング・画像のパートナー1名探索",
            "外注マニュアル・チェックリスト作成",
          ],
          outcomes: ["パートナー候補リスト完成"],
          kpis: { partners: 1 },
        },
        {
          key: "2027-04",
          label: "4月",
          title: "仕組み化の準備完了",
          actions: ["外注テスト案件の実施", "月商40万の壁を分析"],
          outcomes: ["外注1名と協業開始"],
          kpis: { monthlyTarget: 350000 },
        },
      ],
      milestones: [
        { id: "p3-m1", text: "継続契約5社以上" },
        { id: "p3-m2", text: "毎月確定20万円のストック収益" },
        { id: "p3-m3", text: "外注パートナー1名確保" },
      ],
    },
    {
      id: "p4",
      number: 4,
      title: "ディレクション（管理）への移行",
      period: "2027年5月〜9月",
      start: "2027-05",
      end: "2027-09",
      revenueMin: 400000,
      revenueMax: 500000,
      revenueLabel: "月商40万〜50万円",
      theme: "自分の時間を作り出す",
      color: "#1e3a8a",
      months: [
        {
          key: "2027-05",
          label: "5月",
          title: "チーム制作体制の構築",
          actions: [
            "営業・MTG・ディレクションに特化",
            "実務50%をパートナーへ外注（月5〜10万報酬）",
            "制作単価20万円へ引き上げ",
          ],
          outcomes: ["外注フロー確立"],
          kpis: { projectFee: 200000, outsourceRatio: 0.5 },
        },
        {
          key: "2027-06",
          label: "6月",
          title: "ディレクション品質の向上",
          actions: ["クライアントMTGのテンプレ化", "外注品質チェック"],
          outcomes: ["継続8社・制作20万の体制"],
          kpis: { recurringClients: 8, recurringRevenue: 250000 },
        },
        {
          key: "2027-07",
          label: "7月",
          title: "月商45万円ライン",
          actions: ["制作＋継続のバランス最適化"],
          outcomes: ["制作20万＋継続25万＝月商45万"],
          kpis: { monthlyTarget: 450000 },
        },
        {
          key: "2027-08",
          label: "8月",
          title: "Exit 200M 開発再開",
          actions: [
            "空いた時間で自社アプリ開発を本格化",
            "非公開リポジトリでM&A向けプロトタイプ",
          ],
          outcomes: ["週10時間以上をプロダクト開発に確保"],
          kpis: { productHoursWeekly: 10 },
        },
        {
          key: "2027-09",
          label: "9月",
          title: "事業とプロダクトの二刀流",
          actions: ["受託の安定運用＋アプリのマイルストーン設定"],
          outcomes: ["開発ロードマップ策定"],
          kpis: { monthlyTarget: 450000 },
        },
      ],
      milestones: [
        { id: "p4-m1", text: "外注50%体制の確立" },
        { id: "p4-m2", text: "月商45万円達成" },
        { id: "p4-m3", text: "Exit 200M 開発本格化" },
      ],
    },
    {
      id: "p5",
      number: 5,
      title: "目標達成と自動化",
      period: "2027年10月〜2028年3月",
      start: "2027-10",
      end: "2028-03",
      revenueMin: 600000,
      revenueMax: 600000,
      revenueLabel: "月商60万円（手取り40万）",
      theme: "安定化・法人化・M&A準備",
      color: "#172554",
      months: [
        {
          key: "2027-10",
          label: "10月",
          title: "ストック収益の極大化",
          actions: [
            "月額3〜5万のサポート契約を10〜12社へ",
            "チャーン時の即時補充営業の仕組み化",
          ],
          outcomes: ["継続収益の最大化"],
          kpis: { recurringClients: 10, recurringRevenue: 350000 },
        },
        {
          key: "2027-11",
          label: "11月",
          title: "営業の仕組み完成",
          actions: ["解約→新規埋めのプレイブック運用"],
          outcomes: ["安定した月商ライン"],
          kpis: { monthlyTarget: 550000 },
        },
        {
          key: "2027-12",
          label: "12月",
          title: "月商60万達成",
          actions: ["継続40万＋新規制作20万の設計"],
          outcomes: ["継続40万＋制作20万＝月商60万（手取り約40万）"],
          kpis: { monthlyTarget: 600000, takeHome: 400000 },
        },
        {
          key: "2028-01",
          label: "1月",
          title: "法人化の検討開始（卒業前）",
          actions: [
            "個人事業主→株式会社設立の調査",
            "税理士・開業届の整理",
          ],
          outcomes: ["法人化タイムライン確定"],
          kpis: {},
        },
        {
          key: "2028-02",
          label: "2月",
          title: "自社アプリプロトタイプ",
          actions: ["Exit 200M プロトタイプ完成に向けた開発"],
          outcomes: ["M&Aスタートラインのプロダクト版"],
          kpis: { productMilestone: "prototype" },
        },
        {
          key: "2028-03",
          label: "3月",
          title: "卒業・起業の節目",
          actions: [
            "大学卒業と同時の法人成り検討",
            "2億円M&Aに向けたスタートライン",
          ],
          outcomes: ["手取り40万の安定化・法人準備完了"],
          kpis: { monthlyTarget: 600000, takeHome: 400000 },
        },
      ],
      milestones: [
        { id: "p5-m1", text: "継続契約10社以上" },
        { id: "p5-m2", text: "月商60万・手取り40万達成" },
        { id: "p5-m3", text: "営業・補充の仕組み完成" },
        { id: "p5-m4", text: "法人化・M&A準備完了" },
      ],
    },
  ];

  const DM_TEMPLATES = [
    {
      id: "dm-2step",
      name: "2ステップDM（感想＋質問）",
      steps: [
        "【1通目】プロフィール・投稿への具体的な感想（2〜3行）",
        "【2通目】相手の課題に寄せた質問（集客・サイト・MEOなど）",
      ],
    },
    {
      id: "dm-follow",
      name: "フォローアップ",
      steps: [
        "前回のご返信ありがとうございます＋価値提供（事例URL）",
        "15分だけお話しできませんか？の軽いCTA",
      ],
    },
    {
      id: "dm-upsell",
      name: "継続提案（既存客）",
      steps: [
        "サイト公開後の成果・お客様の声の共有",
        "月額3万円でMEO・Instagram運用のご提案",
      ],
    },
  ];

  const QUICK_TASKS = [
    { id: "qt-dm", text: "DM 10件送信", category: "sales", phaseId: "p1" },
    { id: "qt-portfolio", text: "実績ページを更新", category: "delivery", phaseId: "p1" },
    { id: "qt-report", text: "継続クライアントへ月次レポート", category: "retention", phaseId: "p2" },
    { id: "qt-proposal", text: "15万円プラン提案書を送付", category: "sales", phaseId: "p2" },
    { id: "qt-product", text: "Exit 200M 開発 2時間", category: "product", phaseId: "p4" },
  ];

  function getCurrentPhaseKey(date = new Date()) {
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    for (const p of PHASES) {
      if (ym >= p.start && ym <= p.end) return p.id;
    }
    if (ym < PHASES[0].start) return PHASES[0].id;
    return PHASES[PHASES.length - 1].id;
  }

  function getMonthPlan(monthKey) {
    for (const p of PHASES) {
      const m = p.months.find((x) => x.key === monthKey);
      if (m) return { phase: p, month: m };
    }
    return null;
  }

  function createDefaultUserData() {
    const milestoneState = {};
    PHASES.forEach((p) => {
      p.milestones.forEach((m) => {
        milestoneState[m.id] = { done: false, doneAt: null };
      });
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      profile: {
        name: "",
        businessName: "Web制作・MEO",
        motto: "0→1、そしてストック収益へ",
      },
      settings: {
        ultimateMonthly: ULTIMATE.monthlyRevenue,
        ultimateTakeHome: ULTIMATE.takeHome,
        dmDailyGoal: 10,
        dmWeeklyGoal: 50,
        defaultTakeHomeRate: 67,
      },
      milestones: milestoneState,
      monthlyRecords: [],
      clients: [],
      salesLogs: [],
      tasks: QUICK_TASKS.map((t) => ({
        id: t.id,
        text: t.text,
        category: t.category,
        phaseId: t.phaseId,
        done: false,
        doneAt: null,
        createdAt: new Date().toISOString(),
      })),
      customTasks: [],
      notes: [],
      journal: [],
      trash: [],
      archives: [],
      monthOverrides: {},
      monthTargetOverrides: {},
      milestoneOverrides: {},
      customMilestones: [],
      customDmTemplates: [],
      hiddenDmTemplateIds: [],
      deletedDefaultTaskIds: [],
    };
  }

  function migrateUserData(saved) {
    const base = createDefaultUserData();
    if (!saved || typeof saved !== "object") return base;

    const out = { ...base, ...saved, schemaVersion: SCHEMA_VERSION };

    out.trash = Array.isArray(saved.trash) ? saved.trash : [];
    out.archives = Array.isArray(saved.archives) ? saved.archives : [];
    out.monthOverrides = saved.monthOverrides && typeof saved.monthOverrides === "object" ? saved.monthOverrides : {};
    out.monthTargetOverrides =
      saved.monthTargetOverrides && typeof saved.monthTargetOverrides === "object" ? saved.monthTargetOverrides : {};
    out.milestoneOverrides =
      saved.milestoneOverrides && typeof saved.milestoneOverrides === "object" ? saved.milestoneOverrides : {};
    out.customMilestones = Array.isArray(saved.customMilestones) ? saved.customMilestones : [];
    out.customDmTemplates = Array.isArray(saved.customDmTemplates) ? saved.customDmTemplates : [];
    out.hiddenDmTemplateIds = Array.isArray(saved.hiddenDmTemplateIds) ? saved.hiddenDmTemplateIds : [];
    out.deletedDefaultTaskIds = Array.isArray(saved.deletedDefaultTaskIds) ? saved.deletedDefaultTaskIds : [];

    out.profile = { ...base.profile, ...(saved.profile || {}) };
    out.settings = { ...base.settings, ...(saved.settings || {}) };
    if (out.settings.defaultTakeHomeRate == null) out.settings.defaultTakeHomeRate = 67;

    const mergedMilestones = { ...base.milestones };
    if (saved.milestones) {
      Object.keys(saved.milestones).forEach((id) => {
        if (mergedMilestones[id]) {
          mergedMilestones[id] = { ...mergedMilestones[id], ...saved.milestones[id] };
        } else {
          mergedMilestones[id] = saved.milestones[id];
        }
      });
    }
    out.milestones = mergedMilestones;

    out.monthlyRecords = Array.isArray(saved.monthlyRecords) ? saved.monthlyRecords : [];
    out.clients = Array.isArray(saved.clients) ? saved.clients : [];
    out.salesLogs = Array.isArray(saved.salesLogs) ? saved.salesLogs : [];
    out.customTasks = Array.isArray(saved.customTasks) ? saved.customTasks : [];
    out.notes = Array.isArray(saved.notes) ? saved.notes : [];
    out.journal = Array.isArray(saved.journal) ? saved.journal : [];

    if (Array.isArray(saved.tasks) && saved.tasks.length) {
      const byId = new Map(saved.tasks.map((t) => [t.id, t]));
      out.tasks = base.tasks.map((t) => ({ ...t, ...(byId.get(t.id) || {}) }));
      saved.tasks.forEach((t) => {
        if (!out.tasks.find((x) => x.id === t.id)) out.tasks.push(t);
      });
    }

    return out;
  }

  window.StartupDefaults = {
    SCHEMA_VERSION,
    STORAGE_KEY,
    META_KEY,
    ULTIMATE,
    PHASES,
    DM_TEMPLATES,
    QUICK_TASKS,
    getCurrentPhaseKey,
    getMonthPlan,
    createDefaultUserData,
    migrateUserData,
  };
})();
