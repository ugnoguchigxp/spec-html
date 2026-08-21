---
layout: default
title: 仕様書を、読みやすく。
description: HTMLとMarkdownの設計書をローカルで閲覧・編集し、MarkdownからHTMLへの変換・移行と、Lint・Fix・Formatまで行えるオープンソースのビューアー。
permalink: /
image: /assets/img/og-image.jpg
body_class: lp-body
preload_hero: true
twitter_image_alt: Spec HTMLでMermaid図と目次を表示している画面
og_image_alt: Spec HTMLでMermaid図と目次を表示している画面
---

<header class="site-header">
  <a class="skip-link" href="#main">本文へ移動</a>
  <div class="shell header-inner">
    <a class="brand" href="{{ '/' | relative_url }}" aria-label="Spec HTML トップ">
      <span class="brand-mark" aria-hidden="true">S/</span>
      <span>Spec HTML</span>
    </a>
    <nav class="site-nav" aria-label="メインナビゲーション">
      <a href="#features">特徴</a>
      <a href="#quick-start">使い方</a>
      <a href="#security">安全性</a>
    </nav>
    <a class="header-link" href="https://github.com/ugnoguchigxp/spec-html">GitHub <span aria-hidden="true">↗</span></a>
  </div>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <div class="shell hero-grid">
      <div class="hero-copy">
        <p class="eyebrow"><span></span> 設計書と仕様書のローカルビューアー</p>
        <h1 id="hero-title"><span class="heading-line">仕様書を、</span><span class="heading-line"><em>読みやすく。</em></span></h1>
        <p class="hero-lead">
          HTMLで書いた仕様書も、既存のMarkdownも、同じ画面で読んで編集できます。
          Markdownをそのまま使いながら、必要な文書だけHTMLへ変換・移行し、見出しやリンクを検査できます。
        </p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://github.com/ugnoguchigxp/spec-html">GitHubで見る <span aria-hidden="true">↗</span></a>
          <a class="button button-secondary" href="https://github.com/ugnoguchigxp/spec-html/blob/main/README.ja.md#quick-start">すぐに試す <span aria-hidden="true">→</span></a>
        </div>
        <ul class="hero-facts">
          <li><span aria-hidden="true">✓</span> Markdownをそのまま表示</li>
          <li><span aria-hidden="true">✓</span> HTMLへ変換・一括移行</li>
          <li><span aria-hidden="true">✓</span> Lint / Fix / Format</li>
        </ul>
      </div>

      <div class="hero-product">
        <figure class="app-frame">
          <img
            src="{{ '/assets/img/viewer-mermaid.webp' | relative_url }}"
            alt="Spec HTMLのライト表示で、本文、Mermaid図、右側の目次を同時に表示している画面"
            width="1800"
            height="1100"
            loading="eager"
            decoding="async"
            fetchpriority="high"
          >
          <figcaption>Mermaid図と目次を同じ画面に表示</figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="outcomes" aria-label="Spec HTMLでできること">
    <div class="shell outcome-grid">
      <article>
        <span class="outcome-number">01</span>
        <h2>Markdownを残して始める</h2>
        <p>まずはそのまま表示。必要な文書だけ変換でき、複数文書も内容とリンクを確かめながらまとめて移せます。</p>
      </article>
      <article>
        <span class="outcome-number">02</span>
        <h2>構造を残して検査</h2>
        <p>見出し、表、図、注記の関係をHTMLに残し、リンクや説明の不足を検査します。明らかなタグの誤りや書式も整えられます。</p>
      </article>
      <article>
        <span class="outcome-number">03</span>
        <h2>読んで、その場で直す</h2>
        <p>目次付きのビューアーから元のHTMLやMarkdownを開いて保存できます。変更後は表示が自動で更新されます。</p>
      </article>
    </div>
  </section>

  <section class="section features" id="features" aria-labelledby="features-title">
    <div class="shell">
      <div class="section-heading">
        <div>
          <p class="kicker">閲覧、変換、検査をひとつに</p>
          <h2 id="features-title"><span class="heading-line">仕様書を探す、</span><span class="heading-line">読む、直す。</span></h2>
        </div>
        <p>LLMには本文のHTML断片だけを書かせ、表示は共通ビューアーに任せられます。既存Markdownの閲覧、変換、編集、検査も同じプロジェクトで扱えます。</p>
      </div>

      <div class="feature-grid">
        <article class="feature-card feature-wide feature-navigation">
          <div>
            <span class="feature-index">A</span>
            <h3>目当ての文書がすぐ見つかる</h3>
            <p>フォルダ構造と最初の見出しからメニューを作ります。文書は名前順または更新日順に並べ替えられます。</p>
          </div>
          <div class="nav-demo" aria-hidden="true">
            <div class="nav-demo-controls"><span>Name ↑</span><span>Date</span></div>
            <div><i></i><b>Architecture</b><small>2 min</small></div>
            <div class="active"><i></i><b>API design</b><small>now</small></div>
            <div><i></i><b>Release plan</b><small>1 day</small></div>
          </div>
        </article>

        <article class="feature-card feature-theme">
          <span class="feature-index">B</span>
          <h3>Light / Dark</h3>
          <p>OSの設定に合わせて、文書、Mermaid図、Chart.jsグラフの配色をまとめて切り替えます。</p>
          <div class="theme-orbit" aria-hidden="true"><span>Light</span><i></i><span>Dark</span></div>
        </article>

        <article class="feature-card feature-format">
          <span class="feature-index">C</span>
          <h3>HTML + Markdown</h3>
          <p>Markdownはそのまま表示。1文書の変換と、リンク検査・ロールバック付きの一括移行にも対応します。</p>
          <div class="format-demo" aria-hidden="true"><span>.md</span><i>→</i><span>&lt;article&gt;</span></div>
        </article>

        <article class="feature-card feature-code">
          <span class="feature-index">D</span>
          <h3>Lint / Fix / Format</h3>
          <p>HTMLとMarkdownの見出し・リンクを検査し、HTMLでは図表やアクセシビリティも確認します。明らかな誤りと書式はCLIで直せます。</p>
          <pre><code><span>$</span> npx spec-html check ./specs
<b>✓ 12 documents checked</b></code></pre>
        </article>

        <article class="feature-card feature-diagram">
          <span class="feature-index">E</span>
          <h3>図やグラフも文書の中に</h3>
          <p>MermaidとChart.jsは必要な場合だけ追加できます。別のSVG画像を管理せず、文書に書いた内容から図表を表示します。</p>
          <div class="diagram-demo" aria-hidden="true">
            <span>Source</span><i></i><span>Viewer</span><i></i><span>Diagram</span>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="section quick-start" id="quick-start" aria-labelledby="quick-title">
    <div class="shell quick-grid">
      <div class="quick-copy">
        <p class="kicker">Markdownのまま始める</p>
        <h2 id="quick-title"><span class="heading-line">いまある文書で、</span><span class="heading-line">すぐに試せます。</span></h2>
        <p>Spec HTMLをインストールし、仕様書のフォルダを開くだけです。Markdownを変換せずに読み、必要な文書だけHTMLへ移せます。</p>
        <ol>
          <li><span>1</span><div><b>インストール</b><small>プロジェクトの開発用ツールとして追加</small></div></li>
          <li><span>2</span><div><b>そのまま開く</b><small>既存のHTMLとMarkdownをブラウザで表示</small></div></li>
          <li><span>3</span><div><b>必要なら変換</b><small>選んだMarkdownだけをHTMLへ変換</small></div></li>
          <li><span>4</span><div><b>文書を検査</b><small>見出し、リンク、書式をまとめて確認</small></div></li>
        </ol>
      </div>

      <div class="terminal" role="region" aria-label="Spec HTMLのクイックスタートコマンド">
        <div class="terminal-bar">
          <div aria-hidden="true"><span></span><span></span><span></span></div>
          <small>Terminal</small>
        </div>
        <pre><code><span class="comment"># install</span>
<span class="prompt">$</span> npm install --save-dev spec-html

<span class="comment"># open existing HTML and Markdown</span>
<span class="prompt">$</span> npx spec-html ./specs

<span class="comment"># convert only when needed</span>
<span class="prompt">$</span> npx spec-html convert ./specs/design.md --lang ja --output ./specs/design.html

<span class="comment"># fix, format, and lint</span>
<span class="prompt">$</span> npx spec-html check ./specs --fix --warnings-as-errors

<span class="success">✓ Documents ready</span></code></pre>
      </div>
    </div>
  </section>

  <section class="section showcase" aria-labelledby="showcase-title">
    <div class="shell showcase-grid">
      <div class="showcase-image-wrap">
        <figure>
          <img
            src="{{ '/assets/img/viewer-chart.webp' | relative_url }}"
            alt="Spec HTMLのダーク表示で、Chart.jsグラフ、本文、右側の目次を同時に表示している画面"
            width="1800"
            height="1100"
            loading="lazy"
            decoding="async"
          >
        </figure>
        <span class="showcase-label">Chart.js · ダーク表示</span>
      </div>
      <div class="showcase-copy">
        <p class="kicker">本文と目次を同時に表示</p>
        <h2 id="showcase-title"><span class="heading-line">長い仕様書でも、</span><span class="heading-line">目次からすぐに</span><span class="heading-line">移動できます。</span></h2>
        <p>文書の見出しから目次を自動で作り、画面の左または右に表示します。長いページを読んでいる途中でも、全体の構成を確認して別の節へ移動できます。</p>
        <ul>
          <li>見出しから目次を自動作成</li>
          <li>文書間のリンクとローカル画像をそのまま利用</li>
          <li>ライト・ダーク表示の選択を保存</li>
          <li>印刷するときは文書だけを読みやすく整形</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section security" id="security" aria-labelledby="security-title">
    <div class="shell security-panel">
      <div class="security-icon" aria-hidden="true">⌂</div>
      <div>
        <p class="kicker">ローカルで使うための設計</p>
        <h2 id="security-title"><span class="heading-line">信頼できる文書を、</span><span class="heading-line">手元で開きます。</span></h2>
        <p>Spec HTMLは、信頼できるHTMLとMarkdownをローカルで閲覧するためのツールです。指定したフォルダの外にあるファイルは開かず、名前がドットで始まるファイルも公開しません。一方、HTML内のスクリプトは実行されるため、信頼できないHTMLには使わないでください。</p>
      </div>
      <div class="security-tags">
        <span>接続先を確認</span>
        <span>指定外のファイルを拒否</span>
        <span>隠しファイルを非公開</span>
      </div>
    </div>
  </section>

  <section class="final-cta" aria-labelledby="cta-title">
    <div class="shell cta-panel">
      <p class="kicker">Open source · MIT</p>
      <h2 id="cta-title"><span class="heading-line">手元の仕様書を、</span><span class="heading-line">もっと読みやすく。</span></h2>
      <p>いまあるMarkdownをそのまま開き、必要になった文書だけHTMLへ移せます。</p>
      <div class="hero-actions">
        <a class="button button-inverse" href="https://github.com/ugnoguchigxp/spec-html">GitHubで使い方を見る <span aria-hidden="true">↗</span></a>
        <a class="text-link" href="https://www.npmjs.com/package/spec-html">npmで確認する <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="shell">
    <a class="brand footer-brand" href="{{ '/' | relative_url }}"><span class="brand-mark" aria-hidden="true">S/</span><span>Spec HTML</span></a>
    <p>仕様書を、読みやすく。</p>
    <div>
      <a href="https://github.com/ugnoguchigxp/spec-html">GitHub</a>
      <a href="https://www.npmjs.com/package/spec-html">npm</a>
      <a href="https://github.com/ugnoguchigxp/spec-html/blob/main/LICENSE">MIT License</a>
    </div>
  </div>
</footer>
