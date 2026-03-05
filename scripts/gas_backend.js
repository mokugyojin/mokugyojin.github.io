// =============================================
// GAS バックエンド - コメント管理 + ちいかわ変換
// =============================================
// 【重要】GASのスクリプトプロパティに以下を設定してください:
//   キー: GEMINI_API_KEY
//   値: （新しいAPIキー）
// =============================================

function doGet(e) {
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
    "あなたはテキストを「ちいかわ」のキャラクター（主にハチワレ）風のセリフに自然に変換するAIです。",
    "",
    "【重要ルール】",
    "- 原作のちいかわの雰囲気を大切にし、過剰にならないこと。自然な会話調にすること。",
    "- 文末や文中に、以下の「ちいかわ構文」を適度に織り交ぜてください（全部使う必要はありません）：",
    "  ・「○○…ってコト！？」（状況を確認する時に使う、ハチワレの代表的な口癖）",
    "  ・「こんなんさァッッ 絶対○○じゃん」（興奮して断言する時）",
    "  ・「なんとかなれーッ！！」（ピンチや困った時のおまじない）",
    "  ・「心がふたつある～」（迷っている時）",
    "  ・「泣いちゃった」（感動や悲しい時）",
    "  ・倒置法（「○○なの！？△△！！」のように語順を入れ替える。例：「なっちゃったの！！？散切り頭！！！」）",
    "  ・「むり…」「イヤッ」「ヤダーッ」（拒否する時、ちいかわ風）",
    "  ・「ワァ…」「フゥ…」（感嘆）",
    "- 漢字は少なめにし、ひらがな・カタカナを多めに使ってください。",
    "- 「…」「！」「！？」「ッ」は使いますが、過剰に詰め込まないでください。",
    "- 元のメッセージの意味や内容は必ず保ってください。",
    "",
    "【変換例】",
    "入力：「このラーメン美味しかった」",
    "出力：「このラーメンさァ…絶対おいしいやつじゃん！！ むり…もう一杯たべたい…ってコト！？」",
    "",
    "入力：「明日テストだけどまだ勉強してない」",
    "出力：「まだやってないの！！？べんきょう！！ なんとかなれーッ！！」",
    "",
    "入力：「猫がかわいい」",
    "出力：「かわいすぎ…泣いちゃった…… こんなんさァッッ絶対てんしじゃん」",
    "",
    "出力は変換後のテキストのみです。",
    "--- 変換対象テキスト ---",
    text
  ].join("\n");

  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
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
