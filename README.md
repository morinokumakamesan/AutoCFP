# 学会カレンダー / Conference Deadline Calendar

学会の論文投稿締切と開催日程を可視化するWebアプリケーションです。

## 機能

- 📅 月ごとのカレンダー表示で締切と開催日を可視化
- 🔍 注力テーマ、ランク、会議名による絞り込み機能
- 📊 複数の締切タイプ（Submission、Notification、Camera Ready、Conference）の表示
- 🔮 次年度の日程予測機能
- 🔄 定期的な自動更新（毎日実行）

## セットアップ

### 前提条件

- Python 3.8以上
- [uv](https://github.com/astral-sh/uv) (推奨) または pip

### インストール

1. リポジトリをクローン:
```bash
git clone <repository-url>
cd AutoCFP
```

2. uvのインストール（まだの場合）:
```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# pipを使用する場合
pip install uv
```

3. 必要なPythonパッケージをインストール:
```bash
# uvを使用する場合（推奨）
uv sync

# pipを使用する場合
pip install -r requirements.txt
```

**注意**: 会議データのCSVファイル（`public/data/conferences.csv`）を手動で配置する必要があります。CSVファイルの形式については、[カスタマイズ](#カスタマイズ)セクションを参照してください。

### データの生成

1. 基本データの生成:
```bash
# uvを使用する場合
uv run python scripts/parse_conferences.py

# または直接Pythonを使用
python scripts/parse_conferences.py
```

2. CFP情報の取得（オプション、時間がかかります）:
```bash
# uvを使用する場合
uv run python scripts/scrape_cfp.py

# または直接Pythonを使用
python scripts/scrape_cfp.py
```

### ローカルでの表示

Pythonの簡易HTTPサーバーを使用:
```bash
cd public
python -m http.server 8000
```

ブラウザで http://localhost:8000 にアクセス

## GitHub Pagesでの公開

### 初回設定

1. GitHubにリポジトリをプッシュ

2. リポジトリの Settings > Pages で以下を設定:
   - Source: GitHub Actions

3. 初回のデータ生成とコミット:
```bash
# uvを使用する場合
uv run python scripts/parse_conferences.py

# または直接Pythonを使用
python scripts/parse_conferences.py

# データをコミット
git add public/data/conferences_base.json
git commit -m "Add initial conference data"
git push
```

4. GitHub Actionsが自動的に実行され、サイトがデプロイされます

### 自動更新

- GitHub Actionsワークフローが毎日00:00 UTC（日本時間09:00）に自動実行されます
- 手動での実行も可能（Actions タブから "Update CFP Data" ワークフローを実行）

## ファイル構成

```
AutoCFP/
├── .github/
│   └── workflows/
│       └── update-cfp.yml      # GitHub Actionsワークフロー
├── public/
│   ├── index.html              # メインHTML
│   ├── css/
│   │   └── style.css          # スタイルシート
│   ├── js/
│   │   └── calendar.js        # カレンダーロジック
│   └── data/
│       ├── conferences.csv           # 会議データCSV（gitignore）
│       ├── conferences_base.json     # 基本会議データ
│       └── conferences_with_cfp.json # CFP情報を含む会議データ
├── scripts/
│   ├── parse_conferences.py    # CSVパーサー
│   └── scrape_cfp.py          # CFPスクレイパー
└── README.md
```

## カスタマイズ

### CSVファイルの形式

以下のカラムが必要です:
- 注力テーマ
- 採用区分
- 論文誌・会議ID
- 正式名称
- 略称
- ランク
- 分野小分類
- フラッグシップ
- 論文誌 or 会議

### スクレイピング設定

`scripts/scrape_cfp.py` を編集して、追加のデータソースを設定できます。

## データソース

- CSVファイル（基本情報）
- [WikiCFP](http://www.wikicfp.com/)（CFP情報）
- 各会議の公式サイト

## ライセンス

MIT License

## 注意事項

- Webスクレイピングは対象サイトの利用規約に従ってください
- 大量のリクエストを避けるため、適切な間隔を設けています
- 予測日程は参考情報であり、必ず公式サイトで確認してください
