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

  // CORSヘッダーを追加してレスポンスを返す関数
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

      // トークン照合
      var storedToken = sheet.getRange(row, 5).getValue();
      if (storedToken !== data.deleteToken) {
        return respond("削除権限がありません。", false);
      }

      sheet.deleteRow(row);
      return respond("削除しました。", true);
    }

    // 投稿アクション（既存）
    if (!data.pageId || !data.text) {
      return respond("データが不足しています。", false);
    }

    var name = data.name || "名無し";
    var deleteToken = data.deleteToken || "";
    var date = new Date();
    // JSTでフォーマット
    var dateString = Utilities.formatDate(date, "JST", "yyyy/MM/dd HH:mm:ss");

    sheet.appendRow([data.pageId, name, data.text, dateString, deleteToken]);

    return respond("成功", true);
  } catch (err) {
    return respond("エラーが発生しました: " + err.toString(), false);
  }
}
