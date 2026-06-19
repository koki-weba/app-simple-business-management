/* Firebase 設定 — クラウド同期を使う場合のみ編集してください
 *
 * 1. https://console.firebase.google.com/ でプロジェクト作成
 * 2. Firestore Database を「テストモード」で作成
 * 3. プロジェクト設定 → ウェブアプリ追加 → 設定値を下記に貼り付け
 * 4. enabled を true に変更
 *
 * Firestore ルール例（本番前に要調整）:
 *   match /roadmaps/{syncId} {
 *     allow read, write: if syncId.matches('^[a-zA-Z0-9_-]{8,64}$');
 *   }
 */
window.FirebaseConfig = {
  enabled: false,
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
