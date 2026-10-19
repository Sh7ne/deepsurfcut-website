import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { locales, languageMenu } from './locales.mjs';

const root = new URL('../', import.meta.url);
const appStore = 'https://apps.apple.com/app/deepsurfcut/id6776393723';
const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const ui = {
  de: {
    lang: 'de', locale: 'de_DE', home: '/de/', title: 'App-Updates für iOS und macOS | DeepSurfCut',
    description: 'DeepSurfCut-Updates für iOS und macOS: Verbesserungen bei Surfer-Tracking, Timeline-Bearbeitung, Portrait Follow und Videoexport.',
    heading: 'Neu in DeepSurfCut', intro: 'Bessere Sessions, Update für Update.',
    updates: 'Updates', workflow: 'So funktioniert’s', editor: 'Der Editor', devices: 'Deine Geräte',
    download: 'App laden', skip: 'Zum Inhalt', menu: 'Menü öffnen', navigation: 'Hauptnavigation',
    platform: 'Plattform', latest: 'Neueste Version', version: 'Version', ios: 'iOS & iPadOS', macos: 'macOS',
    iosDetail: 'Für iPhone und iPad', macosDetail: 'Für Mac', history: 'Versionsverlauf',
    source: 'Im App Store ansehen', dates: 'Veröffentlichungsdaten werden in UTC angezeigt.',
    missing: 'Diese Version ist im App-Store-Verlauf aufgeführt, aber es sind keine Versionshinweise verfügbar.',
    permalink: 'Link zur Version', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen', support: 'Support',
    imageAlt: 'DeepSurfCut auf dem Mac mit Surfergruppen und einer bearbeitbaren Timeline',
    followGuide: 'Portrait Follow: Anleitung für 9:16-Surfvideos',
  },
  en: {
    lang: 'en', locale: 'en_US', alternateLocale: 'zh_CN', home: '/', other: '/zh/updates/',
    otherLang: 'zh-Hans', otherLabel: '中文', title: 'App Updates for iOS and macOS | DeepSurfCut',
    description: 'Explore DeepSurfCut release notes for iOS and macOS: surfer tracking, timeline editing, Portrait Follow, and video export improvements.',
    heading: "What's new", intro: 'Better sessions, one update at a time.',
    updates: 'Updates', workflow: 'How it works', editor: 'The editor', devices: 'On your devices',
    download: 'Get DeepSurfCut', skip: 'Skip to content', menu: 'Open menu', navigation: 'Primary navigation',
    platform: 'Platform', latest: 'Latest release', version: 'Version', ios: 'iOS & iPadOS', macos: 'macOS',
    iosDetail: 'For iPhone and iPad', macosDetail: 'For Mac', history: 'Release history',
    source: 'View on the App Store', dates: 'Release dates are shown in UTC.',
    missing: 'This version appears in the App Store history, but no release notes are available.',
    permalink: 'Link to version', privacy: 'Privacy', terms: 'Terms', support: 'Support',
    imageAlt: 'DeepSurfCut Mac video workspace with rider groups and an editable timeline',
    followGuide: 'How to export 9:16 surf videos with Portrait Follow',
  },
  zh: {
    lang: 'zh-Hans', locale: 'zh_CN', alternateLocale: 'en_US', home: '/zh/', other: '/updates/',
    otherLang: 'en', otherLabel: 'English', title: 'iOS 与 macOS 版本更新记录｜DeepSurfCut',
    description: '查看 DeepSurfCut 的 iOS 与 macOS 更新记录，了解人物追踪、时间线编辑、竖屏跟拍与视频导出的历次改进。',
    heading: '版本更新', intro: '每一次更新，让每一场冲浪更好整理。',
    updates: '更新记录', workflow: '一键整理', editor: '剪辑与导出', devices: '支持设备',
    download: '下载 App', skip: '跳转到正文', menu: '打开菜单', navigation: '主导航',
    platform: '平台', latest: '最新版本', version: '版本', ios: 'iOS 与 iPadOS', macos: 'macOS',
    iosDetail: '适用于 iPhone 和 iPad', macosDetail: '适用于 Mac', history: '版本历史',
    source: '在 App Store 查看', dates: '发布日期统一使用 UTC。',
    missing: 'App Store 历史中可查到此版本，但没有提供更新说明。',
    permalink: '此版本的链接', privacy: '隐私', terms: '条款', support: '支持',
    imageAlt: 'DeepSurfCut Mac 视频工作区，展示人物分组与可编辑的时间线',
    followGuide: '竖屏跟拍教程：导出 9:16 冲浪视频',
  },
};

export function renderUpdates(data, language) {
  const t = ui[language];
  const path = `${t.home}updates/`;
  const url = `https://deepsurf.app${path}`;
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const languageLink = languageMenu(language, 'updates/', true);
  const navigation = `<a href="${t.home}#autocut">${t.workflow}</a><a href="${t.home}#product">${t.editor}</a><a href="${t.home}#platforms">${t.devices}</a><a href="${path}" aria-current="page">${t.updates}</a>`;
  const supporting = `<a href="${t.home}privacy/">${t.privacy}</a><a href="${t.home}terms/">${t.terms}</a><a href="${t.home}support/">${t.support}</a>`;
  const brand = `<a class="brand" href="${t.home}" aria-label="DeepSurfCut"><img src="/assets/app-icon-128.png" alt="" width="32" height="32" /><span>DeepSurfCut</span></a>`;
  const date = (value) => new Intl.DateTimeFormat(t.lang, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
  const tabs = Object.entries(data.platforms).map(([platform, releases]) => `
          <a id="tab-${platform}" class="platform-tab" data-platform-tab="${platform}" href="#${platform}">
            ${icon(platform === 'ios' ? 'smartphone' : 'laptop')}<span>${platform === 'ios' ? 'iOS' : 'macOS'}</span><span class="tab-version">${escape(releases[0].version)}</span>
          </a>`).join('');
  const panels = Object.entries(data.platforms).map(([platform, releases]) => `
      <section id="${platform}" class="release-panel" data-platform-panel="${platform}" aria-labelledby="heading-${platform}">
        <div class="platform-heading">
          <div><h2 id="heading-${platform}">${t[platform]}</h2><p>${t[`${platform}Detail`]}</p></div>
          <a class="store-link" href="${appStore}?platform=${platform === 'ios' ? 'iphone' : 'mac'}" target="_blank" rel="noopener">${t.source}${icon('arrow-up-right')}</a>
        </div>
        <ol class="release-list" aria-label="${t[platform]} ${t.history}">${releases.map((release, index) => {
    const id = `${platform}-${release.version}`;
    return `
          <li>
            <article id="${id}" class="release" aria-labelledby="title-${id}">
              <div class="release-meta">
                <a class="release-version" href="#${id}" aria-label="${t.permalink} ${escape(release.version)}">${escape(release.version)}${icon('link')}</a>
                <time datetime="${escape(release.releasedAt)}">${date(release.releasedAt)}</time>${index === 0 ? `\n                <span class="latest-label">${t.latest}</span>` : ''}
              </div>
              <div class="release-content">
                <h3 id="title-${id}">${escape(release.title[language])}</h3>
                ${release.notes.length ? `<ul>${release.notes.map((note) => `\n                  <li>${escape(note[language])}</li>`).join('')}\n                </ul>` : `<p class="missing-notes">${t.missing}</p>`}${release.notes.some((note) => /Portrait Follow/i.test(note.en)) ? `\n                <p><a href="${t.home}portrait-follow/">${t.followGuide}</a></p>` : ''}
              </div>
            </article>
          </li>`;
  }).join('')}
        </ol>
      </section>`).join('');
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`,
    url, name: t.title, description: t.description, inLanguage: t.lang, dateModified: data.updated,
    isPartOf: { '@id': 'https://deepsurf.app/#website' }, about: { '@id': 'https://deepsurf.app/#software' },
  };
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(t.title)}</title>
    <meta name="description" content="${escape(t.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta name="apple-itunes-app" content="app-id=6776393723" />
    <meta name="theme-color" content="#fafbfc" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="https://deepsurf.app/updates/" />
    <link rel="alternate" hreflang="zh-Hans" href="https://deepsurf.app/zh/updates/" />
    <link rel="alternate" hreflang="de" href="https://deepsurf.app/de/updates/" />
    <link rel="alternate" hreflang="x-default" href="https://deepsurf.app/updates/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="DeepSurfCut" />
    <meta property="og:title" content="${escape(t.title)}" />
    <meta property="og:description" content="${escape(t.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="${t.locale}" />
    ${Object.values(locales).filter((value) => value.lang !== t.lang).map((value) => `<meta property="og:locale:alternate" content="${value.locale}" />`).join('\n    ')}
    <meta property="og:image" content="https://deepsurf.app/assets/social-preview-20260917.jpg" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="753" />
    <meta property="og:image:alt" content="${escape(t.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(t.title)}" />
    <meta name="twitter:description" content="${escape(t.description)}" />
    <meta name="twitter:image" content="https://deepsurf.app/assets/social-preview-20260917.jpg" />
    <meta name="twitter:image:alt" content="${escape(t.imageAlt)}" />
    <link rel="icon" href="/assets/favicon-96.png" type="image/png" sizes="96x96" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180" />
    <link rel="stylesheet" href="/home.css?v=20261019-footer-1" />
    <link rel="stylesheet" href="/legal.css?v=20260912-4" />
    <link rel="stylesheet" href="/updates.css?v=20261014-1" />
    <script src="/assets/icons-20261015.js" defer></script>
    <script src="/home.js?v=20261015-1" defer></script>
    <script src="/updates.js?v=20261014-1" defer></script>
    <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">${t.skip}</a>
    <header class="site-header legal-header" data-header>
      <div class="header-inner">
        ${brand}
        <nav class="desktop-nav" aria-label="${t.navigation}">${navigation}</nav>
        <div class="header-actions">${languageLink}<a class="header-download" href="${appStore}" target="_blank" rel="noopener">${t.download}${icon('arrow-up-right')}</a><button class="icon-button menu-toggle" type="button" data-menu-toggle aria-controls="mobile-nav" aria-expanded="false" aria-label="${t.menu}" title="${t.menu}">${icon('menu')}</button></div>
      </div>
      <nav id="mobile-nav" class="mobile-nav" aria-label="${t.navigation}" hidden>${navigation}${supporting}</nav>
    </header>
    <main id="main" class="updates-main">
      <header class="updates-heading">
        <p class="eyebrow">DeepSurfCut</p>
        <h1>${t.heading}</h1>
        <p class="updates-intro">${t.intro}</p>
      </header>
      <nav class="platform-tabs" data-platform-tabs aria-label="${t.platform}">${tabs}
      </nav>${panels}
      <p class="release-source-note">${t.dates}</p>
    </main>
    <footer class="site-footer wrap"><a class="brand" href="${t.home}"><span>DeepSurfCut</span></a><p>© <span data-year>2026</span> DeepSurfCut</p><nav aria-label="${t.support}">${supporting}<a href="${path}" aria-current="page">${t.updates}</a>${languageLink}</nav></footer>
  </body>
</html>
`;
}

export async function updatePages({ check = false } = {}) {
  const data = JSON.parse(await readFile(new URL('content/releases.json', root), 'utf8'));
  for (const [language, path] of [['en', 'updates/'], ['zh', 'zh/updates/'], ['de', 'de/updates/']]) {
    const file = new URL(`${path}index.html`, root);
    const html = renderUpdates(data, language);
    if (check) {
      if (await readFile(file, 'utf8') !== html) throw new Error(`Run npm run updates:generate to refresh ${path}`);
    } else {
      await mkdir(new URL(path, root), { recursive: true });
      await writeFile(file, html);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await updatePages({ check: process.argv.includes('--check') });
}
