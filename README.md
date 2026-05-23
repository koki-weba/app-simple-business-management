# 起業ロードマップ管理 PWA

2026年5月〜2028年3月の5期間起業計画を、スマホアプリのように管理するプログレッシブWebアプリです。

## 機能

- **ホーム** — 最終目標（月商60万）への進捗、今月フォーカス、クイック記録
- **ロードマップ** — 5期間・各月の行動・成果・マイルストーン
- **KPI** — 月次売上グラフ、手取りシミュレーション
- **営業** — DM日次/週次トラッカー、テンプレート、営業ログ
- **案件** — クライアント管理、お客様の声
- **タスク** — フェーズ連動タスク、戦略メモ
- **設定** — 目標値、JSONエクスポート/インポート

## データの永続化

ユーザーデータは `localStorage` の **`startupRoadmap_userData_v3`** に保存されます。  
アプリの HTML/CSS/JS を更新しても、このキーは変わらないため **記録は端末に残ります**。

念のため定期的に **設定 → エクスポート** でバックアップしてください。

## GitHub Pages で公開

1. リポジトリを GitHub に push
2. Settings → Pages → Source: **GitHub Actions**
3. `main` ブランチへ push すると自動デプロイ

ローカル確認:

```bash
npx serve .
```

## ホーム画面に追加（iOS / Android）

1. Safari / Chrome で公開URLを開く
2. 共有メニュー → **ホーム画面に追加**
3. スタンドアロンで起動

## ファイル構成

```
index.html      # UI
styles.css      # 白×青デザイン
app.js          # ロジック
defaults.js     # ロードマップ定義・マイグレーション
manifest.json   # PWA
sw.js           # オフラインキャッシュ
icons/icon.svg
```

## 技術

- HTML / CSS / JavaScript（ビルド不要）
- Chart.js（CDN）
- Service Worker + Web App Manifest
