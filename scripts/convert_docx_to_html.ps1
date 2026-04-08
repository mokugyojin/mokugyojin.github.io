# convert_docx_to_html.ps1
# Word (.docx) ファイルからテキストと画像を抽出し、
# 週刊東山通信のHTMLフォーマットに変換するPowerShellスクリプト
#
# 使い方:
#   .\scripts\convert_docx_to_html.ps1 -DocxPath "path\to\column.docx" -ColumnNumber 9 -Author "原田" -Title "博多でごぼう天を食べて思ったこと" -Date "2026年4月9日"
#
# 注意: docxファイルはZIP形式のため、PowerShellのExpand-Archiveで展開して処理します。
#       Python (python-docx) が利用可能な場合は、そちらを使う方が堅牢です。

param(
    [Parameter(Mandatory=$true)]
    [string]$DocxPath,
    
    [Parameter(Mandatory=$true)]
    [int]$ColumnNumber,
    
    [Parameter(Mandatory=$true)]
    [string]$Author,
    
    [Parameter(Mandatory=$true)]
    [string]$Title,
    
    [Parameter(Mandatory=$true)]
    [string]$Date
)

$ErrorActionPreference = "Stop"

# プロジェクトルート
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# 一時展開ディレクトリ
$tempDir = Join-Path $projectRoot "docx_extract_temp"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# ファイル名のパディング
$columnNum = $ColumnNumber.ToString("D2")

Write-Host "=== DOCX to HTML 変換スクリプト ===" -ForegroundColor Cyan
Write-Host "入力ファイル: $DocxPath"
Write-Host "コラム番号: 第${ColumnNumber}回"
Write-Host "タイトル: $Title"
Write-Host "著者: $Author"
Write-Host "日付: $Date"
Write-Host ""

# --- Step 1: docxをZIPとしてコピー・展開 ---
Write-Host "[1/4] docxファイルを展開中..." -ForegroundColor Yellow
$zipPath = Join-Path $tempDir "column.zip"
Copy-Item $DocxPath $zipPath
Expand-Archive -Path $zipPath -DestinationPath (Join-Path $tempDir "extracted") -Force

# --- Step 2: 画像を抽出 ---
Write-Host "[2/4] 画像を抽出中..." -ForegroundColor Yellow
$mediaDir = Join-Path $tempDir "extracted\word\media"
$imageFiles = @()

if (Test-Path $mediaDir) {
    $images = Get-ChildItem $mediaDir -File | Sort-Object Name
    $imageIndex = 1
    foreach ($img in $images) {
        $ext = $img.Extension
        $destName = "column${columnNum}_img${imageIndex}${ext}"
        $destPath = Join-Path $projectRoot $destName
        Copy-Item $img.FullName $destPath
        $imageFiles += $destName
        Write-Host "  画像${imageIndex}: $destName"
        $imageIndex++
    }
} else {
    Write-Host "  画像が見つかりませんでした。"
}

# --- Step 3: テキストを抽出 ---
Write-Host "[3/4] テキストを抽出中..." -ForegroundColor Yellow
$documentXml = Join-Path $tempDir "extracted\word\document.xml"
[xml]$doc = Get-Content $documentXml -Encoding UTF8

# XMLネームスペースマネージャ
$nsm = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$nsm.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$nsm.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
$nsm.AddNamespace("wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing")
$nsm.AddNamespace("a", "http://schemas.openxmlformats.org/drawingml/2006/main")
$nsm.AddNamespace("pic", "http://schemas.openxmlformats.org/drawingml/2006/picture")

# リレーションシップファイルを読み込み（画像IDとファイル名のマッピング）
$relsFile = Join-Path $tempDir "extracted\word\_rels\document.xml.rels"
[xml]$rels = Get-Content $relsFile -Encoding UTF8
$imageRels = @{}
foreach ($rel in $rels.Relationships.Relationship) {
    if ($rel.Type -match "image") {
        $imageRels[$rel.Id] = $rel.Target -replace "media/", ""
    }
}

# パラグラフごとにテキストと画像を順序通りに抽出
$paragraphs = $doc.SelectNodes("//w:body/w:p", $nsm)
$contentBlocks = @()

foreach ($para in $paragraphs) {
    $textParts = @()
    $imageRefs = @()
    
    foreach ($run in $para.SelectNodes("w:r", $nsm)) {
        # テキスト要素
        $textNode = $run.SelectSingleNode("w:t", $nsm)
        if ($textNode) {
            $textParts += $textNode.InnerText
        }
        
        # 画像要素
        $drawing = $run.SelectSingleNode(".//pic:blipFill/a:blip/@r:embed", $nsm)
        if ($drawing) {
            $rId = $drawing.Value
            if ($imageRels.ContainsKey($rId)) {
                $originalFile = $imageRels[$rId]
                # 対応するコピー先ファイル名を検索
                $imgIndex = [array]::IndexOf(
                    (Get-ChildItem (Join-Path $tempDir "extracted\word\media") -File | Sort-Object Name | ForEach-Object { $_.Name }),
                    $originalFile
                )
                if ($imgIndex -ge 0 -and $imgIndex -lt $imageFiles.Count) {
                    $imageRefs += $imageFiles[$imgIndex]
                }
            }
        }
    }
    
    $text = ($textParts -join "").Trim()
    
    if ($text -ne "" -or $imageRefs.Count -gt 0) {
        $contentBlocks += [PSCustomObject]@{
            Text = $text
            Images = $imageRefs
        }
    }
}

Write-Host "  テキストブロック: $($contentBlocks.Count) 件"

# --- Step 4: HTMLを生成 ---
Write-Host "[4/4] HTMLファイルを生成中..." -ForegroundColor Yellow

# テキスト部分のHTMLを構築（タイトル行と著者行をスキップ）
$bodyHtml = ""
$skipFirst = $true  # 最初の「週刊東山通信」をスキップ
$skipTitle = $true  # 2行目のタイトルをスキップ

foreach ($block in $contentBlocks) {
    # 最初の行（「週刊東山通信」）をスキップ
    if ($skipFirst -and $block.Text -eq "週刊東山通信") {
        $skipFirst = $false
        continue
    }
    # タイトル行をスキップ
    if ($skipTitle -and $block.Text -eq $Title) {
        $skipTitle = $false
        continue
    }
    # 著者名の行
    if ($block.Text -eq $Author -and $block.Images.Count -eq 0) {
        $bodyHtml += "`n                <br><br>`n`n                <p>${Author}</p><br>"
        continue
    }
    
    # 画像の出力
    foreach ($img in $block.Images) {
        $altText = "コラム${ColumnNumber}の画像"
        $bodyHtml += "`n`n                <p align=`"center`"><img src=`"$img`" alt=`"$altText`"></p>"
    }
    
    # テキストの出力
    if ($block.Text -ne "") {
        $bodyHtml += "`n`n                <p>　$($block.Text)</p>"
    }
}

# テンプレートHTMLの出力ファイル名
$outputFile = Join-Path $projectRoot "column${columnNum}.html"

Write-Host ""
Write-Host "=== 変換完了 ===" -ForegroundColor Green
Write-Host "出力ファイル: $outputFile"
Write-Host "画像ファイル: $($imageFiles -join ', ')"
Write-Host ""
Write-Host "注意: 生成されたHTMLファイルの画像キャプションや段落分けは手動で調整が必要な場合があります。" -ForegroundColor Yellow

# 一時ディレクトリを削除
Remove-Item -Recurse -Force $tempDir

Write-Host "一時ファイルを削除しました。" -ForegroundColor Gray
