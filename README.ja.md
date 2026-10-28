<p align="right">
  <a href="./README.md">EN</a> | <a href="./README.zh-CN.md">简</a> | <a href="./README.zh-TW.md">繁</a> | <a href="./README.ko.md">KO</a> | <strong>JA</strong> | <a href="./README.pt-BR.md">PT</a>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Token Monitor コミュニティプラグイン" width="120">
  <h1>Token Monitor コミュニティプラグイン</h1>
  <p><em>アプリとは独立してリリースする任意の拡張機能。</em></p>
</div>

## 概要

[Token Monitor](https://github.com/Javis603/token-monitor) 向けのコミュニティプラグインです。各プラグインには独自のバージョン、README、互換性要件、ライセンス表記があります。

| プラグイン | 説明 | バージョン |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.ja.md) | ローカルのリアルタイムルーティングとコンテキストを表示。 | `0.1.0` |

## インストール

**設定 → プラグイン → ファイルからインストール**で完全なプラグインフォルダまたは `.tmplugin` を読み込み、内容を確認して有効にします。対応アプリのバージョン、OS、設定は各 README を確認してください。利用者による Node.js の別途インストールは不要です。

## 開発

開発ツールには Node 22.15+ が必要です。npm のランタイム依存はありません。ビルドには Token Monitor ソースのパッケージ検証器を使います。`--local-only` は公開せずテスト用パッケージを生成します。

```sh
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## ドキュメント

- [保守と公開](docs/releasing.md)
- [検証範囲](docs/verification.md)
- [変更履歴](plugins/magpie-routes/CHANGELOG.ja.md)

## ライセンス

独自のコードと文書は [MIT](LICENSE) です。第三者のライセンスと出典は [NOTICE](NOTICE.md) に記載しています。
