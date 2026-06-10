// コメント返信生成（テンプレートベース）
// AIっぽさを出さない、大学生の自然な口調

interface ReplyTemplate {
  keywords: string[];
  replies: string[];
}

const REPLY_PATTERNS: ReplyTemplate[] = [
  {
    keywords: ['わかる', 'あるある', 'それな', '同じ', '共感'],
    replies: [
      'それめちゃくちゃわかります笑',
      'ですよね〜！ うちだけじゃなくて安心した',
      'それな。ほんとそれ',
      'わかりすぎて辛い笑',
    ],
  },
  {
    keywords: ['教授', '先生', '授業'],
    replies: [
      '教授によって全然違うんですよね〜',
      'それめちゃくちゃストレスですよね笑',
      '先生次第で難易度変わりすぎる',
    ],
  },
  {
    keywords: ['ChatGPT', 'GPT', 'AI', 'claude'],
    replies: [
      'AIそのまま出すのほんと怖いですよね',
      'ChatGPT、便利だけど出力が浅いことあるよな',
      'AI使うなら手直し必須ですよね',
    ],
  },
  {
    keywords: ['論文', 'CiNii', '参考文献', '引用'],
    replies: [
      '論文探し、ほんと時間かかりますよね',
      'CiNiiで日本語論文探すのむずい',
      '参考文献ちゃんとするの大変ですよね',
    ],
  },
  {
    keywords: ['締切', '提出', '間に合わない', 'やばい'],
    replies: [
      '頑張ってください！ うちも今日やばい',
      '締切前の追い込み、なぜか集中できますよね笑',
      '間に合いますように！！',
    ],
  },
  {
    keywords: ['深夜', '夜中', '眠い', '寝れない'],
    replies: [
      '深夜組、お疲れ様です笑',
      '深夜レポートの連帯感ありますよね',
      '夜中のレポート、なぜか集中できる不思議',
    ],
  },
  {
    keywords: ['ありがとう', 'ありがとございます', 'たすかる', '助かる'],
    replies: [
      'お役に立てたなら嬉しいです！',
      'ありがとうございます！ お互い頑張りましょう',
      '頑張ってください〜！',
    ],
  },
  {
    keywords: ['どこ', 'なに使って', 'おすすめ', 'サービス'],
    replies: [
      'プロフのリンクに貼ってます！',
      'プロフ見てみてください〜',
    ],
  },
];

const DEFAULT_REPLIES = [
  'わかります笑',
  'それ文系あるあるですよね',
  'コメントありがとうございます！',
  'ほんとそれって感じですよね',
  'お互い頑張りましょう〜',
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateReply(commentText: string): string {
  const lower = commentText.toLowerCase();

  for (const pattern of REPLY_PATTERNS) {
    const matched = pattern.keywords.some(kw => lower.includes(kw));
    if (matched) {
      return randomPick(pattern.replies);
    }
  }

  return randomPick(DEFAULT_REPLIES);
}
