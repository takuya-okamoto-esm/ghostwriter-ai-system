# CLAUDE.md

このファイルはClaude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## よく使用するコマンド

### 開発・テスト用コマンド

```bash
# メイン開発コマンド
npm run dev                    # nodemonでMCPシステムを起動（デフォルト開発環境）
npm run slack                  # Slackボットのみ起動
npm run slack:dev             # nodemonでSlackボット起動
npm start                     # 本番環境でMCPシステム起動

# テスト用コマンド
npm test                      # メインテスト実行（src/index.js）
npm run test:slack            # Slackボット機能テスト
npm run test:ai               # AI統合テスト
npm run test:post             # 実際のesa投稿テスト
npm run test:mapping          # ユーザーマッピングテスト
npm run mcp:test              # MCPシステム統合テスト

# データベース操作
npm run reset:db              # データベースリセット
npm run test:db               # データベース接続テスト

# 品質保証
npm run lint                  # ESLint実行
npm run lint:fix              # ESLint自動修正
```

### 本番環境用コマンド

```bash
# メイン本番エントリーポイント
node src/mcp-integration/llm-diary-generator-phase53-unified.js  # コアAI日記生成器
node src/slack-bot.js                                           # Slackボット起動
node src/index.js                                              # データベーステスト
```

## プロジェクトアーキテクチャ

### コアシステム概要

GhostWriterは、ユーザーのSlack活動とesa記事を分析して個人化された日記エントリを生成するAI搭載Slackボットです。シームレスなデータ統合にはMCP（Model Context Protocol）を使用し、AI生成にはOpenAI GPT-4o-miniを使用しています。

### 主要アーキテクチャコンポーネント

#### 1. **エントリーポイント**

- `src/slack-bot.js` - 環境検証付きSlackボット起動
- `src/mcp-integration/llm-diary-generator-phase53-unified.js` - コアAI日記生成器（Phase 6.6+）
- `src/index.js` - データベーステスト用メインアプリケーション

#### 2. **MCP統合レイヤー**（`src/mcp-integration/`）

- `mcp-connection-manager.js` - MCPプロトコル接続管理
- `slack-keyword-extractor.js` - 高度なSlackデータ分析（Phase 6）
- `slack-mcp-wrapper-direct.js` - 直接Slack API統合

#### 3. **データベースレイヤー**（`src/database/`）

- デュアルデータベースサポート: PostgreSQL（本番）/ SQLite（開発）
- `init.js` - データベース接続とテーブル初期化
- `models/` - ユーザー、プロフィール、履歴モデル

#### 4. **AIサービス**（`src/services/`）

- `ai-diary-generator.js` - コア日記生成ロジック
- `mcp-profile-analyzer.js` - ユーザープロフィール分析
- `migration-manager.js` - データ移行ユーティリティ

#### 5. **Slack統合**（`src/slack/`）

- `app.js` - Slack Boltフレームワーク設定

### データフロー

1. **Slackデータ収集** → マルチチャンネルメッセージ分析（8チャンネル）
2. **esa記事分析** → 過去の文章パターン抽出（27キーワード、2700%改善）
3. **プロフィール構築** → ユーザー固有の文体モデリング
4. **AI生成** → GPT-4o-mini（temperature=0.8）で50:50 esa/Slackバランス
5. **品質保証** → クロス汚染防止と品質スコアリング
6. **esa投稿** → カテゴリ分類による自動投稿

## 環境設定

### 必須環境変数

```bash
# コア統合
ESA_ACCESS_TOKEN       # esa API認証
ESA_TEAM_NAME          # esaチーム識別子
OPENAI_API_KEY         # OpenAI GPT統合
SLACK_BOT_TOKEN        # Slackボット認証
SLACK_SIGNING_SECRET   # Slackセキュリティ検証

# データベース（本番）
DATABASE_URL           # PostgreSQL接続文字列
DB_TYPE=postgresql     # データベースタイプ選択

# オプション統合
GOOGLE_CLIENT_ID       # Googleカレンダー統合
```

### 環境ファイル

- `.env.example` - 開発用テンプレート
- `.env.render` - Renderプラットフォーム用本番設定
- `.env.local` - ローカル開発用オーバーライド

## 開発ワークフロー

### フェーズシステム

プロジェクトはフェーズベースの開発アプローチを使用しています。現在の状態は**Phase 6.6+**（メンテナンスモード）です。

### 主要機能（Phase 6.6+）

- **クロス汚染防止**: ユーザー固有のコンテンツ分離
- **高度キーワード抽出**: 27キーワード vs 従来の1（2700%改善）
- **50:50データバランス**: esa記事 + Slackデータの最適統合
- **品質メトリクス**: 透明な生成品質スコアリング
- **日常体験優先**: etc-spotsと人間的体験への注力

### データベース考慮事項

- 開発ではSQLiteを使用（`src/database/ghostwriter.db`）
- 本番ではRenderプラットフォーム上のPostgreSQLを使用
- データベースモデルは`DB_TYPE`環境変数により両システムをサポート
- 移行ユーティリティは`src/services/migration-manager.js`で利用可能

### AI生成パイプライン

1. **データソース**: Slack（8チャンネル）+ esa（過去記事）
2. **キーワード抽出**: 4カテゴリ分析（日常体験、技術、ビジネス、感情）
3. **プロフィール分析**: ユーザー固有文体モデリング
4. **AI生成**: 創造性のためのGPT-4o-mini temperature=0.8
5. **品質スコアリング**: 汚染防止付き5段階評価
6. **フッター生成**: 透明性メトリクス付き動的メタデータ

## テスト戦略

### テストカテゴリ

- **統合テスト**（`tests/integration/`）- フルシステムテスト
- **単体テスト**（`tests/unit/`）- コンポーネント固有テスト
- **フェーズテスト**（`tests/phase-tests/`）- フェーズ固有検証

### 主要テストファイル

- `tests/integration/slack-mcp-integration.js` - Slack MCP統合テスト
- `tests/test-phase53-complete.js` - Phase 53完了検証
- `scripts/test-contamination-fix.js` - クロス汚染防止テスト

## プロジェクト構造ガイドライン

### 現在のフェーズ状態

**Phase 7b** (2025-06-24完了) - AI完全自律実行システム実装済み
- Phase 7cは不要判定（7bで目標達成）
- メンテナンスモードへ移行

### ドキュメント構成（2025-06-24 整理済み）

```
docs/
├── README.md                 # 📁 メインナビゲーションガイド
├── planning/                 # 📋 計画・仕様・戦略
│   ├── phase-plans/         # フェーズ実装計画書
│   ├── architecture/        # システムアーキテクチャ設計
│   └── strategies/          # 技術戦略
├── technical/               # 🔧 技術ドキュメント・調査
│   ├── investigations/      # 技術調査レポート
│   ├── implementation-guides/ # セットアップ・開発ガイド
│   └── system-analysis/     # システム分析レポート
├── reports/                 # 📊 進捗・完了レポート
│   ├── phase-reports/       # フェーズ完了レポート
│   ├── completion-reports/  # 機能完了レポート
│   └── analysis-reports/    # 分析・比較レポート
├── project-management/      # 🗂️ プロセス・デプロイメント
│   ├── handovers/          # 作業引き継ぎドキュメント
│   ├── commit-guides/      # コミット・gitガイドライン
│   └── deployment/         # デプロイメント手順
└── archive/                # 📦 レガシー・廃止文書
    ├── legacy-docs/        # 旧バージョンドキュメント
    ├── deprecated/         # 廃止された仕様
    └── old-phases/         # 過去のフェーズドキュメント
```

#### ドキュメント配置ルール

**新規ドキュメント作成時は以下の分類に従って適切なディレクトリに配置してください：**

1. **計画・仕様** → `docs/planning/`
   - 実装計画書、設計書、技術戦略
   - 例: Phase計画書、アーキテクチャ設計

2. **技術調査・実装** → `docs/technical/`
   - 技術調査レポート、実装ガイド、分析
   - 例: Slack統合調査、MCP調査レポート

3. **進捗・完了報告** → `docs/reports/`
   - フェーズ完了報告、機能実装完了、比較分析
   - 例: Phase 7完了サマリー、品質分析レポート

4. **開発プロセス** → `docs/project-management/`
   - 引き継ぎ、コミット手順、デプロイメント
   - 例: CHAT_HANDOVER_*, コミットガイド

5. **過去資料** → `docs/archive/`
   - 廃止された仕様、旧バージョン、レガシーコード
   - 例: Phase 4/5/53のドキュメント

#### ファイル命名規則

- **日付形式**: `YYYY-MM-DD` (例: `2025-06-24`)
- **大文字開始**: 重要なドキュメントは大文字で開始
- **アンダースコア**: 単語区切りに使用
- **説明的な名前**: 内容が明確に分かる名前を使用

#### 検索ガイド

- 📋 **計画を見たい** → `docs/planning/`
- 🔧 **技術詳細を知りたい** → `docs/technical/`
- 📊 **進捗を確認したい** → `docs/reports/`
- 🗂️ **開発プロセス** → `docs/project-management/`
- 📦 **過去の情報** → `docs/archive/`

### コード構成

- 関心事の明確な分離によるモジュラーアーキテクチャ
- 外部API管理のためのMCP統合レイヤー
- 複数データベースタイプをサポートするデータベース抽象化
- 包括的なエラーハンドリングとログ記録

### デプロイメント

- **プラットフォーム**: Render（esminc-its組織）
- **データベース**: Render PostgreSQL
- **ヘルスチェック**: 自動監視システム
- **CI/CD**: `scripts/`ディレクトリ内のスクリプトベースデプロイメント

## プロジェクト管理ガイドライン

### ファイル配置ルール

#### プロジェクトルート直下の整理

プロジェクトルート直下は最小限に保ち、開発・デバッグ・テストファイルは適切なディレクトリに配置する：

```
推奨ファイル配置:
├── src/                    # メインソースコード（触らない）
├── tools/                  # 開発ツール・ユーティリティ
│   ├── test/              # テスト・デバッグファイル
│   │   ├── test-*.js      # 各種テストスクリプト
│   │   └── debug-*.js     # デバッグ用スクリプト
│   ├── debug/             # デバッグツール
│   └── setup/             # セットアップツール
├── docs/                  # ドキュメント（整理済み構造使用）
│   ├── planning/          # 計画・仕様・戦略
│   ├── technical/         # 技術ドキュメント・調査レポート
│   ├── reports/           # 進捗・完了レポート
│   ├── project-management/ # プロセス・デプロイメント
│   └── archive/           # レガシー・廃止文書
├── tests/                 # テストスイート
├── scripts/               # デプロイ・運用スクリプト
├── config/                # 設定ファイル
└── logs/                  # ログファイル
```

#### ファイル移動時の注意点

1. **requireパスの修正**: ファイル移動後は相対パスを正しく修正
   ```javascript
   // 移動前: require('./src/services/...')
   // 移動後: require('../../src/services/...')
   ```

2. **src配下の保護**: `/src`配下のファイルは基本的に移動・変更しない

3. **段階的移動**: 関連ファイルをグループ化して移動

### README.md 執筆ガイドライン

#### 基本原則

1. **客観的・プロフェッショナルな表現**
   ```markdown
   ❌ 避けるべき表現:
   - 「劇的な改善効果」「完全化」「大幅向上」
   - 感情的・主観的な修飾語
   
   ✅ 推奨表現:
   - 「改善」「対応」「実装」「向上」
   - 具体的数値での客観的記述
   ```

2. **現在の実装状況を正確に反映**
   - フェーズ番号の正確性（Phase 6.6+ → Phase 6.7）
   - 実装済み機能のみを記載
   - 予定・計画ではなく完了済み内容を記述

3. **技術仕様の明確性**
   - アーキテクチャ図の更新
   - コンポーネント名の正確性
   - バージョン情報の最新化

#### 更新が必要な主要セクション

1. **フェーズ更新時**
   - タイトルのフェーズ番号
   - 主要機能セクション
   - アーキテクチャ図
   - コンポーネント説明

2. **新機能追加時**
   - 機能一覧への追加
   - 生成例の更新
   - 技術スタックの変更

3. **プロジェクト構造変更時**
   - ファイル構造図の更新
   - パス例の修正

#### READMEメンテナンス手順

1. 実装変更後、即座にREADME確認
2. 主観的表現のチェック・修正
3. 技術仕様の整合性確認
4. フェーズ情報の更新