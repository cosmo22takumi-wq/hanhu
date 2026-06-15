import dotenv from 'dotenv';
dotenv.config();
import { initializeDB, templateQueries } from './db/database';
import { log } from './utils/logger';

initializeDB();

const existing = templateQueries.getAll.all() as Array<{ content: string }>;
const existingContents = new Set(existing.map((t: any) => t.content));

const newPosts = [
  { category: 'deadline_panic', content: '明日レポート提出なのに参考文献ゼロの人！\nポチレポに電子図書館のURLを貼るだけで本が丸ごと資料になります。\nChatGPTと違って「自分の資料ベース」だから先生に出しても大丈夫な品質。\n今すぐ → https://pochi-repo.jp/?src=x\n#レポート #大学生 #ポチレポ #締め切り', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: '深夜2時、レポート0字の人へ🌙\n序論→本論→結論の構成、参考文献のフォーマット、全部ポチレポが自動でやってくれる。\n7日間無料で試せて月500円。\n→ https://pochi-repo.jp/?src=x\n#レポート #大学生 #ポチレポ #徹夜', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: '提出3時間前にこのツイートを見た人へ⚡\n1. ポチレポを開く\n2. 電子図書館URLを貼る\n3. 学部・テーマを入力\n4. 生成ボタンを押す\n5. 参考文献も自動整形\n間に合わせた人はいいねしてください。\n→ https://pochi-repo.jp/?src=x\n#レポート #ポチレポ #大学生', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: 'レポート提出15時間前の行動記録📝\n22:00「まだ余裕」\n01:00「ちょっとヤバい」\n03:00「オワタ」\n03:05 ポチレポ発見\n07:00 完成・提出\n→ https://pochi-repo.jp/?src=x\n#レポート #大学生 #ポチレポ #あるある', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: '「レポート余裕」と言った1週間前の自分を本気で憎んでいる人🫠\nポチレポ、7日間無料トライアルだから今すぐ使っても課金ゼロ。\nまず試して、後で感謝して。\n→ https://pochi-repo.jp/?src=x\n#レポート #大学生 #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: 'レポートに使える時間が3時間しかない人へ⏰\nポチレポ、今すぐ開いてください。\n7日間無料で使えます。\n→ https://pochi-repo.jp/?src=x\nやってから「間に合った」報告ください。\n#レポート #大学生 #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: '「ポチレポ」を知らずにレポートで苦労してた大学生に届け🕊️\n電子図書館URL貼るだけで先生に出せる品質のレポートが作れます。\n7日間無料 → https://pochi-repo.jp/?src=x\nRTしてくれた人が助かります。\n#レポート #大学生 #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'deadline_panic', content: '来学期のレポート、今から準備できる人とできない人で単位の取りやすさが全然違う📊\nポチレポを今のうちに試しておいて。\n7日間無料 → https://pochi-repo.jp/?src=x\n#大学生 #レポート #ポチレポ #単位', has_cta: true, weight: 0.9 },
  { category: 'citation_hell', content: '参考文献探しで2時間溶けた経験ある人🙋‍♀️\n論文タイトル調べる→CiNiiの使い方がわからない→諦めてWikipedia→「Wikipediaは参考文献にならない」と指摘される→絶望\nこのループ、ポチレポが断ち切ります。\n→ https://pochi-repo.jp/?src=x\n#参考文献 #CiNii #大学生 #ポチレポ', has_cta: true, weight: 1.2 },
  { category: 'citation_hell', content: '「参考文献はAPA形式で」と言われたときAPAが何かわからなかった人🤫\n著者名(発行年). タイトル. 出版社.\nみたいなやつ、全部自動で整形してくれます。\n→ https://pochi-repo.jp/?src=x\n#参考文献 #大学生 #レポート #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'citation_hell', content: '図書館で本を借りたはいいけど結局どこを引用すればいいかわからなかった人📚\n電子図書館のURLをポチレポに貼るだけで本の内容が丸ごと資料になります。\nあとはテーマを入れて生成するだけ。\n→ https://pochi-repo.jp/?src=x\n#大学生 #レポート #参考文献 #ポチレポ', has_cta: true, weight: 1.2 },
  { category: 'citation_hell', content: '参考文献を手打ちで入力してたら1時間で2本しか終わらなかった話🥲\nポチレポだと同じ時間でレポート全体が仕上がります。\n7日間無料で体験できます。\n→ https://pochi-repo.jp/?src=x\n#参考文献 #大学生 #レポート #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'citation_hell', content: '文系大学生の参考文献ガチャ🎰\n🟥「Webサイトは不可」\n🟧「5年以内の文献で」\n🟨「英語論文も含めて」\n🟩「日本語形式で統一」\n⬛「形式は任せる」←これが一番困る\nポチレポは学部別対応しています。\n→ https://pochi-repo.jp/?src=x\n#参考文献 #大学生 #ポチレポ #あるある', has_cta: false, weight: 1.1 },
  { category: 'citation_hell', content: '参考文献の「著者名, 発行年, タイトル, 雑誌名, 巻(号), pp.開始-終了ページ」\nこのフォーマット、毎回ググってる人🔍\nポチレポは自動で正しい形式に整えます。\nAPA・MLA・日本語形式に全対応。\n→ https://pochi-repo.jp/?src=x\n#参考文献 #APA #大学生 #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'chatgpt_shallow', content: 'ポチレポがやってくれること👇\n✅ CiNii論文を自動検索\n✅ 電子図書館の本を資料化\n✅ 授業録音を文字起こし\n✅ 序論〜結論まで構成\n✅ 参考文献をAPA/MLA/日本語形式で整形\n✅ PDF・Wordでエクスポート\n7日間無料 → https://pochi-repo.jp/?src=x\n#ポチレポ #大学生 #レポート', has_cta: true, weight: 1.0 },
  { category: 'chatgpt_shallow', content: 'ChatGPTと違ってポチレポは自分の大学の電子図書館の本を読み込んで書いてくれる。実在する文献で書くから先生に出せる。リンクはプロフ\n→ https://pochi-repo.jp/?src=x\n#AI #レポート #大学生 #ポチレポ', has_cta: true, weight: 1.2 },
  { category: 'chatgpt_shallow', content: 'Maruzen eBookのURLコピーしてポチレポに貼ったら本1冊が丸ごと資料になった。あとはテーマ入れてポチるだけ。7日間無料で月500円だよ。\n→ https://pochi-repo.jp/?src=x\n#電子図書館 #大学生 #レポート #ポチレポ', has_cta: true, weight: 1.2 },
  { category: 'chatgpt_shallow', content: 'ChatGPTでレポートを書いたとき「なんか怪しいな」と思った経験ある人🤔\nポチレポは自分の電子図書館・論文・録音をベースに生成するから根拠がある文章になります。\n先生に出せる品質、ここが違う。\n→ https://pochi-repo.jp/?src=x\n#AI #レポート #大学生 #ポチレポ', has_cta: true, weight: 1.2 },
  { category: 'university_vibe', content: 'CiNiiって何？という人🙋‍♂️\n国立情報学研究所が運営する日本最大の学術論文データベースです。\nポチレポはCiNiiの論文をテーマから自動で検索・引用してくれます。\nもうCiNiiの使い方を覚えなくていい。\n→ https://pochi-repo.jp/?src=x\n#CiNii #大学生 #論文 #ポチレポ', has_cta: true, weight: 1.0 },
  { category: 'university_vibe', content: '法学部・経済学部・文学部・社会学部で引用ルールが全部違うの本当に困る🫠\nポチレポは学部別文体に対応しているので「うちの学部の書き方」で仕上げてくれます。\n→ https://pochi-repo.jp/?src=x\n#大学生 #レポート #ポチレポ #学部別', has_cta: true, weight: 1.0 },
  { category: 'report_struggle', content: 'レポートを早く終わらせて遊びたい人だけ見てください👀\nポチレポ使うと「参考文献探し2時間」がなくなります。\nその2時間で何する？\n→ https://pochi-repo.jp/?src=x\n#大学生 #レポート #ポチレポ #時短', has_cta: true, weight: 1.0 },
  { category: 'report_struggle', content: '授業、録音してる人✋\nポチレポにその音声を入れると文字起こし→レポートの骨格まで一気に作ってくれます。\n先生が言ってた内容が自動でレポートに反映される。\n→ https://pochi-repo.jp/?src=x\n#授業録音 #大学生 #ポチレポ #レポート', has_cta: true, weight: 1.0 },
  { category: 'report_struggle', content: 'レポートで「私は〜と考える」って書いていいのか「筆者は〜」って書くべきか迷って30分溶けた\nポチレポは学部別に適切な文体で書いてくれます。\n→ https://pochi-repo.jp/?src=x\n#レポート #大学生 #ポチレポ', has_cta: true, weight: 0.9 },
];

let added = 0;
for (const t of newPosts) {
  if (!existingContents.has(t.content)) {
    templateQueries.insert.run({ category: t.category, content: t.content, has_cta: t.has_cta ? 1 : 0, weight: t.weight });
    added++;
  }
}
log('success', `[Seed] X投稿追加: ${added}件 / 合計: ${existing.length + added}件`);
