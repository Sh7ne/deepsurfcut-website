import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const origin = 'https://deepsurf.app';
const mapPath = '/RapidSurfingMap';
const escape = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const cities = { '北京': '北京', '上海': '上海', '杭州·建德': '杭州·建德', '湖州': '湖州', '成都': '成都', '昆明': '昆明' };

export const venueLabels = {
  zh: {
    lang: 'zh-Hans', locale: 'zh-CN', home: '/zh/', title: '中国深水冲浪场馆地图｜DeepSurfCut',
    description: '探索中国的深水固定浪与 Rapid Surfing 场馆：地图定位、城市筛选、场馆介绍、季节开放信息、收藏与导航。',
    heading: '冲浪地图', edition: '中国版', eyebrow: '', intro: '探索深水冲浪场馆',
    subtitle: 'Rapid Surfing Venues', skip: '跳转到场馆列表', homeLabel: '返回 DeepSurfCut 官网',
    about: '关于这份地图', search: '搜索城市或场馆', searchPlaceholder: '想去哪里冲浪？', clearSearch: '清除搜索',
    all: '全部', allCities: '全部城市', indoor: '室内', outdoor: '室外', seasonal: '季节开放', venues: '处浪点', saved: '已收藏', save: '收藏场馆', unsave: '取消收藏',
    savedToast: '已加入收藏', removedToast: '已取消收藏', mapLoading: '正在加载地图…', mapError: '地图暂时无法加载，仍可浏览场馆和打开导航。', retry: '重试',
    noResults: '还没有匹配的浪点', noResultsHint: '换个关键词，或试试其他城市。', noSaved: '还没有收藏的场馆', noSavedHint: '轻点场馆旁的收藏按钮，把想去的浪点留在这里。',
    reset: '清除筛选', results: '{count} 处浪点', favoritesCount: '已收藏 {count} 处', nearby: '附近',
    locationLoading: '正在获取你的位置…', locationError: '暂时无法获取位置，请稍后重试。', locationDenied: '未获得定位权限。你仍可按城市查找场馆。',
    locationUnsupported: '当前浏览器不支持定位。', locationFound: '已定位到你附近', locationTimeout: '定位超时，请稍后重试。',
    noPosition: '位置待确认', approximate: '大致位置', sitePosition: '场址位置', exactPosition: '场馆位置',
    source: '资料来源', sources: '参考资料', updated: '资料更新', address: '场馆地址', opening: '开放安排', overview: '关于场馆',
    directions: '打开导航', amap: '高德地图', baidu: '百度地图', apple: 'Apple 地图', share: '分享场馆', copy: '复制链接', copyAddress: '复制地址', copied: '链接已复制', shareCopied: '场馆链接已复制',
    shareTitle: '一起去这里冲浪', shareError: '暂时无法分享，请复制浏览器地址。', viewMap: '在地图上查看', close: '关闭', kilometer: '公里',
    filters: '筛选', filterCount: '{count} 项筛选', clear: '清除', details: '场馆详情', dataNotice: '开放安排并非实时营业状态，出发前请向场馆确认。',
    loadingError: '场馆资料加载失败，请刷新页面重试。', unknownStatus: '请提前确认场次', nearestNeedsLocation: '先开启定位，即可按距离排序。',
    listView: '列表', mapView: '地图', savedView: '收藏', noSources: '暂无可链接的公开来源。', copiedAddress: '地址已复制',
    listLabel: '场馆列表', mapLabel: '中国深水冲浪场馆地图', locate: '定位到我', fitMap: '显示全部场馆', zoomIn: '放大地图', zoomOut: '缩小地图',
    expandSheet: '展开或收起场馆列表', sort: '排序', recommended: '推荐顺序', nameSort: '名称', nearestSort: '距离最近',
    environment: '场馆环境', seasonalOnly: '只看季节开放场馆', apply: '查看场馆', filterHint: '找到适合你这一趟的浪点。',
    aboutHeading: '关于冲浪地图', aboutIntro: '一份持续整理的中国深水固定浪场馆目录，由 DeepSurfCut 制作。',
    aboutScope: '这份地图收录已整理的商业深水固定浪场馆。薄水层模拟冲浪、自然河流浪点以及尚待核实的项目不计入场馆数量。',
    aboutDates: '资料日期见各场馆详情。目录记录不代表场馆此刻营业；季节安排、预约和场次请以场馆最新确认为准。',
    aboutPositions: '地图区分场馆、所在园区和大致位置。标注不能代替入口确认；导航时请再次核对场馆名称与地址。',
    aboutPrivacy: '收藏和地图选择保存在当前浏览器。只有轻点定位按钮后才会请求你的位置。所选地图服务会接收加载地图及转换坐标所需的数据；网站不保存你的位置。',
    aboutMap: '使用百度地图浏览场馆，也可通过地图菜单切换备用地图。地图加载失败时，仍可阅读场馆资料并打开导航。',
    mapProvider: '地图服务', mapServiceMark: '地图服务标识', mapAttribution: '地图版权信息', providerUnavailable: '未配置',
    attribution: '地图数据', noScript: '启用 JavaScript 可使用互动地图、筛选与收藏；以下场馆资料仍可直接阅读。',
  },

};

const iconPaths = {
  wave: '<path d="M2 14c3-7 6-10 10-8 3 1 3 5 1 6 4-1 7 1 9 4M2 19c3-2 5-2 8 0s5 2 8 0 4-1 4-1"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  filters: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  locate: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="m8 8 8 8m0-8-8 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.wave}</svg>`;

function venueCard(venue, index) {
  const t = venueLabels.zh;
  const localized = { ...venue, ...venue.i18n?.zh };
  const copyLang = 'zh-Hans';
  const positionLabel = venue.position?.accuracy === 'venue' ? t.exactPosition : venue.position?.accuracy === 'site' ? t.sitePosition : t.approximate;
  const sourceLinks = (venue.sources || []).map((source) => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}${icon('arrow')}</a></li>`).join('');
  return `
          <article class="venue-card" id="venue-${escape(venue.id)}" data-id="${escape(venue.id)}" aria-labelledby="title-${escape(venue.id)}">
            <div class="venue-card-main">
              <a class="venue-open" href="#venue-${escape(venue.id)}" data-open="${escape(venue.id)}">
                <span class="venue-number" aria-hidden="true"><span>${String(index + 1).padStart(2, '0')}</span>${icon('wave')}</span>
                <span class="venue-copy">
                  <span class="venue-meta"><span class="venue-city">${escape(cities[venue.city] || venue.city)}</span><span class="venue-distance" hidden></span></span>
                  <h3 id="title-${escape(venue.id)}" lang="${copyLang}">${escape(localized.shortName || localized.name)}</h3>
                  <span class="venue-tags"><span class="badge ${venue.environment === 'outdoor' ? 'badge-outdoor' : 'badge-indoor'}">${escape(t[venue.environment] || venue.environment)}</span>${venue.seasonal ? `<span class="badge badge-seasonal">${t.seasonal}</span>` : ''}</span>
                  <span class="venue-summary" lang="${copyLang}">${escape(localized.summary)}</span>
                </span>
                ${icon('chevron', 'card-chevron')}
              </a>
              <button class="save-button icon-button enhance-only" type="button" data-save="${escape(venue.id)}" aria-label="${t.save} · ${escape(localized.name)}" aria-pressed="false">${icon('bookmark')}</button>
            </div>
            <details class="static-details">
              <summary>${t.details}</summary>
              <p lang="${copyLang}">${escape(localized.description)}</p>
              <h4>${t.address}</h4><p lang="${copyLang}">${escape(localized.address)}</p>
              <p class="position-note">${positionLabel}${venue.position?.label ? ` · <span lang="zh-Hans">${escape(venue.position.label)}</span>` : ''}</p>
              <h4>${t.opening}</h4><p lang="${copyLang}">${escape(localized.seasonNote || t.unknownStatus)}</p>
              <p>${t.dataNotice}</p>
              <p>${t.updated}: <time datetime="${escape(venue.verifiedAt)}">${escape(venue.verifiedAt)}</time></p>
              <h4>${t.sources}</h4>${sourceLinks ? `<ul class="source-links">${sourceLinks}</ul>` : `<p>${t.noSources}</p>`}
              <a class="external-navigation" href="https://api.map.baidu.com/place/search?query=${encodeURIComponent(venue.name)}&region=${encodeURIComponent(venue.city)}&output=html&src=webapp.deepsurf.venues" target="_blank" rel="noopener noreferrer">${t.baidu}${icon('arrow')}</a>
            </details>
          </article>`;
}

export function renderVenues(data) {
  const t = venueLabels.zh;
  const url = origin + mapPath;
  const count = data.venues.length;
  const actualCities = [...new Set(data.venues.map((venue) => venue.city))];
  const schemas = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${url}#webpage`,
    url, name: t.title, description: t.description, inLanguage: t.lang, dateModified: data.updatedAt,
    isPartOf: { '@id': `${origin}/#website` },
    mainEntity: { '@type': 'ItemList', numberOfItems: count, itemListElement: data.venues.map((venue, i) => ({ '@type': 'ListItem', position: i + 1, name: venue.name, url: `${url}#venue-${venue.id}` })) },
  };
  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f2f2f7">
  <meta name="description" content="${escape(t.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="${escape(t.heading)}">
  <title>${escape(t.title)}</title>
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DeepSurfCut">
  <meta property="og:locale" content="${t.locale.replace('-', '_')}">
  <meta property="og:title" content="${escape(t.title)}">
  <meta property="og:description" content="${escape(t.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${origin}/assets/social-preview-20260917.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="753">
  <meta property="og:image:alt" content="DeepSurfCut">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(t.title)}">
  <meta name="twitter:description" content="${escape(t.description)}">
  <meta name="twitter:image" content="${origin}/assets/social-preview-20260917.jpg">
  <link rel="icon" href="/assets/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180">
  <link rel="stylesheet" href="/assets/vendor/leaflet/leaflet.css">
  <link rel="stylesheet" href="/venues/map.css?v=20261028-map-about-credits-1">
  <script src="/assets/vendor/leaflet/leaflet.js" defer></script>
  <script type="module" src="/venues/map.js?v=20261028-map-about-credits-1"></script>
  <script type="application/ld+json">${json(schemas)}</script>
</head>
<body data-lang="zh">
  <a class="skip-link" href="#venue-list">${t.skip}</a>
  <main class="map-app">
    <h1 class="sr-only">${t.mapLabel}</h1>
    <section class="map-stage enhance-only" aria-label="${t.mapLabel}">
      <div id="map" role="region" aria-label="${t.mapLabel}" tabindex="0"></div>
      <button id="about-open" class="icon-button map-about-control enhance-only" type="button" aria-label="${t.about}" aria-haspopup="dialog" aria-controls="about-dialog">${icon('info')}</button>
      <div id="map-message" class="map-message" role="status"><span>${t.mapLoading}</span><button id="map-retry" type="button" hidden>${t.retry}</button></div>
      <div class="map-controls">
        <button id="locate" class="icon-button" type="button" aria-label="${t.locate}" title="${t.locate}">${icon('locate')}</button>
        <button id="fit-map" class="icon-button" type="button" aria-label="${t.fitMap}" title="${t.fitMap}">${icon('fit')}</button>
        <div class="zoom-controls"><button id="zoom-in" class="icon-button" type="button" aria-label="${t.zoomIn}">${icon('plus')}</button><button id="zoom-out" class="icon-button" type="button" aria-label="${t.zoomOut}">${icon('minus')}</button></div>
      </div>
      <div class="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>
    </section>
    <aside id="explore-sheet" class="explore-sheet" aria-label="${t.listLabel}">
      <button id="sheet-handle" class="sheet-handle enhance-only" type="button" aria-label="${t.expandSheet}" aria-expanded="false" aria-controls="venue-list"><span></span></button>
      <div class="sheet-header">
        <h2>${t.intro}</h2><p class="sheet-subtitle" lang="en">${t.subtitle}</p>
        <div class="search-row enhance-only"><div class="search-box">${icon('search')}<input id="search" type="search" placeholder="${t.searchPlaceholder}" aria-label="${t.search}" autocomplete="off" enterkeyhint="search"><button id="clear-search" class="icon-button" type="button" aria-label="${t.clearSearch}" hidden>${icon('close')}</button></div><button id="filter-open" class="filter-button icon-button" type="button" aria-label="${t.filters}" aria-haspopup="dialog">${icon('filters')}</button></div>
        <div id="city-filters" class="filter-chips enhance-only" aria-label="${t.allCities}"><button type="button" class="chip active" data-city="all" aria-pressed="true">${t.allCities}</button>${actualCities.map((city) => `<button type="button" class="chip" data-city="${escape(city)}" aria-pressed="false">${escape(cities[city] || city)}</button>`).join('')}</div>
        <div id="active-filters" class="active-filters" hidden></div>
      </div>
      <div class="list-heading"><p><strong id="result-count" aria-live="polite">${count}</strong> <span id="result-label">${t.venues}</span></p><label class="sort-control enhance-only"><span class="sr-only">${t.sort}</span><select id="sort"><option value="recommended">${t.recommended}</option><option value="name">${t.nameSort}</option><option value="nearest">${t.nearestSort}</option></select></label></div>
      <noscript><p class="no-script-note">${t.noScript}<br><a href="${t.home}">${t.homeLabel}</a></p></noscript>
      <div id="venue-list" class="venue-list" tabindex="-1">${data.venues.map((venue, index) => venueCard(venue, index)).join('')}
        <div id="empty-state" class="empty-state" hidden>${icon('wave')}<h3>${t.noResults}</h3><p>${t.noResultsHint}</p><button id="reset-filters" type="button">${t.reset}</button></div>
      </div>
      <p class="directory-note">${t.dataNotice}</p>
    </aside>
  </main>
  <nav class="tab-bar enhance-only" aria-label="${t.heading}"><button type="button" data-view="map" aria-current="page">${icon('map')}<span>${t.mapView}</span></button><button type="button" data-view="list">${icon('list')}<span>${t.listView}</span></button><button type="button" data-view="saved">${icon('bookmark')}<span>${t.savedView}</span><span id="saved-count" class="saved-count" hidden>0</span></button></nav>
  <footer id="provider-attribution" class="provider-attribution" aria-label="${t.mapServiceMark}" hidden></footer>
  <dialog id="venue-detail" class="venue-detail" aria-label="${t.details}"><button id="detail-close" class="dialog-close icon-button" type="button" aria-label="${t.close}">${icon('close')}</button><div id="detail-content"></div></dialog>
  <dialog id="filter-dialog" class="filter-dialog" aria-labelledby="filter-title"><form method="dialog">
    <div class="dialog-heading"><div><p class="sheet-kicker">${t.heading}</p><h2 id="filter-title">${t.filters}</h2></div><button class="icon-button" type="submit" value="cancel" aria-label="${t.close}">${icon('close')}</button></div>
    <p class="dialog-intro">${t.filterHint}</p>
    <fieldset><legend>${t.environment}</legend><div class="environment-options">${['all', 'indoor', 'outdoor'].map((environment) => `<label><input type="radio" name="environment" value="${environment}"${environment === 'all' ? ' checked' : ''}><span>${t[environment]}</span></label>`).join('')}</div></fieldset>
    <label class="switch-row"><span>${t.seasonalOnly}</span><input id="seasonal-only" type="checkbox"><span class="switch-track" aria-hidden="true"></span></label>
    <div class="dialog-actions"><button id="filter-reset" class="secondary-button" type="button">${t.reset}</button><button id="filter-apply" class="primary-button" type="submit" value="apply">${t.apply}</button></div>
  </form></dialog>
  <dialog id="about-dialog" class="about-dialog" aria-labelledby="about-title"><button id="about-close" class="dialog-close icon-button" type="button" aria-label="${t.close}">${icon('close')}</button><h2 id="about-title">${t.aboutHeading}</h2><p class="about-intro">${t.aboutIntro}</p><label class="map-provider-control">${icon('map')}<span>${t.mapProvider}</span><select id="map-provider" disabled><option value="baidu" hidden>${t.baidu}</option><option value="amap" hidden>${t.amap}</option><option value="osm" selected>OpenStreetMap</option></select></label><p>${t.aboutScope}</p><p>${t.aboutDates}</p><p>${t.aboutPositions}</p><p>${t.aboutPrivacy}</p><p>${t.aboutMap}</p><div class="provider-links"><a data-provider-info="amap" hidden href="https://lbs.amap.com/" target="_blank" rel="noopener noreferrer">${t.amap}</a><a href="https://lbs.baidu.com/" target="_blank" rel="noopener noreferrer">${t.baidu}</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></div><section id="provider-legal-attribution" class="provider-legal-attribution" aria-label="${t.mapAttribution}" hidden></section><a class="about-home-link" href="${t.home}">${t.homeLabel}</a></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
  <script type="application/json" id="map-config">${json({ lang: 'zh', locale: t.locale, home: t.home, url, labels: t, cities, venues: data.venues })}</script>
</body>
</html>
`;
}

export async function renderVenuePages({ check = false } = {}) {
  const data = JSON.parse(await readFile(new URL('content/venues.json', root), 'utf8'));
  if (!Array.isArray(data.venues) || !data.venues.length) throw new Error('Venue directory must not be empty.');
  const ids = data.venues.map((venue) => venue.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9-]+$/.test(id))) throw new Error('Venue IDs must be unique URL-safe slugs.');
  const outputs = [['venues/data.json', JSON.stringify(data, null, 2) + '\n'], ['RapidSurfingMap.html', renderVenues(data)]];
  const legacyPages = ['venues/index.html', 'zh/venues/index.html', 'de/venues/index.html'];
  for (const path of legacyPages) {
    const file = new URL(path, root);
    if (check) {
      const exists = await access(file).then(() => true, (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      if (exists) throw new Error(`${path} is obsolete. Run npm run venues:generate.`);
    } else await rm(file, { force: true });
  }
  for (const [path, content] of outputs) {
    const file = new URL(path, root);
    if (check) {
      const actual = await readFile(file, 'utf8').catch(() => '');
      if (actual !== content) throw new Error(`${path} is stale. Run npm run venues:generate.`);
    } else {
      await mkdir(new URL('./', file), { recursive: true });
      await writeFile(file, content);
    }
  }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await renderVenuePages({ check: process.argv.includes('--check') });
  console.log(process.argv.includes('--check') ? 'Venue pages are up to date.' : 'Generated the Chinese RapidSurfingMap page and public venue data.');
}
