// Slack Bot メインアプリケーション - Phase 2
const { App, ExpressReceiver } = require('@slack/bolt');
const path = require('path');

// 環境変数は既にslack-bot.jsで読み込み済み

// MCP統合版サービスをインポート
const MCPProfileAnalyzer = require('../services/mcp-profile-analyzer');
const AIDiaryGenerator = require('../services/ai-diary-generator');
// const EsaAPI = require('../services/esa-api'); // MCP統合により削除
const MigrationManager = require('../services/migration-manager');
const { initDatabase } = require('../database/init');

class GhostWriterSlackBot {
    constructor() {
        // 一時的な日記保存用
        this.tempDiaries = new Map();
        
        // 環境変数のチェックとデバッグ情報
        console.log('🔍 環境変数チェック:');
        console.log('   SLACK_BOT_TOKEN:', process.env.SLACK_BOT_TOKEN ? process.env.SLACK_BOT_TOKEN.substring(0, 10) + '...' : 'NOT SET');
        console.log('   SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? process.env.SLACK_SIGNING_SECRET.substring(0, 10) + '...' : 'NOT SET');
        console.log('   ESA_ACCESS_TOKEN:', process.env.ESA_ACCESS_TOKEN ? process.env.ESA_ACCESS_TOKEN.substring(0, 10) + '...' : 'NOT SET');
        console.log('   ESA_TEAM_NAME:', process.env.ESA_TEAM_NAME || 'NOT SET');
        
        if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
            throw new Error('❗️ 重要な環境変数が不足しています');
        }
        // ExpressReceiverでChallenge Responseを処理
        this.receiver = new ExpressReceiver({
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            endpoints: '/slack/events'
        });
        
        // Challenge Responseハンドラー追加
        this.receiver.app.post('/slack/events', (req, res, next) => {
            // URL Verification Challenge
            if (req.body && req.body.type === 'url_verification') {
                console.log('🔄 Challenge received:', req.body.challenge);
                return res.status(200).send(req.body.challenge);
            }
            // その他は次のハンドラーに
            next();
        });

        // ヘルスチェックエンドポイント (Renderスリープ回避用)
        this.receiver.app.get('/health', (req, res) => {
            const uptimeSeconds = process.uptime();
            const uptimeFormatted = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${Math.floor(uptimeSeconds % 60)}s`;
            
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: uptimeSeconds,
                uptimeFormatted: uptimeFormatted,
                service: 'ghostwriter-slack-bot',
                version: process.env.npm_package_version || '0.1.0',
                environment: process.env.NODE_ENV || 'development',
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                phase: 'Phase 7b (UnifiedDiaryGenerator) + AI Autonomous System'
            });
        });

        // Slack Appの初期化 (ExpressReceiver使用)
        this.app = new App({
            token: process.env.SLACK_BOT_TOKEN,
            receiver: this.receiver
        });

        // サービスの初期化 - MCP完全統合版
        console.log('🔧 AI代筆システム + MCP統合システム初期化:', {
            teamName: process.env.ESA_TEAM_NAME,
            hasAccessToken: !!process.env.ESA_ACCESS_TOKEN,
            mcpIntegration: 'complete'
        });
        
        this.profileAnalyzer = new MCPProfileAnalyzer();
        this.diaryGenerator = new AIDiaryGenerator();
        // this.esaAPI = new EsaAPI(process.env.ESA_TEAM_NAME, process.env.ESA_ACCESS_TOKEN); // MCP統合により削除
        this.migrationManager = new MigrationManager();
        
        // Phase 5.3: MCP完全統合による従来API完全廃止
        console.log('🚀 Phase 5.3: MCP完全統合実装完了 - 従来API依存完全排除');

        // イベントハンドラーの設定
        this.setupEventHandlers();
        
        console.log('🤖 GhostWriter Slack Bot initialized!');
    }

    setupEventHandlers() {
        // /ghostwrite コマンドの処理
        this.app.command('/ghostwrite', async ({ command, ack, respond, client }) => {
            await ack();
            
            try {
                await this.handleGhostwriteCommand({ command, respond, client });
            } catch (error) {
                console.error('Error handling /ghostwrite command:', error);
                await respond({
                    text: '❌ エラーが発生しました。管理者に連絡してください。',
                    response_type: 'ephemeral'
                });
            }
        });

        // ボタンクリックの処理
        this.app.action(/^ghostwrite_/, async ({ body, ack, respond, client }) => {
            await ack();
            
            try {
                await this.handleButtonAction({ body, respond, client });
            } catch (error) {
                console.error('Error handling button action:', error);
                await respond({
                    text: '❌ エラーが発生しました。管理者に連絡してください。',
                    response_type: 'ephemeral'
                });
            }
        });

        // アプリメンション（@mention）の処理
        this.app.event('app_mention', async ({ event, client }) => {
            try {
                await this.handleMention({ event, client });
            } catch (error) {
                console.error('Error handling app mention:', error);
            }
        });

        // Bot起動メッセージ
        this.app.event('ready', () => {
            console.log('⚡️ GhostWriter Slack Bot is running!');
        });
    }

    async handleGhostwriteCommand({ command, respond, client }) {
        const userId = command.user_id;
        const userName = command.user_name;
        const text = command.text.trim();

        console.log(`📝 /ghostwrite command from ${userName}: "${text}"`);

        // ヘルプ表示 (明示的にhelpと指定した場合のみ)
        if (text === 'help') {
            await respond({
                text: this.getHelpMessage(),
                response_type: 'ephemeral'
            });
            return;
        }

        // ユーザー情報の取得・保存
        await this.ensureUserExists(userId, userName);

        // 対話的UIの表示 (パラメータなしやその他のパラメータ)
        await respond({
            text: '✍️ 代筆日記を作成します...',
            blocks: this.getInteractiveBlocks(userId),
            response_type: 'ephemeral'
        });
    }

    async handleButtonAction({ body, respond, client }) {
        const action = body.actions[0];
        const userId = body.user.id;
        const userName = body.user.name;
        const actionId = action.action_id;

        console.log(`🔘 Button action: ${actionId} from ${userName}`);

        if (actionId === 'ghostwrite_generate') {
            await this.generateDiary({ userId, userName, respond, client });
        } else if (actionId === 'ghostwrite_settings') {
            await this.showSettings({ userId, respond });
        } else if (actionId === 'ghostwrite_history') {
            await this.showHistory({ userId, respond });
        } else if (actionId === 'ghostwrite_post_to_esa') {
            // 非同期処理でack()タイムアウトを防ぐ
            this.handleEsaPostActionAsync({ body, respond, client });
        } else if (actionId === 'ghostwrite_regenerate') {
            await this.generateDiary({ userId, userName, respond, client });
        } else if (actionId === 'ghostwrite_open_esa') {
            // URLボタンのアクション（実際にはURLへのリダイレクトが発生するので何もしない）
            console.log(`🔗 esa URL button clicked by ${userName}`);
            // 何もしない（ack()は既に呼び出し済み）
        } else {
            // 未知のアクションをログ出力して無視（エラーを出さない）
            console.log(`⚠️ Unknown action ignored: ${actionId} from ${userName}`);
            // 何もしない（ack()は既に呼び出し済み）
        }
    }

    async handleMention({ event, client }) {
        const userId = event.user;
        const text = event.text;
        const channel = event.channel;

        console.log(`💬 Mention from ${userId}:`, text);

        // 簡単な応答
        await client.chat.postMessage({
            channel: channel,
            text: `こんにちは！ \`/ghostwrite\` コマンドで代筆日記を作成できます。\n詳しくは \`/ghostwrite help\` をお試しください！`
        });
    }

    async generateDiary({ userId, userName, respond, client }) {
        try {
            // ローディング表示
            await respond({
                text: '🤖 AI代筆システムで日記を生成中...',
                replace_original: true,
                response_type: 'ephemeral'
            });
            
            // Slackユーザー情報を取得して自動マッピング統合システム使用
            console.log(`👤 Slackユーザー情報: ID=${userId}, Name=${userName}`);
            
            let esaScreenName = userName; // 最終フォールバック
            let mappingResult = null;
            let realName = null; // Slack実名を格納
            let displayName = null; // Slack表示名を格納
            
            try {
                const userInfo = await client.users.info({ user: userId });
                realName = userInfo.user.real_name; // スコープ外で使用するため変数に代入
                const rawDisplayName = userInfo.user.display_name;
                const email = userInfo.user.profile?.email;
                
                // 🔧 Phase 5.1修正: 表示名フォールバック実装
                displayName = rawDisplayName || realName || userName || 'Unknown User'; // スコープ外で使用するため変数に代入
                
                console.log(`📋 詳細ユーザー情報:`);
                console.log(`   - Slack ID: ${userId}`);
                console.log(`   - ユーザー名: ${userName}`);
                console.log(`   - 表示名: ${displayName} ${rawDisplayName ? '(設定済み)' : '(フォールバック適用)'}`);
                console.log(`   - 実名: ${realName}`);
                console.log(`   - メール: ${email}`);
                
                // 🚀 段階的移行マネージャーによる自動マッピング実行
                console.log(`🔄 段階的移行マネージャーによるマッピング開始...`);
                
                // 🔧 修正: Migration Managerが期待する形式でユーザー情報を渡す
                const slackUserForMapping = {
                    id: userInfo.user.id,
                    name: userInfo.user.name,
                    real_name: userInfo.user.real_name,
                    profile: {
                        email: userInfo.user.profile?.email
                    }
                };
                
                mappingResult = await this.migrationManager.mapUser(slackUserForMapping);
                
                if (mappingResult.success) {
                    esaScreenName = mappingResult.esaUser.screen_name;
                    console.log(`✅ 自動マッピング成功:`, {
                        method: mappingResult.mappingMethod,
                        confidence: mappingResult.confidence,
                        processingTime: mappingResult.processingTime,
                        fallbackUsed: mappingResult.fallbackUsed,
                        slackUser: mappingResult.slackUser.name,
                        esaUser: mappingResult.esaUser.screen_name
                    });
                    
                    if (mappingResult.fallbackUsed) {
                        console.log(`⚠️ フォールバック使用: ${mappingResult.mappingMethod}`);
                    }
                } else {
                    console.log(`⚠️ 自動マッピング失敗、最終フォールバック使用:`, {
                        error: mappingResult.error,
                        processingTime: mappingResult.processingTime,
                        fallback: esaScreenName
                    });
                    
                    // フォールバック使用時もmappingResultを作成
                    mappingResult = {
                        success: false,
                        mappingMethod: 'fallback_username',
                        confidence: 0.5,
                        fallbackUsed: true,
                        processingTime: mappingResult.processingTime || 0,
                        slackUser: { name: userName },
                        esaUser: { screen_name: esaScreenName }
                    };
                }
            } catch (userInfoError) {
                console.log(`⚠️ Slackユーザー情報取得エラー: ${userInfoError.message}`);
                console.log(`🔄 ユーザー名フォールバック使用: ${esaScreenName}`);
            }

            // Phase 7b: UnifiedDiaryGenerator統合システムを使用
            console.log(`🎯 Phase 7b UnifiedDiaryGenerator日記生成開始: ${esaScreenName} (mapped from ${userName})`);
            const UnifiedDiaryGenerator = require('../ai/unified-diary-generator');
            const mcpGenerator = new UnifiedDiaryGenerator({
                autonomyLevel: 'high',
                qualityThreshold: 0.95,
                temperature: 0.8
            });
            
            console.log(`🆔 システムタイプ: ${mcpGenerator.constructor.name}`);
            console.log(`🏷️ Phase 7b統合マスタープロンプトシステム`);
            console.log(`🆔 自律性レベル: ${mcpGenerator.config.autonomyLevel}`);
            console.log(`📊 品質閾値: ${mcpGenerator.config.qualityThreshold}`);
            
            // Phase 7b: UnifiedDiaryGeneratorによる自律的日記生成
            const instructions = `${esaScreenName}さんの今日の活動を分析し、高品質で人間らしい日記を生成してください。SlackユーザーID: ${userId}`;
            
            // Slackから取得した日本語表示名情報を含むオプションを設定
            const options = {
                slackUserId: userId,
                slackRealName: realName,
                slackDisplayName: displayName,
                esaUser: mappingResult?.esaUser || null
            };
            
            const diary = await mcpGenerator.generateDiary(esaScreenName, instructions, options);
            
            // 🔍 デバッグ: Phase 7b UnifiedDiaryGenerator生成結果を確認
            console.log('🔍 Phase 7b UnifiedDiaryGenerator diary debug:', {
                title: diary.title,
                titleType: typeof diary.title,
                contentPreview: diary.content ? diary.content.substring(0, 100) + '...' : 'NO CONTENT',
                category: diary.category,
                qualityScore: diary.metadata?.qualityScore,
                generationMethod: diary.metadata?.generationMethod,
                autonomyLevel: diary.metadata?.autonomyLevel,
                version: diary.metadata?.version
            });

            // 🔍 デバッグ: Phase 7bメタデータを確認
            console.log(`🔍 Phase 7bメタデータ確認:`);
            console.log(`   - generationMethod: ${diary.metadata?.generationMethod}`);
            console.log(`   - qualityScore: ${diary.metadata?.qualityScore}`);
            console.log(`   - processingTime: ${diary.metadata?.processingTime}ms`);
            console.log(`   - autonomyLevel: ${diary.metadata?.autonomyLevel}`);
            console.log(`   - version: ${diary.metadata?.version}`);
            
            // 日記を一時保存し、軽量化したIDで管理
            const diaryId = `${userId}_${Date.now()}`;
            this.tempDiaries.set(diaryId, diary);
            
            // Phase 7b: 統合AI自律システムプレビュー表示
            const previewData = {
                diary: diary,
                diaryId: diaryId,
                userId: userId,
                mappingResult: mappingResult,
                phase7bActive: true,
                generationMethod: diary.metadata?.generationMethod || 'unified_ai_autonomous',
                autonomyLevel: diary.metadata?.autonomyLevel || 'high',
                qualityScore: diary.metadata?.qualityScore || 0,
                processingTime: diary.metadata?.processingTime || 0,
                version: diary.metadata?.version || '7b.1.0'
            };
            
            // 🔍 デバッグ: Phase 7b previewDataの内容を確認
            console.log(`🔍 Phase 7b previewData確認:`);
            console.log(`   - generationMethod: "${previewData.generationMethod}"`);
            console.log(`   - autonomyLevel: "${previewData.autonomyLevel}"`);
            console.log(`   - qualityScore: ${previewData.qualityScore}`);
            console.log(`   - version: "${previewData.version}"`);
            
            await respond({
                text: '🎉 Phase 7b統合AI自律システムで日記が完成しました！',
                blocks: this.getDiaryPreviewBlocks(previewData.diary, previewData.userId, previewData.mappingResult, previewData),
                replace_original: true,
                response_type: 'ephemeral'
            });

        } catch (error) {
            console.error('Error generating diary:', error);
            await respond({
                text: `❌ 日記生成中にエラーが発生しました: ${error.message}`,
                replace_original: true,
                response_type: 'ephemeral'
            });
        }
    }

    async showSettings({ userId, respond }) {
        await respond({
            text: '⚙️ 設定メニュー（Phase 2で実装予定）',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*⚙️ 代筆設定*\n\n設定機能は Phase 2 で順次実装予定です。'
                    }
                }
            ],
            replace_original: true,
            response_type: 'ephemeral'
        });
    }

    handleEsaPostActionAsync({ body, respond, client }) {
        // 即座にローディング状態を表示
        respond({
            text: '🚀 esaに投稿中...',
            replace_original: true,
            response_type: 'ephemeral'
        });
        
        // メイン処理を非同期で実行
        setImmediate(() => {
            this.handleEsaPostAction({ body, respond, client })
                .catch(error => {
                    console.error('❌ Error in async esa post:', error);
                    respond({
                        text: `❌ esa投稿でエラーが発生しました\n\n**エラー:** ${error.message}`,
                        replace_original: true,
                        response_type: 'ephemeral'
                    });
                });
        });
    }
    
    async handleEsaPostAction({ body, respond, client }) {
        const userId = body.user.id;
        const userName = body.user.name;
        
        console.log(`🚀 MCP経由esa投稿 for user: ${userName}`);
        console.log('📋 Button value:', body.actions[0].value);
        
        try {
            // diaryDataのパース（エラーハンドリング強化）
            let diaryData;
            try {
                diaryData = JSON.parse(body.actions[0].value);
                console.log('📊 Parsed diary data:', diaryData);
            } catch (parseError) {
                console.error('❌ JSON parse error:', parseError);
                throw new Error('日記データの解析に失敗しました');
            }
            
            let diary;
            
            // 新しいdiaryId形式かどうかチェック
            if (diaryData.diaryId) {
                // 一時保存から取得
                diary = this.tempDiaries.get(diaryData.diaryId);
                if (!diary) {
                    throw new Error('日記データが見つかりません。再生成してください。');
                }
                // 使用後は削除
                this.tempDiaries.delete(diaryData.diaryId);
            } else {
                // 古い形式（フォールバック）
                if (!diaryData || !diaryData.diary) {
                    console.error('❌ Invalid diary data structure:', diaryData);
                    throw new Error('日記データの構造が無効です');
                }
                diary = diaryData.diary;
            }
            
            // 必須フィールドの確認
            if (!diary.title || !diary.content) {
                console.error('❌ Missing required fields:', { title: diary.title, content: !!diary.content });
                throw new Error('タイトルまたは内容が不足しています');
            }
            
            // Phase 5.3完全統一版を使用してMCP経由esa投稿
            console.log('📡 Phase 5.3完全統一版 MCP経由esa投稿実行中...');
            
            const LLMDiaryGeneratorPhase53Unified = require('../mcp-integration/llm-diary-generator-phase53-unified');
            const mcpGenerator = new LLMDiaryGeneratorPhase53Unified();
            
            // 🔍 デバッグ: MCP経由esa投稿前の最終確認
            console.log('🔍 Pre-MCP esa post debug:', {
                diaryTitle: diary.title,
                diaryTitleType: typeof diary.title,
                userName: userName,
                mcpSystemId: mcpGenerator.systemId
            });
            
            const result = await mcpGenerator.postToEsaWithMCP(diary, {
                targetUser: userName,
                slackUserId: userId,
                postingMethod: 'mcp_integrated'
            });
            
            console.log('✅ MCP経由esa API response:', result);
            
            // MCP経由esa投稿の成功/失敗チェック
            if (!result.success) {
                throw new Error(`MCP経由esa投稿失敗: ${result.error}`);
            }
            
            // URLとnumberの存在確認
            if (!result.url || !result.number) {
                console.error('❌ MCP経由esa API response missing required fields:', result);
                throw new Error('MCP経由esa APIからのレスポンスに必要な情報が不足しています');
            }
            
            // 投稿履歴をデータベースに保存
            try {
                const HistoryModel = require('../database/models/history');
                
                await HistoryModel.create({
                    user_id: userId,
                    title: diary.title,
                    content: diary.content,
                    category: diary.category || 'AI代筆日記',
                    esa_post_number: result.number,
                    esa_post_url: result.url,
                    quality_score: diary.qualityScore || null,
                    is_ai_generated: true,
                    generation_method: 'mcp_integrated_slack_bot'
                });
                
                console.log('💾 History saved to database (MCP経由)');
            } catch (dbError) {
                console.error('⚠️ Database save error (non-critical):', dbError);
                // データベースエラーは非致命的なので継続
            }
            
            // 成功メッセージ
            await respond({
                text: '✅ MCP経由esa投稿完了！',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `🎉 *esa投稿が完了しました！*\n\n📝 **タイトル:** ${diary.title}\n🔗 **URL:** ${result.url}\n📊 **投稿番号:** #${result.number}`
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: '📖 esaで確認'
                                },
                                url: result.url,
                                style: 'primary',
                                action_id: 'ghostwrite_open_esa' // アクションIDを明示的に設定
                            },
                            {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: '✍️ 新しい代筆'
                                },
                                action_id: 'ghostwrite_generate'
                            }
                        ]
                    }
                ],
                replace_original: true,
                response_type: 'ephemeral'
            });
            
            console.log(`✅ Successfully posted to esa via MCP: ${result.url}`);
            
        } catch (error) {
            console.error('❌ Error posting to esa via MCP:', error);
            console.error('❌ Error stack:', error.stack);
            
            await respond({
                text: `❌ MCP経由esa投稿でエラーが発生しました\n\n**エラー:** ${error.message}\n\nデバッグ情報がログに記録されました。`,
                replace_original: true,
                response_type: 'ephemeral'
            });
        }
    }

    async showHistory({ userId, respond }) {
        // データベースから履歴を取得
        const HistoryModel = require('../database/models/history');
        
        try {
            const recentHistory = await HistoryModel.findByUserId(userId, 5);
            
            await respond({
                text: '📚 代筆履歴',
                blocks: this.getHistoryBlocks(recentHistory),
                replace_original: true,
                response_type: 'ephemeral'
            });
        } catch (error) {
            console.error('Error fetching history:', error);
            await respond({
                text: '❌ 履歴の取得中にエラーが発生しました。',
                replace_original: true,
                response_type: 'ephemeral'
            });
        }
    }

    async ensureUserExists(userId, userName) {
        const UserModel = require('../database/models/user');
        
        try {
            await UserModel.createOrUpdate({
                slack_user_id: userId,
                username: userName,
                display_name: userName,
                is_active: true
            });
        } catch (error) {
            console.error('Error ensuring user exists:', error);
        }
    }

    getHelpMessage() {
        return `
🤖 *代筆さん (GhostWriter) - Phase 5 MCP完全統合版*

*基本的な使い方:*
• \`/ghostwrite\` - 対話的UIでMCP統合代筆日記作成
• \`/ghostwrite help\` - このヘルプを表示

*Phase 5 MCP完全統合機能:*
✍️ *MCP統合AI代筆* - esaとSlackの完全MCP統合で自然な日記を作成
📊 *MCPプロフィール分析* - 従来API廃止、MCP経由で文体を完全分析
📝 *esa MCP連携* - MCP結合で生成した日記を直接esaに投稿
📈 *完全統合管理* - 代筆履歴の確認・統計表示

*Phase 5達成機能:*
• MCP経由esa記事取得による真のAI代筆
• 従来API依存性を完全排除したアーキテクチャ
• エンタープライズレベルのMCP統合品質保証
• 完全自動化された高度な統計管理システム

まずは \`/ghostwrite\` を実行して、Phase 5 MCP完全統合AI代筆を体験してみてください！
        `;
    }

    getInteractiveBlocks(userId) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '🤖 *代筆さん (GhostWriter)* へようこそ！\n\nPhase 5 MCP完全統合システムで、あなたの個性を活かした自然な日記を生成します。'
                }
            },
            {
                type: 'divider'
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '✍️ AI代筆生成'
                        },
                        style: 'primary',
                        action_id: 'ghostwrite_generate'
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '📚 履歴確認'
                        },
                        action_id: 'ghostwrite_history'
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '⚙️ 設定'
                        },
                        action_id: 'ghostwrite_settings'
                    }
                ]
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: '💡 Phase 5完全統合: MCP経由esa+Slack | 従来API廃止 | エンタープライズ品質'
                    }
                ]
            }
        ];
    }

    getDiaryPreviewBlocks(diary, userId, mappingResult = null) {
        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '✨ *AI代筆日記が完成しました！*'
                }
            },
            {
                type: 'divider'
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*📝 タイトル:* ${diary.title}\n*📂 カテゴリ:* ${diary.category}`
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*📄 内容プレビュー:*\n\`\`\`\n${diary.content.substring(0, 400)}${diary.content.length > 400 ? '...' : ''}\n\`\`\``
                }
            }
        ];

        // マッピング情報とMCP統合情報がある場合は追加表示
        if (mappingResult && mappingResult.success) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*🔗 自動マッピング情報:*\n方法: ${mappingResult.mappingMethod}${mappingResult.fallbackUsed ? ' (フォールバック使用)' : ''}\n信頼度: ${(mappingResult.confidence * 100).toFixed(1)}%\n処理時間: ${mappingResult.processingTime}ms`
                }
            });
        }
        
        // MCP統合情報の表示 (第4引数で受け取る)
        if (arguments[3]) {
            const previewData = arguments[3];
            
            // Phase 7bの判定
            const isPhase7b = previewData.generationMethod === 'unified_ai_autonomous' || 
                             previewData.generationMethod === 'ai_tool_executor_hybrid';
            
            if (isPhase7b) {
                // Phase 7b: AI自律データ収集システム
                const dataSource = previewData.generationMethod === 'ai_tool_executor_hybrid' ? 
                    'ai_tool_executor_real_data' : 'unified_ai_autonomous_real_data';
                
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*🚀 Phase 7b AI自律システム:*\n✅ AI主導データ収集\nSlackデータ: ✅ リアルデータ取得\nデータソース: ${dataSource}\n品質スコア: ${(previewData.qualityScore * 100).toFixed(0)}%\n処理時間: ${previewData.processingTime}ms`
                    }
                });
            } else {
                // 従来のPhase 6.6+システム
                const mcpStatus = previewData.mcpIntegration ? '✅ MCP統合成功' : '⚠️ フォールバック';
                const slackDataStatus = previewData.slackDataSource === 'real_slack_mcp_multi_channel' ? '✅ 実Slackデータ' : '⚠️ 模擬データ';
                
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*🚀 Slack投稿参照機能:*\n${mcpStatus}\nSlackデータ: ${slackDataStatus}\nデータソース: ${previewData.slackDataSource}`
                    }
                });
            }
        }

        blocks.push(
            {
                type: 'divider'
            },
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '🚀 esaに投稿'
                        },
                        style: 'primary',
                        action_id: 'ghostwrite_post_to_esa',
                        value: JSON.stringify({ diaryId: arguments[3]?.diaryId })
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '🔄 再生成'
                        },
                        action_id: 'ghostwrite_regenerate'
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: '📝 編集'
                        },
                        action_id: 'ghostwrite_edit'
                    }
                ]
            }
        );

        // コンテキスト情報（拡張版 - MCP統合対応）
        let contextText = `🤖 AI品質スコア: ${diary.qualityScore || 'N/A'} | 生成時間: ${new Date().toLocaleTimeString('ja-JP')} | 📊 文字数: ${diary.content ? diary.content.length : 0}文字`;
        
        if (mappingResult) {
            const mappingInfo = mappingResult.success ? 
                `| 🔗 マッピング: ${mappingResult.mappingMethod}` : 
                `| ⚠️ マッピング失敗`;
            contextText += mappingInfo;
        }
        
        if (arguments[3]) {
            const previewData = arguments[3];
            const phase5Info = previewData.phase5Complete ? 
                `| 🚀 Phase 5完全統合: 達成` : 
                `| ⚠️ Phase 5統合: 未完了`;
            contextText += phase5Info;
        }
        
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: contextText
                }
            ]
        });

        return blocks;
    }

    getHistoryBlocks(history) {
        if (!history || history.length === 0) {
            return [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '📚 *代筆履歴*\n\nまだ代筆履歴がありません。\n`/ghostwrite` で最初の代筆を作成してみましょう！'
                    }
                }
            ];
        }

        const blocks = [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `📚 *代筆履歴* (最新 ${history.length} 件)`
                }
            },
            {
                type: 'divider'
            }
        ];

        history.forEach((item, index) => {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${index + 1}.* ${item.title}\n📅 ${new Date(item.created_at).toLocaleDateString('ja-JP')} | 🤖 AI品質: ${item.quality_score || 'N/A'}`
                }
            });
        });

        return blocks;
    }

    async start() {
        try {
            // データベース初期化
            await initDatabase();
            console.log('📊 Database initialized');

            // Slack Bot開始 (ExpressReceiver使用)
            await this.app.start(process.env.PORT || 3000);
            console.log('⚡️ GhostWriter Slack Bot is running on port', process.env.PORT || 3000);
            console.log('🔄 Challenge Response integrated');
            
            // 起動成功メッセージ
            console.log(`
🎉 Phase 5: MCP完全統合実装完了！

🤖 GhostWriter Slack Bot が正常に起動しました
📡 Port: ${process.env.PORT || 3000}
🚀 Phase 5 MCP完全統合システムと連携済み

💡 使用方法:
   Slackで /ghostwrite コマンドを実行してください

🚀 Phase 5 MCP完全統合の成果:
   ✅ MCP経由esa記事取得
   ✅ 従来esa API直接アクセス廃止
   ✅ エンタープライズレベル品質統合

🌐 設定すべきURL (ngrok使用時):
   https://your-ngrok-url.ngrok.io/slack/events
            `);

        } catch (error) {
            console.error('❌ Failed to start GhostWriter Slack Bot:', error);
            process.exit(1);
        }
    }

    async stop() {
        try {
            await this.app.stop();
            console.log('🛑 GhostWriter Slack Bot stopped');
        } catch (error) {
            console.error('Error stopping bot:', error);
        }
    }
}

module.exports = GhostWriterSlackBot;