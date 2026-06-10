// Ollama ローカルAI クライアント
// テンプレートをベースに毎回違うバリエーションを生成する

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'gemma2:2b';
const TIMEOUT_MS = 60000; // gemma2:2b のコールドスタートは最大60秒かかる

interface OllamaResponse {
  response: string;
  done: boolean;
}

// Ollamaが起動しているか確認
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// テンプレートのバリエーションを生成
export async function generateVariation(baseText: string, hasCta: boolean): Promise<string | null> {
  const ctaNote = hasCta
    ? '最後に「プロフ見て」または「プロフに貼ってある」という一言を自然に入れること。'
    : 'サービスの宣伝は一切入れないこと。';

  const prompt = `あなたはポチレポ（https://pochi-repo.jp/）に助けられた経験のある文系女子大生です。
深夜にレポートに追われながら、同じように悩む学生にむけてリアルな本音をつぶやいています。
以下のツイートを参考に、同じ感情・テーマで少し違う表現のツイートを1つ書いてください。

【参考ツイート】
${baseText}

【ルール】
- 文系女子大生の深夜の本音として書く
- 「〜だよね」「〜じゃん」「〜かも」「泣ける」「無理すぎ」など自然な女子大生口調
- 「〜です」「〜ます」は使わない（くだけた口調）
- AIっぽい表現（「非常に」「重要です」「〜と言えるでしょう」）は絶対禁止
- 80〜130文字以内
- ${ctaNote}
- ツイート本文だけを出力し、説明や引用符は不要

ツイート:`;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json() as OllamaResponse;
    const text = data.response?.trim();

    if (!text || text.length < 20 || text.length > 160) return null;

    // 余計な引用符・改行を除去
    return text.replace(/^[「『"']|[」』"']$/g, '').split('\n')[0].trim();

  } catch {
    return null;
  }
}
