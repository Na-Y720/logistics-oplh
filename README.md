# 物流アプリ 開発・保守

物流部の業務アプリを管理する正式リポジトリです。開発・修正依頼は「物流アプリ開発・保守」のチャットに集約し、現在の実装と確認事項は以下の台帳で引き継ぎます。

- [アプリ一覧・公開URL・変更先](docs/APP_CATALOG.md)
- [引継ぎ台帳：仕様・認証・データ連携・修正手順](docs/HANDOVER.md)
- [未解決・要確認事項](docs/OPEN_ITEMS.md)
- [保守変更履歴](docs/CHANGELOG.md)

本番ポータル：https://logistics-oplh.vercel.app/portal

- ソース管理：このリポジトリの `main`
- 公開：Vercel（GitHub連携で自動デプロイ）
- 認証・データ：Supabase
- Wロケ補充指示：https://logistics-oplh.vercel.app/w-location/

台帳は2026-11-27に現行コードとDB構成を照合して初期整備しました。別管理のアプリや未検証事項は区別して記録しています。過去チャットの内容だけで実装状態を断定せず、修正の際は最新コードと対象データを確認してください。
