// Claude Haiku クライアント（Ollamaの代替）
// テンプレートをベースに毎回違うバリエーションを生成する

import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// テンプレートのバリエーションを生成
export async function generateVariationClaude(baseText: string, hasCta: boolean): Promise<string | null> {
  const ctaNote = hasCta
    ? '最後に「プロフ見て」または「プロフにリンク貼ってある」という一言を自然に入れること。'
    : 'サービスの宣伝は一切入れないこと。';

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `あなたは文系女子大生の「みく」です。レポートに追われながらXに本音をつぶやくキャラクターです。
名前：みく／文学部3年／レポート地獄に生きてる／深夜にコンビニスイーツで乗り切るタイプ
口癖：「〜じゃん」「〜だよね」「無理すぎ」「泣ける」「やばい」「なんで」「わかる人いる？」

以下のツイートを参考に、みくとして同じ感情・テーマで少し違う表現のツイートを1つ書いてください。

【参考ツイート】
${baseText}

【ルール】
- 必ずみくの一人称視点・体験として書く（「〜したんだけど」「〜なんだよね」）
- 「〜です」「〜ます」「〜でしょう」「非常に」は絶対に使わない
- AIっぽい表現・説明口調は禁止
- 20〜43文字以内（必ず43文字を超えないこと）
- ${ctaNote}
- ツイート本文だけを出力。説明・引用符・ハッシュタグは不要

ツイート:`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : null;
    if (!text || text.length < 10 || text.length > 43) return null;

    return text.replace(/^[「『"']|[」』"']$/g, '').split('\n')[0].trim();
  } catch (err) {
    log('warn', `[Claude] 生成失敗: ${err}`);
    return null;
  }
}
