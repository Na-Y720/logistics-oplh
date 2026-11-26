# 物流アプリ一覧

最終棚卸：2026-11-27（日本時間）。開発・保守の依頼窓口は、この台帳の整備を依頼した「物流アプリ開発・保守」のチャット。チャット名の変更・過去チャットの統合操作自体は未実施。

この一覧は現行コードとデータベース定義の対応を確認したもの。全画面の実業務操作を改めて検証したという意味ではない。詳しい仕様・権限・変更手順は [引継ぎ台帳](HANDOVER.md)、未解決・要確認は [確認事項](OPEN_ITEMS.md) を参照。

## 現行リポジトリで管理するアプリ・画面

公開基点：`https://logistics-oplh.vercel.app`。配布するURLには個人名を含むホスト名を使用しない。

| ID | アプリ・画面 | 公開URL | 主な役割 | 主な変更先 |
|---|---|---|---|---|
| APP-01 | 物流アプリポータル | https://logistics-oplh.vercel.app/portal | 各業務画面と共通取込への入口 | `portal.html`, `portal.css` |
| APP-02 | 月間人時・OPLH・シフト・従業員マスタ | https://logistics-oplh.vercel.app/ | 月度別必要人時・出勤条件・自動シフト | `index.html`, `core.js`, `app.js`, `shift.js`, `shift-enhancements.js`, `master-days-fix.js`, `auth-persist.js` |
| APP-03 | 物流パート作業時間管理 | https://logistics-oplh.vercel.app/worktime | 日別作業時間、派遣・タイミー時間 | `worktime.html`, `worktime.js`, `timee.js`, `timee-model.js`, `timee-history-ui.js`, `timee-history-model.js` |
| APP-04 | 物流コスト管理・共通データ取込 | https://logistics-oplh.vercel.app/cost | 配送費・資材費・月次指標・CSV等の取込と取消 | `cost.html`, `cost.js`, `cost-size-trends.js`, `sagawa-sizes.js`, `api/parse-pdf.js` |
| APP-05 | WMS作業分析 | https://logistics-oplh.vercel.app/wms | 作業別数量・時間・個人生産性・順位 | `wms.html`, `wms.js`, `wms-ranking.js` |
| APP-06 | 梱包詳細 | https://logistics-oplh.vercel.app/packing | 手梱包・自動梱包の時間と実績 | `packing.html`, `packing.js` |
| APP-07 | CS日報・集計・シフト | https://logistics-oplh.vercel.app/cs | 対応数・初回解決率・週月推移・CSシフト | `cs.html`, `cs.js`, `cs-trends.js`, `cs-shift.js` |
| APP-08 | 棚卸し差異検証 | https://logistics-oplh.vercel.app/inventory | 棚卸し開始前在庫と時間内の調整履歴を照合 | `inventory.html`, `inventory.js`, `inventory-core.js`, `inventory-schema.sql` |
| APP-09 | 人員配置ボード | https://logistics-oplh.vercel.app/staff-board | エリア・時間帯への人員配置、勤務情報の参照 | `staff-board.html`, `staff-board.js`, `staff-board-core.js`, `staff-board*.sql` |
| APP-10 | Wロケ補充指示 | https://logistics-oplh.vercel.app/w-location/ | SKU照合、移動元・移動先決定、Excel・CSV出力、参照CSV共有 | `w-location/index.html`, `app.js`, `core.js`, `storage.js`, `cloud-auth.js`, `excel.js`（すべて同フォルダ） |

共通取込の入口は https://logistics-oplh.vercel.app/cost?tab=timedesigner 。従業員マスタは https://logistics-oplh.vercel.app/?tab=master 。ポータルは入口であり、取込処理そのものは `cost.js` が担当する。

## 別管理・管理先の確認が必要なもの

| ID | 対象 | 現在分かっていること | 確認状況・次に必要なこと |
|---|---|---|---|
| EXT-01 | 365日出荷予測 | ポータル掲載先は https://logistics-forecast365.vercel.app/ 。シフトは `forecast365_daily` を参照 | 外部URLの掲載とDB参照は確認。予測アプリの現行ソース・公開プロジェクトは今回取得できていない |
| EXT-02 | 送り状CSV変換（e飛伝・ゆうプリR） | 過去に単体HTMLを作成した経緯あり | 現行配布ファイル・最新版・管理先を未確認。記憶にあるファイル名を最新版と断定しない |
| EXT-03 | ロケ札・バーコードラベル作成 | 過去にPDF等の成果物を作成した経緯あり | 常設アプリか都度生成物か、現行原本を未確認 |
| EXT-04 | DAS・パスソートラベル | 過去にラベル作成・改善検討を実施 | 現行コード・常設公開先を未確認。分析依頼とアプリ実装を区別する |
| EXT-05 | 資材在庫ログ可視化・発注計画 | 過去にExcel成果物を作成した経緯あり | 現行成果物を未確認。現時点ではWebアプリ一覧に混ぜない |

「OPLH分析アプリ」「WMS作業分析」など過去の呼称が異なるものは、まずAPP-05との関係を確認する。別アプリが存在するという理由だけで重複登録しない。
