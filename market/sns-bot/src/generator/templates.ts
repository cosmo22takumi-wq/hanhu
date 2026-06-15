export type Category =
  | 'report_struggle'
  | 'chatgpt_shallow'
  | 'professor_aru'
  | 'deadline_panic'
  | 'ai_smell'
  | 'citation_hell'
  | 'university_vibe'
  | 'latenight'
  | 'daily_life'
  | 'self_made_app';

export interface Template {
  category: Category;
  content: string;
  has_cta: boolean;
  weight: number;
}

// 文系大学生の深夜の本音。売り込みゼロ。共感100%。
export const TEMPLATES: Template[] = [

  // ──────── レポートあるある ────────
  {
    category: 'report_struggle',
    content: '「序論・本論・結論」の構成、頭ではわかってるけどいざ書くと序論だけで1000文字いく',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: 'レポートの「はじめに」だけ書いて謎の達成感に浸ってる深夜1時',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: '参考文献のページ数確認してたら1時間経ってた。内容より書式に時間かかってる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: '「自分の考えを述べよ」って言われても大学1年生に独自の考えなんてない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: 'レポートのテーマ決めに3時間、本文書くのに1時間。比率おかしい',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: '「3000字以上」って書いてあるの、2800字で一旦止まって絶望してるやつ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: 'レポート終わった〜って思ったら設問2があったときの絶望感、共有したい',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: 'ゼミのレポートと一般教養のレポート同時に来ると人間やめたくなる',
    has_cta: false, weight: 1.0,
  },

  // ──────── ChatGPT浅い問題 ────────
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTのレポート、全部「〇〇は非常に重要です。なぜなら〜」の文体でバレバレすぎる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTに「〇〇についてレポートを書いて」って言うと、表面だけなぞって終わるやつ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTの出力、なんか全部同じ文章の構造でキモいくらい一致してる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTに参考文献出してって頼んだら実在しない論文出してきて危うく提出するところだった',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPT、専門用語は使えるけど「なぜそう言えるのか」の部分が全部ふわっとしてる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTのレポートって読むとわかるんよな。なんか全部「結論として〇〇と言えるでしょう」で終わる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTが出力する「考察」、考察になってなくてただの要約なんだよな',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTに授業資料読み込ませてもなんか的外れなレポートが出来上がる謎',
    has_cta: false, weight: 1.0,
  },

  // ──────── 教授あるある ────────
  {
    category: 'professor_aru',
    content: '「形式は自由」って言ったのにA4・明朝体・12pt指定してくる教授、自由の意味は？',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '先生の授業ノート見返したけど何言ってるか全然わからなくてレポートに使えない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '「授業内容を踏まえて」って書いてあるのに授業で何話してたか全然覚えてない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '教授の言う「独自の視点を加えること」、独自ってどこまでが独自なのかわからない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '提出後に「これは課題の意図と違う」って返ってきたとき、最初から言ってくれ……',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '教授によって参考文献の書き方が全部違うの、統一してくれ頼むから',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'professor_aru',
    content: '「批判的考察を加えること」って言われるけど批判的ってどのくらいの温度感なの',
    has_cta: false, weight: 1.0,
  },

  // ──────── 締切前の焦り ────────
  {
    category: 'deadline_panic',
    content: '提出48時間前、まだテーマすら決まってない。これが文系の洗礼',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: '深夜2時、参考文献5本必要なのにまだ0本。検索キーワードすらわからない',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'deadline_panic',
    content: '提出6時間前にようやく「あ、このレポートやばい」って気づく謎のタイミング',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: '締め切り前日の夜、急に他のことが気になりだすのなんで？ 現実逃避の本能が強すぎる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: '「まあ明日やればいいか」を3日繰り返した結果が今の深夜作業',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: '提出3時間前から本気出す人間だって自覚はある。でもやめられない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: 'レポート提出期限23:59のやつ、深夜に書いてる人間の気持ちわかってる教授だと思う',
    has_cta: false, weight: 1.0,
  },

  // ──────── AI臭い文章問題 ────────
  {
    category: 'ai_smell',
    content: 'AIで書いたってバレるやつの共通点：「〜が求められます」「〜と言えるでしょう」連発',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'ai_smell',
    content: 'AIに書かせたレポート、読み返すとなんか他人事みたいな文体でキモい',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'ai_smell',
    content: '「非常に重要な要素であると考えられます」←この文、人間は書かない',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'ai_smell',
    content: 'AIのレポート、まず「はじめに本稿では〜について検討する」って始まるやつ多すぎ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'ai_smell',
    content: 'AIが書いたレポートって、正しいことを書いてるのに大学のレポートっぽくない謎の違和感がある',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'ai_smell',
    content: 'AIの文章は知識はあるけど「学んだ人間の書き方」じゃないんだよな。そこが教授にバレる',
    has_cta: false, weight: 1.2,
  },

  // ──────── 論文引用問題 ────────
  {
    category: 'citation_hell',
    content: '「論文を引用すること」って書いてあってCiNii開いたら全部英語でワロタ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: '参考になる論文見つけたと思ったらアブストしか読めなくて絶望するやつ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: 'Googleスカラーで論文探してたら気づいたら別の研究に興味持ってた。本末転倒',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: '「一次文献を使え」って言われてもどれが一次でどれが二次かわからん',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: '論文の引用形式、APA・MLA・シカゴって何？ 高校では習わなかった',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: '参考文献リスト作ってたら本文より時間かかった。これが大学か',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: 'CiNiiで日本語論文探したら、求めてるテーマがピンポイントで全然ヒットしない',
    has_cta: false, weight: 1.0,
  },

  // ──────── 大学っぽさ ────────
  {
    category: 'university_vibe',
    content: '高校のレポートと大学のレポートの違い、入学後も誰も教えてくれなかった',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'university_vibe',
    content: '「大学っぽい文章」ってなんなのかを4年間かけて学ぶ場所が大学',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'university_vibe',
    content: '授業中に先生が話したこと、そのままレポートに書いていいのかわからない問題',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'university_vibe',
    content: '文系レポートの「考察」、理系みたいに正解ないから何書けばいいかほんとわからん',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'university_vibe',
    content: '「文献に依拠しながら自分の意見を述べよ」という矛盾を3年間解読し続けてる',
    has_cta: false, weight: 1.0,
  },

  // ──────── 深夜テンション ────────
  {
    category: 'latenight',
    content: '深夜のレポート作業、集中してるのにやってることYouTube見てる謎の状態',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '深夜2時のレポート作業、コーヒー3杯目で脳がバグり始めてる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '深夜に書いたレポート、翌朝読み返すとなぜか文章がおかしくて全部書き直す羽目になる',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '夜中1時、同じ大学の友達もどこかでレポート書いてると思うと少し安心する',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '深夜のレポートって変に哲学的になりすぎるからほどほどにしないといけない',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '夜中3時のレポート提出、達成感と「もっとちゃんと書けたのでは」が同時に来る',
    has_cta: false, weight: 1.0,
  },

  // ──────── 女子大生あるある（追加）────────
  {
    category: 'deadline_panic',
    content: 'レポート締切前日に突然ネイルとか部屋の掃除とかしたくなる病、全員かかってるよね',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: '深夜2時にレポート書きながらコンビニスイーツ食べてるの、贅沢なんだか自分を慰めてるんだかわからん',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: '友達に「レポート終わった？」って聞いたら「全然」って返ってきてなぜか安心するやつ',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'latenight',
    content: 'レポート書いてると急にインスタのリール無限に見たくなるのなんで、逃げ場探してる…',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'deadline_panic',
    content: 'やばいレポート終わってないのに推しのこと考えてしまう深夜3時、集中力どこいった',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'report_struggle',
    content: 'レポートで「私は〜と考える」って書いていいのか「筆者は〜」って書くべきか迷って30分溶けた',
    has_cta: false, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTに書かせたレポート提出したら「AIを使ったことがわかります」って返ってきた。もう無理',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'latenight',
    content: '深夜のレポート作業中、急に涙が出そうになるのわかる人いる？ 疲れと焦りと眠気が一気に来るやつ',
    has_cta: false, weight: 1.0,
  },

  // ──────── 参考文献探しの時間泥棒（市場調査TOP1課題）────────
  {
    category: 'citation_hell',
    content: '参考文献探しだけで2時間飛んだ。本文より準備の方が長いのおかしくない？',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'citation_hell',
    content: 'CiNiiで論文探す→やっと見つかる→引用形式調べる→また別の形式で詰まる。これで1時間半経過',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'citation_hell',
    content: '電子図書館でやっと本見つけたのにURLどうやって引用すればいいかわからなくて30分溶けた',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'citation_hell',
    content: 'レポート本文2時間、参考文献リスト作成2時間。本末転倒すぎて笑えない',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTのレポートって引用してる論文が実在しないことある。提出する前に確認して本当によかった',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'chatgpt_shallow',
    content: '大学の電子図書館で本借りたのに、それをどうレポートに使えばいいかわからないまま締切来た',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'report_struggle',
    content: '「文献を読んでレポートを書け」はわかるんだけど、読んだ内容をどう文章にするかが全然わからない',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'university_vibe',
    content: 'Maruzen eBookとかCiNiiとか大学入ったら急に使えって言われるやつ、誰も使い方教えてくれない',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'deadline_panic',
    content: '参考文献5本揃えるのに3時間かかって、本文書く時間なくなった。これが文系の現実',
    has_cta: false, weight: 1.2,
  },

  // ──────── 電子書籍・授業資料あるある ────────
  {
    category: 'citation_hell',
    content: '電子図書館の本、URLコピーしてどうレポートに使えばいいかずっとわかってなかった',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'citation_hell',
    content: 'Maruzen eBookで本見つけたのに引用の仕方がわからなくて結局使えなかった、あれ何時間？',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'report_struggle',
    content: '「授業内容を踏まえて論じよ」←授業スライドどうやってレポートに入れるんだよ、ChatGPTは授業のこと知らないじゃん',
    has_cta: false, weight: 1.3,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTって授業で習ったこと全部知らないから、「授業を踏まえて」系の課題には使えないんだよね',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'citation_hell',
    content: '先生が「指定教科書を参考にすること」って書いてくるやつ、電子書籍のURL貼れたら一番楽なんだけど',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'latenight',
    content: '講義スライドPDFあるのにそれをレポートにどう組み込むかがわからなくて深夜に詰んでる',
    has_cta: false, weight: 1.2,
  },
  {
    category: 'university_vibe',
    content: '電子図書館ってログインして本見つけてURLコピーしてって、ここまで来てレポートへの使い方わからんの辛すぎ',
    has_cta: false, weight: 1.2,
  },

  // ──────── CTA付き（4投稿に1回だけ）────────
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTに書かせたら浅すぎて教授に詰められたんだけど、ポチレポって授業スライドや電子書籍を読んで書いてくれるから全然違った。プロフにリンクあるよ',
    has_cta: true, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: '論文探しとか参考文献まとめ、ずっと手動でやってたけどポチレポに任せたらだいぶ楽になった。講義資料読み込んでくれるやつ。プロフ見て',
    has_cta: true, weight: 0.8,
  },
  {
    category: 'ai_smell',
    content: 'AI臭い文章になるのって授業の内容が入ってないからだと気づいた。ポチレポは講義資料を読み込んでくれるからそれがない。リンクはプロフ',
    has_cta: true, weight: 0.8,
  },
  {
    category: 'deadline_panic',
    content: '締切前に本当に助けられたのがポチレポ。叩き台が3分でできるし、架空の参考文献が出ないから先生に指摘されない。プロフ見て',
    has_cta: true, weight: 0.8,
  },
  {
    category: 'report_struggle',
    content: '構成で詰まったときポチレポにテーマと講義資料ぶち込んだら序論〜結論まで作ってくれた。7日間無料で試せて月500円。プロフにリンク貼ってある',
    has_cta: true, weight: 0.8,
  },
  {
    category: 'professor_aru',
    content: '「授業内容を踏まえて論じよ」が一番きつい課題だったんだけど、ポチレポが講義資料読み込んでくれるから先生の授業に沿った内容になるんだよね。プロフ見て',
    has_cta: true, weight: 0.8,
  },
  {
    category: 'citation_hell',
    content: '参考文献探しで2時間消えてたんだけど、ポチレポに電子図書館のURLそのまま貼ったら自動で引用してくれた。形式もAPA・日本語形式どっちも対応してる。7日間無料・月500円。プロフ',
    has_cta: true, weight: 1.0,
  },
  {
    category: 'chatgpt_shallow',
    content: 'ChatGPTと違ってポチレポは自分の大学の電子図書館の本を読み込んで書いてくれる。実在する文献で書くから先生に出せる。リンクはプロフ',
    has_cta: true, weight: 1.0,
  },
  {
    category: 'citation_hell',
    content: 'Maruzen eBookのURLコピーしてポチレポに貼ったら本1冊が丸ごと資料になった。あとはテーマ入れてポチるだけ。7日間無料で試せて月500円。プロフ見て',
    has_cta: true, weight: 1.0,
  },

  // ──────── 自作アプリ告白系（悩み→自作のストーリー）────────
  {
    category: 'self_made_app',
    content: '毎回レポートで同じところで詰まってるの、さすがに自分でもうアホらしくなってきた。これもう自分でなんとかするしかないのでは',
    has_cta: false, weight: 1.4,
  },
  {
    category: 'self_made_app',
    content: '参考文献探しとか構成とか、毎回同じことで2〜3時間溶かしてる自分にうんざりして、ついにツール作ることにした。文系でプログラミングなんてやったことないのに',
    has_cta: false, weight: 1.4,
  },
  {
    category: 'self_made_app',
    content: 'レポートに追われすぎて、結局AIで叩き台作ってくれるアプリ自分で作っちゃった。文系のド素人が見様見真似で作ったやつだけど普通に便利。プロフにあるよ',
    has_cta: true, weight: 1.6,
  },
  {
    category: 'self_made_app',
    content: '参考文献探しに毎回時間溶かしてたのが本当に嫌で、講義資料読み込んで自動で書いてくれるアプリ作った。まさか自分が個人開発するとは思ってなかった。プロフ見て',
    has_cta: true, weight: 1.6,
  },
  {
    category: 'self_made_app',
    content: '「それアプリにすればいいのに」って前から言われてたけど、課題に追われすぎてついに本当に作った。文系でも作れるんだなって自分が一番びっくりしてる',
    has_cta: false, weight: 1.4,
  },
  {
    category: 'self_made_app',
    content: 'ChatGPTのレポートが浅すぎて毎回直すの疲れたから、講義資料読み込んで書いてくれるアプリ自作した。今は普通に自分も毎回使ってる。プロフにリンクあるよ',
    has_cta: true, weight: 1.6,
  },
  {
    category: 'self_made_app',
    content: '友達に「レポート手伝って」って配ったアプリ、思った以上にみんな使ってくれてて、自分の悩みって結構みんなの悩みだったんだなと実感した',
    has_cta: true, weight: 1.5,
  },
];
