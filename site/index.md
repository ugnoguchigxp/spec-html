---
layout: default
title: 仕様書を、読みやすく。
description: HTMLとMarkdownで書いた設計書や仕様書を、手元のブラウザで読みやすく表示・編集できるオープンソースのビューアー。
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
          HTMLで書いた新しい仕様書も、既存のMarkdownも、同じ画面で読めます。
          フォルダ内の文書を自動で一覧にし、表示したまま元のファイルを編集できます。
        </p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://github.com/ugnoguchigxp/spec-html">GitHubで見る <span aria-hidden="true">↗</span></a>
          <a class="button button-secondary" href="https://github.com/ugnoguchigxp/spec-html/blob/main/README.ja.md#quick-start">すぐに試す <span aria-hidden="true">→</span></a>
        </div>
        <ul class="hero-facts">
          <li><span aria-hidden="true">✓</span> ローカルで動作</li>
          <li><span aria-hidden="true">✓</span> Markdownをそのまま表示</li>
          <li><span aria-hidden="true">✓</span> MITライセンス</li>
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
        <h2>文書を自動で一覧化</h2>
        <p>フォルダ内のHTMLとMarkdownを読み取り、文書の見出しからメニューを作ります。</p>
      </article>
      <article>
        <span class="outcome-number">02</span>
        <h2>必要な情報を見やすく表示</h2>
        <p>表、注記、画像に加え、Mermaidの図やChart.jsのグラフも文書の中に表示できます。</p>
      </article>
      <article>
        <span class="outcome-number">03</span>
        <h2>表示したまま編集</h2>
        <p>元のHTMLやMarkdownをビューアーから開いて保存できます。変更後は表示が自動で更新されます。</p>
      </article>
    </div>
  </section>

  <section class="section features" id="features" aria-labelledby="features-title">
    <div class="shell">
      <div class="section-heading">
        <div>
          <p class="kicker">仕様書を読むための機能</p>
          <h2 id="features-title"><span class="heading-line">仕様書を探す、</span><span class="heading-line">読む、直す。</span></h2>
        </div>
        <p>Spec HTMLは、文書の閲覧と編集に必要な機能に絞ったツールです。文書ごとにCSSやメニューを用意する必要はありません。</p>
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
          <p>既存のMarkdownは変換せずに表示し、必要な文書だけを編集できるHTMLへ変換できます。</p>
          <div class="format-demo" aria-hidden="true"><span>.md</span><i>→</i><span>&lt;article&gt;</span></div>
        </article>

        <article class="feature-card feature-code">
          <span class="feature-index">D</span>
          <h3>Lint / Fix / Format</h3>
          <p>見出し構造、リンク、アクセシビリティを検査します。タグ名や属性名の明らかな誤りと書式もCLIで直せます。</p>
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
        <p class="kicker">使い始める</p>
        <h2 id="quick-title"><span class="heading-line">プロジェクトへ追加。</span><span class="heading-line">すぐに使えます。</span></h2>
        <p>Spec HTMLをインストールし、仕様書を<code>specs/</code>に置いて起動します。ファイルを保存すると、ブラウザの表示も自動で更新されます。</p>
        <ol>
          <li><span>1</span><div><b>インストール</b><small>プロジェクトの開発用ツールとして追加</small></div></li>
          <li><span>2</span><div><b>文書を置く</b><small>HTMLまたはMarkdownを<code>specs/</code>へ追加</small></div></li>
          <li><span>3</span><div><b>ブラウザで開く</b><small>ローカルビューアーを起動</small></div></li>
        </ol>
      </div>

      <div class="terminal" role="region" aria-label="Spec HTMLのクイックスタートコマンド">
        <div class="terminal-bar">
          <div aria-hidden="true"><span></span><span></span><span></span></div>
          <small>Terminal</small>
        </div>
        <pre><code><span class="comment"># 1. install</span>
<span class="prompt">$</span> npm install --save-dev spec-html

<span class="comment"># 2. add your documents</span>
<span class="prompt">$</span> mkdir -p specs

<span class="comment"># 3. open the viewer</span>
<span class="prompt">$</span> npx spec-html ./specs

<span class="success">✓ Viewer ready at http://127.0.0.1:4173</span></code></pre>
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
      <p>まずは、既存のMarkdownを開くところから始められます。</p>
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
