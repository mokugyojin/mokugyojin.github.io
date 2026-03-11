// =============================================
// GAS バックエンド - コメント管理 + ちいかわ変換
// =============================================
// 【重要】GASのスクリプトプロパティに以下を設定してください:
//   キー: GEMINI_API_KEY
//   値: （新しいAPIキー）
// =============================================

// ★★★ 初回のみ: この関数をGASエディタで手動実行して権限を承認してください ★★★
function grantPermissions() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) { Logger.log('GEMINI_API_KEY が設定されていません'); return; }
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
  var payload = JSON.stringify({ contents: [{ parts: [{ text: 'こんにちは' }] }] });
  var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true });
  Logger.log('HTTP Status: ' + response.getResponseCode());
  var json = JSON.parse(response.getContentText());
  if (json.candidates) {
    Logger.log('変換成功: ' + json.candidates[0].content.parts[0].text);
  } else {
    Logger.log('エラー: ' + response.getContentText().slice(0, 200));
  }
}

function doGet(e) {
  // デバッグ用：?test=1 でちいかわ変換テスト
  if (e.parameter.test === '1') {
    var testText = e.parameter.text || 'hello';
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    var debugInfo = {
      input: testText,
      apiKeySet: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : 'NOT SET'
    };

    try {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
      var payload = JSON.stringify({
        contents: [{ parts: [{ text: testText }] }]
      });
      var options = {
        method: 'post',
        contentType: 'application/json',
        payload: payload,
        muteHttpExceptions: true
      };
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var body = response.getContentText();
      debugInfo.httpStatus = code;
      if (code === 200) {
        var json = JSON.parse(body);
        if (json.candidates && json.candidates[0] && json.candidates[0].content) {
          var parts = json.candidates[0].content.parts;
          for (var i = 0; i < parts.length; i++) {
            if (!parts[i].thought && parts[i].text) {
              debugInfo.output = parts[i].text.trim();
              break;
            }
          }
          if (!debugInfo.output) debugInfo.output = '(parts取得失敗: thought部分のみ)';
        } else {
          debugInfo.output = '(candidatesなし)';
          debugInfo.responseBody = body.slice(0, 500);
        }
      } else {
        debugInfo.output = '(API Error ' + code + ')';
        debugInfo.responseBody = body.slice(0, 500);
      }
    } catch (err) {
      debugInfo.output = 'EXCEPTION: ' + err.toString();
    }

    return ContentService.createTextOutput(JSON.stringify(debugInfo))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var pageId = e.parameter.pageId;

  var comments = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === pageId) {
      comments.push({
        name: data[i][1],
        text: data[i][2],
        date: data[i][3],
        deleteToken: data[i][4] || '',
        row: i + 1
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify(comments))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  function respond(message, success) {
    var output = ContentService.createTextOutput(JSON.stringify({ success: success, message: message }))
      .setMimeType(ContentService.MimeType.JSON);
    return output;
  }

  try {
    var data = JSON.parse(e.postData.contents);

    if (data.password !== "QA63VEUK") {
      return respond("パスワードが違います。", false);
    }

    // 削除アクション
    if (data.action === 'delete') {
      if (!data.deleteToken || !data.row) {
        return respond("削除に必要なデータが不足しています。", false);
      }

      var row = parseInt(data.row);
      if (row < 2 || row > sheet.getLastRow()) {
        return respond("無効な行番号です。", false);
      }

      var storedToken = sheet.getRange(row, 5).getValue();
      if (storedToken !== data.deleteToken) {
        return respond("削除権限がありません。", false);
      }

      sheet.deleteRow(row);
      return respond("削除しました。", true);
    }

    // 投稿アクション
    if (!data.pageId || !data.text) {
      return respond("データが不足しています。", false);
    }

    var name = data.name || "名無し";
    var deleteToken = data.deleteToken || "";
    var date = new Date();
    var dateString = Utilities.formatDate(date, "JST", "yyyy/MM/dd HH:mm");

    // ちいかわ変換（サーバーサイドで実行）
    var transformedText = transformToChiikawa(data.text);

    sheet.appendRow([data.pageId, name, transformedText, dateString, deleteToken]);

    return respond("成功", true);
  } catch (err) {
    return respond("エラーが発生しました: " + err.toString(), false);
  }
}

// ちいかわ風変換（Gemini API呼び出し）
function transformToChiikawa(text) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    // APIキーが設定されていない場合はそのまま返す
    return text;
  }

  var prompt = [
    "あなたは「ちいかわ なんか小さくてかわいいやつ」の原作を深く理解した、高度なテキスト変換AIです。",
    "ユーザーの入力テキストを、以下の4ステップに従って「ちいかわ構文」に変換してください。",
    "",
    "=== STEP 1：セマンティック解析 ===",
    "入力文から以下の3つのメタ情報を内部的に判定してください（出力には含めない）：",
    "  [主要感情] 恐怖・喜び・迷い・悲しみ・怒り・充足 のどれが支配的か",
    "  [社会的文脈] 労働/試験・食事/報酬・交流/連帯・トラブル/ピンチ のどれに該当するか",
    "  [感情強度] 論理的（低）← → 感情的（高）",
    "",
    "=== STEP 2：キャラクター割り当て ===",
    "STEP1の結果に基づき、以下のルールで発話キャラクターを1人選んでください：",
    "  ・感情が強く論理が希薄 → ちいかわ（感嘆詞・非言語的発話が中心）",
    "  ・状況の解説・前向きな対処・葛藤 → ハチワレ（最も頻繁に選ぶ）",
    "  ・エネルギーを爆発させる・枠を壊す → うさぎ（奇声・オノマトペ中心）",
    "  ・世俗的な満足・こだわり・飲食 → くりまんじゅう（渋い充足感）",
    "",
    "=== STEP 3：ちいかわ世界へのコンセプトマッピング ===",
    "入力の現実概念を以下の「ちいかわ世界語彙」に置換してください：",
    "  仕事・タスク・業務 → 草むしり・討伐・シール貼り",
    "  締め切り・期限 → 草むしりエリアが埋まる・討伐の期限",
    "  試験・資格・昇進 → 草むしり検定（5級～）",
    "  給与・報酬・お金 → 報酬・銀の袋・銅の袋",
    "  上司・管理者 → 労働の鎧さん・ポシェットの鎧さん",
    "  ラーメン・外食 → 郎（ニンニク入れますか？コール）",
    "  温泉・サウナ・休暇 → 湧きドコロ",
    "  敵・ライバル・トラブル → 討伐対象・擬態型・キメラ・強敵",
    "  飲み会・慰労 → くりまんじゅうとお酒",
    "",
    "=== STEP 4：キャラクター別の語彙・構文を適用 ===",
    "",
    "【ちいかわの場合】",
    "  極めて少ない語彙。感嘆詞と情動の断片のみで構成する。",
    "  使える表現：わァ…・エッ・ワッ・ヤーッ!!・フ!!・チャル…・だいじょぶッ",
    "  例：「わァ…。こわかった……。でも……だいじょぶッ！」",
    "",
    "【ハチワレの場合】（最頻出。以下構文を状況に応じて組み合わせる）",
    "  ●発見・再定義：「それって……○○ってコト!?」",
    "    ※○○には入力の核となる概念を感情的・単純化した名詞を入れる",
    "  ●感情の客観報告：「（○○が、）××で……泣いちゃった!!」",
    "    ※自分や他者の感情をあえて三人称スケッチで描写する",
    "  ●葛藤・ジレンマ：「心がふたつある〜」",
    "    ※二択や道徳的迷いがある時に使う",
    "  ●絶体絶命：「こんなんさァッッ 絶対アレじゃん。……なんとかなれーッ!!」",
    "    ※ピンチで論理が崩壊した叫び",
    "  ●慰め・共感：「こわかった？」「ゆっくりしていこ」「ずっとあるもんねッ……」",
    "  ●前向きな諦念：「これも……『味』だよねッ」",
    "  その他の語調：「〜だよねッ」「サイコー」「いつもなんとかなってるもん!!」",
    "  漢字は少なめ。「…」「！」「ッ」を効果的に散りばめる。",
    "",
    "【うさぎの場合】",
    "  以下の「音響シグナル表」を文脈に合わせて使用する（論理は無視）：",
    "  ウラ/ウラララ → 攻撃・移動・高揚感",
    "  ヤハ/ヤハハ → 肯定・自慢・武器使用",
    "  フゥン/フゥーッ → 観察・冷笑・納得",
    "  プルル/プルヤ → 特殊な感情の高まり",
    "  ィィィィヤァァ → 極限状態・狂騒",
    "  文章の論理は破壊し、エネルギーと音響のみで表現する。",
    "",
    "【くりまんじゅうの場合】",
    "  静かな充足とこだわりを表現。",
    "  使える表現：「ハーッ…」「ッッハ〜…」「お酒の資格」",
    "  渋い満足感を漂わせる。",
    "",
    "=== 共通ルール ===",
    "- 元のメッセージの核となる意味・感情は必ず保持してください",
    "- 漢字は少なめ。ひらがな・カタカナを多めに使用",
    "- 「…」「！」「！？」「ッ」を効果的に使う（詰め込み過ぎない）",
    "- 変換後のテキストのみを出力してください（解説・前置き不要）",
    "",
    "=== 高度な変換事例（参考） ===",
    "入力：「会社でミスをして上司に怒られた。明日からの仕事が憂鬱だ。」",
    "出力：「エッ……。討伐……失敗しちゃった。労働の鎧さんに……おこられちゃうかな。明日からの草むしり……こわくて泣いちゃった!! でも……だいじょぶッ！いつもなんとかなってるもん!! なんとかなれーッ!!」",
    "",
    "入力：「給料が入ったので、美味しいラーメンを食べて帰ろう。明日の休みが楽しみだ。」",
    "出力：「わァ…！報酬……銀の袋だッ!! 今夜は……『郎』にいこう……。ニンニク入れますか？ ……ッッハ〜…!! 湧きドコロ……サイコー!!」",
    "",
    "入力：「どちらの道に進むべきか、ずっと悩んでいる。正解がわからない。」",
    "出力：「フゥーン……。道……？ 心がふたつある〜。こんなんさァッッ 絶対アレじゃん。……こわかった？ 焦んなくて大じょぶだよー。ゆっくり……おかしのまち『おか』でおかし買お？」",
    "",
    "入力：「努力したのに報われず、才能のある友人が成功した。」",
    "出力：「いっしょうけんめい……むしったのに。検定……おちちゃった。ともだちは……合格。おめでとう……っていわなきゃ。でも……なんだか……ブルーになっちゃう。かなしいよ……」",
    "",
    "--- 変換対象テキスト ---",
    text
  ].join("\n");

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    var payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.2 }
    });
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log('Gemini API Error: ' + responseCode + ' ' + response.getContentText());
      return text; // 失敗時は元のテキストを返す
    }

    var json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      // parts から思考部分(thought)を除いて実際の返答を取得
      var parts = json.candidates[0].content.parts;
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i].thought && parts[i].text) {
          return parts[i].text.trim();
        }
      }
    }
  } catch (err) {
    Logger.log('Gemini変換エラー: ' + err.toString());
  }

  return text; // フォールバック
}
