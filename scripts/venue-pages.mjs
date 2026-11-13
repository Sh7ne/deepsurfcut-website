import { venuePhoto, venueContact } from '../venues/detail-extras.js';

const origin = 'https://deepsurf.app';
const socialImage = `${origin}/assets/rapid-surf-map-social-20261114.png`;
const copy = {
  zh: {
    pageType: '场馆资料', skip: '跳转到场馆资料', breadcrumb: '页面位置', languages: '页面语言',
    back: '返回地图', directions: '打开导航', position: '地图位置精度', information: '资料说明',
    sourceNote: '核对日期不代表今天营业或仍有空位。出发前请向运营方确认开放安排与预约信息。',
    guide: 'Rapid Surfing 视频剪辑指南', credit: '由 DeepSurfCut 整理',
    socialAlt: 'Rapid Surf Map 深水固定浪场馆地图',
    description: '在 Rapid Surf Map 查看场馆地址、开放安排、资料来源与导航。',
  },
  en: {
    pageType: 'Venue details', skip: 'Skip to venue details', breadcrumb: 'Breadcrumb', languages: 'Page language',
    back: 'Back to the map', directions: 'Get directions', position: 'Map location accuracy', information: 'About this listing',
    sourceNote: 'The check date does not confirm that the venue is open today or that sessions are available. Confirm opening and booking information with the operator before travelling.',
    guide: 'Rapid surfing video editing guide', credit: 'A directory by DeepSurfCut',
    socialAlt: 'Rapid Surf Map deep-water standing-wave venue map',
    description: 'Find the address, opening information, sources and directions on Rapid Surf Map.',
  },
  de: {
    pageType: 'Standortdetails', skip: 'Zu den Standortdetails springen', breadcrumb: 'Brotkrumennavigation', languages: 'Seitensprache',
    back: 'Zurück zur Karte', directions: 'Anfahrt öffnen', position: 'Genauigkeit der Kartenposition', information: 'Über diesen Eintrag',
    sourceNote: 'Das Prüfdatum bestätigt weder die heutige Öffnung noch freie Termine. Kläre Öffnung und Buchung vor der Anreise mit dem Betreiber.',
    guide: 'Anleitung zur Bearbeitung von Rapid-Surfing-Videos', credit: 'Ein Verzeichnis von DeepSurfCut',
    socialAlt: 'Rapid Surf Map mit Anlagen für stehende Tiefwasserwellen',
    description: 'Adresse, Öffnungsangaben, Quellen und Anfahrt auf Rapid Surf Map ansehen.',
  },
};

const escape = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const external = (url, text, className = '') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(text)}<span aria-hidden="true">↗</span></a>`;
const wave = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14c3-7 6-10 10-8 3 1 3 5 1 6 4-1 7 1 9 4M2 19c3-2 5-2 8 0s5 2 8 0 4-1 4-1"/></svg>';

export function venuePagePath(id, language = 'en') {
  if (!/^[a-z0-9-]+$/.test(id) || !Object.hasOwn(copy, language)) {
    throw new TypeError('Venue pages require a valid venue ID and supported language.');
  }
  return `${language === 'en' ? '' : `/${language}`}/rapid-surf-map/venues/${id}/`;
}

export function venueEntityId(id, language = 'en') {
  return `${origin}${venuePagePath(id, language === 'de' ? 'en' : language)}#place`;
}

function directionsUrl(venue, edition) {
  const url = new URL(edition === 'china' ? 'https://api.map.baidu.com/place/search' : 'https://www.google.com/maps/search/');
  if (edition === 'china') {
    url.searchParams.set('query', venue.name);
    url.searchParams.set('region', venue.city);
    url.searchParams.set('output', 'html');
    url.searchParams.set('src', 'webapp.deepsurf.venues');
  } else {
    url.searchParams.set('api', '1');
    url.searchParams.set('query', `${venue.name} ${venue.address}`);
  }
  return url.href;
}

export function renderVenuePage({ venue, edition, language = 'en', mapUrl, labels, pageModified }) {
  const path = venuePagePath(venue.id, language);
  const url = origin + path;
  const c = copy[language];
  const city = (venue.city || '').trim();
  const titleName = city && !venue.name.toLocaleLowerCase().includes(city.toLocaleLowerCase()) ? `${venue.name} · ${city}` : venue.name;
  const title = `${titleName} · ${c.pageType} | Rapid Surf Map`;
  const description = `${venue.name}${language === 'zh' ? '：' : ': '}${venue.summary || venue.description} ${c.description}`;
  const location = [...new Set([city, venue.province].filter(Boolean))].join(' · ');
  const placeId = venueEntityId(venue.id, language);
  const mapVenueUrl = `${mapUrl}#venue-${venue.id}`;
  const home = labels.home || (language === 'en' ? '/' : `/${language}/`);
  const positionLabel = venue.position?.accuracy === 'venue' ? labels.exactPosition
    : venue.position?.accuracy === 'site' ? labels.sitePosition
      : venue.position?.accuracy === 'approximate' ? labels.approximate : labels.noPosition;
  const alternates = edition === 'europe' ? [
    ['en', origin + venuePagePath(venue.id, 'en')],
    ['de', origin + venuePagePath(venue.id, 'de')],
    ['x-default', origin + venuePagePath(venue.id, 'en')],
  ] : [];
  const contact = venueContact(venue, labels);
  const photo = venuePhoto(venue, labels);
  const sources = (venue.sources || []).map(source => `<li>${external(source.url, source.label, 'source-link')}<span class="source-domain">${escape(new URL(source.url).hostname.replace(/^www\./, ''))}</span></li>`).join('');
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
        inLanguage: labels.lang || language,
        ...(pageModified ? { dateModified: pageModified } : {}),
        isPartOf: { '@id': `${mapUrl}#webpage` },
        mainEntity: { '@id': placeId }, breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'Place', '@id': placeId, name: venue.name, address: venue.address,
        description: venue.description || venue.summary,
        ...(venue.website ? { sameAs: venue.website } : {}),
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Rapid Surf Map', item: mapUrl },
          { '@type': 'ListItem', position: 2, name: venue.name, item: url },
        ],
      },
    ],
  };
  return `<!DOCTYPE html>
<html lang="${escape(labels.lang || language)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f4f7fa">
  <meta name="description" content="${escape(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <title>${escape(title)}</title>
  <link rel="canonical" href="${escape(url)}">
${alternates.map(([lang, href]) => `  <link rel="alternate" hreflang="${lang}" href="${escape(href)}">`).join('\n')}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DeepSurfCut">
  <meta property="og:locale" content="${escape((labels.locale || language).replace('-', '_'))}">
${edition === 'europe' ? `  <meta property="og:locale:alternate" content="${language === 'de' ? 'en_US' : 'de_DE'}">\n` : ''}  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${socialImage}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${c.socialAlt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${socialImage}">
  <meta name="twitter:image:alt" content="${c.socialAlt}">
  <link rel="icon" href="/assets/favicon-96.png" sizes="96x96" type="image/png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" sizes="180x180">
  <link rel="stylesheet" href="/venues/venue.css?v=20261114-seo-1">
  <script type="application/ld+json">${json(schema)}</script>
</head>
<body>
  <a class="skip-link" href="#venue-content">${c.skip}</a>
  <header class="site-header page-width">
    <a class="brand" href="${escape(mapUrl)}"><span class="brand-mark">${wave}</span><span>Rapid Surf Map</span></a>
    <a class="back-link" href="${escape(mapUrl)}"><span aria-hidden="true">←</span>${c.back}</a>
  </header>
  <main id="venue-content" class="page-width" tabindex="-1">
    <nav class="breadcrumb" aria-label="${c.breadcrumb}"><ol><li><a href="${escape(mapUrl)}">Rapid Surf Map</a></li><li><span aria-current="page">${escape(venue.name)}</span></li></ol></nav>
    <article aria-labelledby="venue-title">
      <header class="venue-heading">
        <div class="heading-top"><p class="eyebrow">${c.pageType}</p>${edition === 'europe' ? `<nav class="language-nav" aria-label="${c.languages}">${[['en', 'English'], ['de', 'Deutsch']].map(([lang, name]) => `<a href="${venuePagePath(venue.id, lang)}" lang="${lang}" hreflang="${lang}"${lang === language ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav>` : ''}</div>
        <h1 id="venue-title">${escape(venue.name)}</h1>
        ${location ? `<p class="venue-location">${escape(location)}</p>` : ''}
        <p class="venue-summary">${escape(venue.summary || venue.description)}</p>
        <ul class="venue-tags" aria-label="${escape(labels.environment)}"><li>${escape(labels[venue.environment] || venue.environment)}</li>${venue.seasonal ? `<li>${escape(labels.seasonal)}</li>` : ''}</ul>
        <div class="primary-actions"><a class="button button-primary" href="${escape(mapVenueUrl)}">${wave}${escape(labels.viewMap)}</a>${external(directionsUrl(venue, edition), c.directions, 'button button-secondary')}</div>
      </header>
      <div class="venue-layout">
        <div class="venue-main">
          ${photo}
          ${venue.description && venue.description !== venue.summary ? `<section class="content-card"><h2>${escape(labels.overview)}</h2><p>${escape(venue.description)}</p></section>` : ''}
          <section class="content-card"><h2>${escape(labels.opening)}</h2><p>${escape(venue.seasonNote || labels.unknownStatus)}</p><p class="muted">${escape(labels.dataNotice)}</p></section>
          ${contact ? `<section class="content-card"><h2>${escape(labels.visitDetails)}</h2>${contact}</section>` : ''}
          <section class="content-card source-card"><h2>${escape(labels.sources)}</h2>${sources ? `<ul class="source-list">${sources}</ul>` : `<p>${escape(labels.noSources)}</p>`}</section>
        </div>
        <aside class="venue-aside" aria-label="${escape(labels.details)}">
          <section class="content-card fact-card"><h2>${escape(labels.details)}</h2><dl>
            <div><dt>${escape(labels.address)}</dt><dd>${escape(venue.address)}</dd></div>
            <div><dt>${c.position}</dt><dd>${escape(positionLabel)}${venue.position?.label ? `<span class="fact-note">${escape(venue.position.label)}</span>` : ''}</dd></div>
            <div><dt>${escape(labels.updated)}</dt><dd><time datetime="${escape(venue.verifiedAt)}">${escape(venue.verifiedAt)}</time></dd></div>
          </dl></section>
          <section class="listing-note"><h2>${c.information}</h2><p>${c.sourceNote}</p><p>${escape(labels.aboutPositions)}</p><p>${escape(labels.aboutScope)}</p></section>
        </aside>
      </div>
    </article>
  </main>
  <footer class="site-footer page-width"><p>${c.credit}</p><nav aria-label="${escape(labels.homeLabel)}"><a href="${escape(home)}">${escape(labels.homeLabel)}</a><a href="${escape(`${home}surf-video-editing/#rapid-surfing`)}">${c.guide}</a></nav></footer>
</body>
</html>
`.replace(/[ \t]+$/gm, '');
}
