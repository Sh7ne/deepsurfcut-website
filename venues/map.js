import { createOsmProvider } from './provider-osm.js';
import { createAmapProvider } from './provider-amap.js';
import { createBaiduProvider } from './provider-baidu.js?v=20261028-map-about-credits-1';

/* Progressive enhancement for the public venue directory. */
(() => {
  'use strict';
  const configNode = document.getElementById('map-config');
  if (!configNode) return;
  const config = JSON.parse(configNode.textContent);
  const lang = 'zh';
  const labels = config.labels || {};
  const t = (key, values = {}) => Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), labels[key] || key);
  const $ = (id) => document.getElementById(id);
  const venues = config.venues || [];
  const byId = new Map(venues.map((v) => [v.id, v]));
  const cards = new Map([...document.querySelectorAll('.venue-card[data-id]')].map((el) => [el.dataset.id, el]));
  const localized = (v) => ({ ...v, ...v.i18n?.[lang] });
  const cityName = (city) => config.cities?.[city] || city;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => {
    const paths = {
      heart: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
      arrow: '<path d="m7 17 10-10M7 7h10v10"/>',
      pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
      copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
      wave: '<path d="M3 16c2 2 4 2 6 0s4-2 6 0 4 2 6 0M3 20c2 2 4 2 6 0s4-2 6 0 4 2 6 0M4 12c1-6 5-9 10-8-3 2-4 5-2 8"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.wave}</svg>`;
  };
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem('deepsurf.venues.saved.v1') || '[]'); } catch { /* Private browsing can disable storage. */ }
  const state = { query: '', city: 'all', environment: 'all', seasonal: false, view: 'map', sort: 'recommended', saved: new Set(Array.isArray(stored) ? stored.filter((id) => byId.has(id)) : []), selected: null, user: null, results: venues };
  let map, pendingMap, toastTimer, searchTimer, mapTimer, lastFocus;
  let providerRequest = 0, markerRequest = 0;
  let providerConfig = {};
  let providerName = 'osm';
  let mapFailed = false;
  let frameRequest = 0, historyBackPending = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => matchMedia('(max-width: 767px)').matches;
  const mapSnap = () => mobile() && window.innerHeight < 650 ? 'low' : 'half';
  const attribution = $('provider-attribution');
  const legalAttribution = $('provider-legal-attribution');
  let attributionHeight = 0;
  const updateAttributionLayout = () => {
    legalAttribution.hidden = legalAttribution.childElementCount === 0;
    const visible = attribution.childElementCount > 0;
    attribution.hidden = !visible;
    document.body.classList.toggle('has-map-attribution', visible);
    const height = visible ? Math.ceil(attribution.getBoundingClientRect().height) : 0;
    if (height === attributionHeight) return;
    attributionHeight = height;
    document.documentElement.style.setProperty('--map-attribution-height', `${height}px`);
    if (map) {
      if (state.selected && byId.has(state.selected)) focusVenue(byId.get(state.selected));
      else fitMap();
    }
  };
  const attributionObserver = new MutationObserver(updateAttributionLayout);
  attributionObserver.observe(attribution, { childList: true });
  attributionObserver.observe(legalAttribution, { childList: true });
  new ResizeObserver(updateAttributionLayout).observe(attribution);
  const announce = (message) => {
    (document.querySelector('dialog[open]') || document.body).append($('toast'));
    $('toast').textContent = message;
    $('toast').hidden = false;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400);
  };
  const hasPosition = (v) => Number.isFinite(v.position?.lat) && Number.isFinite(v.position?.lng);
  const setSnap = (snap) => {
    $('explore-sheet').dataset.snap = snap;
    document.body.dataset.sheetSnap = snap;
    $('sheet-handle').setAttribute('aria-expanded', String(snap !== 'low'));
  };
  function distance(v) {
    if (!state.user || !hasPosition(v)) return Infinity;
    const rad = Math.PI / 180;
    const a = Math.sin((v.position.lat - state.user.lat) * rad / 2) ** 2 + Math.cos(state.user.lat * rad) * Math.cos(v.position.lat * rad) * Math.sin((v.position.lng - state.user.lng) * rad / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function updateSaved() {
    document.querySelectorAll('[data-save]').forEach((button) => {
      const saved = state.saved.has(button.dataset.save);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${t(saved ? 'unsave' : 'save')} ${byId.get(button.dataset.save)?.name || ''}`);
      button.classList.toggle('is-saved', saved);
      const text = button.querySelector('[data-save-label]');
      if (text) text.textContent = t(saved ? 'saved' : 'save');
    });
    $('saved-count').textContent = state.saved.size || '';
    $('saved-count').hidden = !state.saved.size;
  }
  function save(id) {
    const wasSaved = state.saved.has(id);
    if (wasSaved) state.saved.delete(id); else state.saved.add(id);
    try { localStorage.setItem('deepsurf.venues.saved.v1', JSON.stringify([...state.saved])); } catch { /* Retain session-only favorites. */ }
    updateSaved();
    if (state.view === 'saved') filter(false);
    announce(t(wasSaved ? 'removedToast' : 'savedToast'));
  }
  function setView(view) {
    state.view = view;
    document.body.dataset.view = view;
    setSnap(view === 'map' ? mapSnap() : 'full');
    document.querySelectorAll('.tab-bar [data-view]').forEach((button) => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    filter(false);
    if (view === 'map') {
      if (state.selected && byId.has(state.selected)) focusVenue(byId.get(state.selected));
      else fitMap();
    }
  }
  function filter(refit = true) {
    const query = state.query.toLocaleLowerCase().trim();
    let list = venues.filter((v) => {
      const text = [v.name, v.shortName, v.city, cityName(v.city), v.province, v.address, ...(v.aliases || [])].join(' ').toLocaleLowerCase();
      return (!query || text.includes(query)) && (state.city === 'all' || v.city === state.city) && (state.environment === 'all' || v.environment === state.environment) && (!state.seasonal || v.seasonal) && (state.view !== 'saved' || state.saved.has(v.id));
    });
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, lang === 'zh' ? 'zh-Hans' : lang));
    else if (state.sort === 'nearest' && state.user) list.sort((a, b) => distance(a) - distance(b));
    state.results = list;
    const ids = new Set(list.map((v) => v.id));
    cards.forEach((card, id) => { card.hidden = !ids.has(id); });
    list.forEach((v) => {
      const card = cards.get(v.id);
      if (!card) return;
      $('venue-list').append(card);
      const distanceEl = card.querySelector('.venue-distance');
      if (distanceEl) {
        distanceEl.hidden = !state.user;
        if (state.user) distanceEl.textContent = `${distance(v).toFixed(distance(v) < 10 ? 1 : 0)} km`;
      }
    });
    $('result-count').textContent = list.length;
    $('empty-state').hidden = list.length > 0;
    const emptyTitle = $('empty-state').querySelector('h2,h3,p');
    if (emptyTitle) emptyTitle.textContent = t(state.view === 'saved' && state.saved.size === 0 ? 'noSaved' : 'noResults');
    const emptyHint = $('empty-state').querySelector('p');
    if (emptyHint) emptyHint.textContent = t(state.view === 'saved' && state.saved.size === 0 ? 'noSavedHint' : 'noResultsHint');
    $('clear-search').hidden = !state.query;
    document.querySelectorAll('#city-filters [data-city]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.city === state.city)));
    const filters = Number(state.environment !== 'all') + Number(state.seasonal);
    $('filter-open').classList.toggle('active', filters > 0);
    $('filter-open').setAttribute('aria-label', filters ? `${t('filters')} · ${filters}` : t('filters'));
    const active = $('active-filters');
    active.hidden = !filters;
    active.textContent = [state.environment === 'all' ? '' : t(state.environment), state.seasonal ? t('seasonal') : ''].filter(Boolean).join(' · ');
    drawMarkers();
    if (refit && list.length) fitMap();
  }
  function padding() {
    if (!mobile()) return { paddingTopLeft: [442, 64], paddingBottomRight: [65, 65] };
    const sheet = $('explore-sheet');
    let top = Math.max(48, document.querySelector('.map-controls').getBoundingClientRect().top + 32);
    for (const credits of document.querySelectorAll('.map-attribution, .provider-amap .amap-logo, .provider-amap .amap-copyright')) {
      if (!credits.hidden && credits.getClientRects().length) top = Math.max(top, credits.getBoundingClientRect().bottom + 28);
    }
    const tabsTop = document.querySelector('.tab-bar').getBoundingClientRect().top;
    const bottom = Math.min(sheet.getClientRects().length ? sheet.getBoundingClientRect().top : tabsTop, tabsTop) - 25;
    // A full directory can cover the map. Defer its camera update until the
    // visitor returns to Map instead of fitting into an obscured rectangle.
    if (bottom - top < 44) return null;
    return { paddingTopLeft: [24, top], paddingBottomRight: [72, window.innerHeight - bottom] };
  }
  function frameMap(points, options = {}) {
    if (!map) return;
    const currentMap = map;
    const request = ++frameRequest;
    // Read the final sheet geometry after its height transition, including when
    // reduced motion disables that transition entirely.
    $('explore-sheet').getBoundingClientRect();
    const animations = $('explore-sheet').getAnimations?.() || [];
    const apply = () => {
      if (request === frameRequest && map === currentMap) Promise.resolve().then(() => {
        if (request !== frameRequest || map !== currentMap) return;
        const spacing = padding();
        if (spacing) return currentMap.fitBounds(points, { ...spacing, animate: !reducedMotion, ...options });
      }).catch(() => { if (request === frameRequest && map === currentMap) mapMessage(true); });
    };
    if (animations.length) Promise.allSettled(animations.map((animation) => animation.finished)).then(apply);
    else apply();
  }
  function fitMap() {
    if (!map) return;
    const points = state.results.filter(hasPosition).map((v) => [v.position.lat, v.position.lng]);
    if (!points.length) return;
    frameMap(points, { maxZoom: points.length === 1 ? 14 : 11 });
  }
  function focusVenue(v) {
    if (!map || !hasPosition(v)) return;
    const bounds = [[v.position.lat, v.position.lng]];
    frameMap(bounds, { maxZoom: 14 });
  }
  async function drawMarkers() {
    cards.forEach((card, id) => {
      if (id === state.selected) card.setAttribute('aria-current', 'location');
      else card.removeAttribute('aria-current');
    });
    if (!map) return;
    const currentMap = map;
    const request = ++markerRequest;
    const focusedMarker = document.activeElement?.closest('.surf-marker')?.dataset.markerKey;
    const groups = [];
    try { for (const v of state.results.filter(hasPosition)) {
      const point = currentMap.project([v.position.lat, v.position.lng]);
      const near = groups.find((g) => Math.hypot(g.point.x - point.x, g.point.y - point.y) < (currentMap.getZoom() < 12 ? 45 : 26));
      if (near) near.venues.push(v); else groups.push({ point, venues: [v] });
    } } catch { if (currentMap === map) mapMessage(true); return; }
    const specs = groups.map((group) => {
      const first = group.venues[0];
      const cluster = group.venues.length > 1;
      const position = ['lat', 'lng'].map((axis) => group.venues.reduce((sum, v) => sum + v.position[axis], 0) / group.venues.length);
      const selected = group.venues.some((v) => v.id === state.selected);
      const clusterLabel = new Set(group.venues.map((v) => v.city)).size > 1
        ? t('results', { count: group.venues.length }) : `${cityName(first.city)} · ${group.venues.length}`;
      return {
        key: group.venues.map((v) => v.id).sort().join(','), venueId: cluster ? null : first.id,
        position, label: cluster ? clusterLabel : (first.shortName || first.name),
        className: `surf-marker${cluster ? ' cluster' : ''}${selected ? ' selected' : ''}${!cluster && first.seasonal ? ' seasonal-marker' : ''}`,
        html: cluster ? `<span>${group.venues.length}</span>` : icon('wave'), size: cluster ? 44 : 40,
        onActivate: () => {
          if (cluster) frameMap(group.venues.map((v) => [v.position.lat, v.position.lng]), { maxZoom: currentMap.getZoom() + 3 });
          else openVenue(first.id);
        },
      };
    });
    try { await currentMap.setMarkers(specs); }
    catch { if (currentMap === map) mapMessage(true); return; }
    if (request !== markerRequest || currentMap !== map) return;
    if (focusedMarker && !document.querySelector('dialog[open]')) {
      const replacement = [...document.querySelectorAll('.surf-marker')].find((node) => node.dataset.markerKey === focusedMarker);
      (replacement || $('map')).focus({ preventScroll: true });
    }
  }
  function mapMessage(error = false) {
    if (error) mapFailed = true;
    const message = $('map-message');
    message.hidden = false;
    const label = message.querySelector('[data-map-message],p,span');
    if (label) label.textContent = t(error ? 'mapError' : 'mapLoading');
    $('map-retry').hidden = !error;
    message.classList.toggle('error', error);
  }
  async function switchProvider(name) {
    if (!['osm', 'amap', 'baidu'].includes(name)) return;
    const request = ++providerRequest;
    ++frameRequest; ++markerRequest;
    clearTimeout(mapTimer);
    map?.destroy(); map = null;
    pendingMap?.destroy(); pendingMap = null;
    attribution.replaceChildren();
    legalAttribution.replaceChildren();
    updateAttributionLayout();
    providerName = name;
    mapFailed = false;
    $('map-provider').value = name;
    document.body.dataset.mapProvider = name;
    $('map').dataset.provider = name;
    delete $('map').dataset.error;
    delete $('map').dataset.errorStatus;
    delete $('map').dataset.errorDetail;
    $('map').setAttribute('aria-busy', 'true');
    document.querySelector('.map-attribution').hidden = name !== 'osm';
    const container = document.createElement('div');
    container.className = `provider-canvas provider-${name}`;
    $('map').replaceChildren(container);
    mapMessage(false);
    let ready = false;
    const onReady = () => {
      if (request !== providerRequest) return;
      ready = true;
      if (map && !mapFailed) { clearTimeout(mapTimer); $('map-message').hidden = true; }
    };
    const onError = (error) => {
      if (request !== providerRequest) return;
      clearTimeout(mapTimer);
      // A bounded diagnostic code helps operators without logging URLs or keys.
      const code = error?.code || '';
      $('map').dataset.error = /^(AMAP|BAIDU)_[A-Z_]+$/.test(code) ? code
        : /^[a-z][a-z-]{1,40}$/.test(code) ? `${name.toUpperCase()}_${code.toUpperCase().replaceAll('-', '_')}` : 'MAP_UNAVAILABLE';
      if (Number.isInteger(error?.status)) $('map').dataset.errorStatus = String(error.status);
      if (error instanceof TypeError && /^[\w.$() ]{1,100} is not a function$/.test(error.message)) $('map').dataset.errorDetail = error.message;
      mapMessage(true);
    };
    mapTimer = setTimeout(onError, 20000);
    let candidate;
    try {
      const options = { container, reducedMotion, onReady, onError,
        onMove: () => { if (request === providerRequest && map) drawMarkers(); } };
      if (name === 'amap') {
        if (!providerConfig.amap?.enabled) throw new Error('Provider unavailable');
        candidate = await createAmapProvider({ ...options, ...providerConfig.amap });
      } else if (name === 'baidu') {
        if (!providerConfig.baidu?.enabled) throw new Error('Provider unavailable');
        candidate = await createBaiduProvider({ ...options, ...providerConfig.baidu, attributionContainer: legalAttribution, brandingContainer: attribution });
      } else candidate = await createOsmProvider(options);
      if (request !== providerRequest) { candidate.destroy(); return; }
      pendingMap = candidate;
      await candidate.prepare(venues.filter(hasPosition).map((v) => [v.position.lat, v.position.lng]));
      if (request !== providerRequest) { candidate.destroy(); return; }
      map = candidate;
      if (pendingMap === candidate) pendingMap = null;
      map.resize();
      if (state.user) await map.setUserLocation([state.user.lat, state.user.lng]);
      if (request !== providerRequest) return;
      await drawMarkers();
      if (request !== providerRequest || map !== candidate) return;
      if (state.selected && byId.has(state.selected)) focusVenue(byId.get(state.selected));
      else fitMap();
      $('map').setAttribute('aria-busy', 'false');
      if (ready && !mapFailed) { clearTimeout(mapTimer); $('map-message').hidden = true; }
      try { localStorage.setItem('deepsurf.venues.provider.v1', name); } catch { /* Session-only preference. */ }
    } catch (error) {
      if (pendingMap === candidate) pendingMap = null;
      if (request !== providerRequest) { candidate?.destroy(); return; }
      candidate?.destroy(); map = null;
      $('map').setAttribute('aria-busy', 'false');
      onError(error);
    }
  }
  async function initMap() {
    try {
      const response = await fetch('/api/maps/config', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (response.ok) providerConfig = await response.json();
    } catch { /* Static previews retain OpenStreetMap and the full directory. */ }
    for (const name of ['amap', 'baidu']) {
      const option = $('map-provider').querySelector(`[value="${name}"]`);
      option.disabled = !providerConfig[name]?.enabled;
      option.hidden = option.disabled;
      const infoLink = document.querySelector(`[data-provider-info="${name}"]`);
      if (infoLink) infoLink.hidden = option.disabled;
    }
    let preferred;
    try { preferred = localStorage.getItem('deepsurf.venues.provider.v1'); } catch { /* Use configured default. */ }
    const configured = (name) => name === 'osm' || providerConfig[name]?.enabled;
    const name = preferred && configured(preferred) ? preferred : providerConfig.baidu?.enabled ? 'baidu' : providerConfig.amap?.enabled ? 'amap' : 'osm';
    $('map-provider').disabled = false;
    switchProvider(name);
  }
  function navLinks(v) {
    const query = `${v.city} ${v.name} ${v.address}`;
    const exact = hasPosition(v) && v.position.accuracy === 'venue';
    return {
      baidu: exact ? `https://api.map.baidu.com/marker?location=${v.position.lat},${v.position.lng}&title=${encodeURIComponent(v.name)}&content=${encodeURIComponent(v.address)}&coord_type=wgs84&output=html&src=webapp.deepsurf.venues` : `https://api.map.baidu.com/place/search?query=${encodeURIComponent(v.name)}&region=${encodeURIComponent(v.city)}&output=html&src=webapp.deepsurf.venues`,
      amap: exact ? `https://uri.amap.com/marker?position=${v.position.lng},${v.position.lat}&name=${encodeURIComponent(v.name)}&coordinate=wgs84&src=deepsurf&callnative=1` : `https://uri.amap.com/search?keyword=${encodeURIComponent(v.name)}&city=${encodeURIComponent(v.city)}&src=deepsurf&callnative=1`,
      apple: `https://maps.apple.com/?q=${encodeURIComponent(query)}`,
    };
  }
  function detailMarkup(original) {
    const v = localized(original);
    const links = navLinks(original);
    const contentLang = 'zh-Hans';
    const accuracy = v.position?.accuracy === 'venue' ? 'exactPosition' : v.position?.accuracy === 'site' ? 'sitePosition' : 'approximate';
    const sources = (v.sources || []).filter((s) => /^https?:\/\//.test(s.url));
    return `<div class="detail-art" aria-hidden="true"><div class="detail-wave">${icon('wave')}</div><span>RAPID SURFING</span><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div></div>
      <div class="detail-body"><p class="detail-eyebrow">${escape(cityName(v.city))}<span>·</span>${escape(t(v.environment))}</p>
      <h2 id="detail-title" lang="${contentLang}">${escape(v.name)}</h2>
      <div class="detail-badges"><span class="badge">${escape(t(v.environment))}</span>${v.seasonal ? `<span class="badge seasonal">${escape(t('seasonal'))}</span>` : ''}<span class="badge precision">${escape(t(accuracy))}</span></div>
      <p class="detail-description" lang="${contentLang}">${escape(v.description || v.summary)}</p>
      <div class="detail-tools"><button type="button" data-save="${escape(v.id)}">${icon('heart')}<span data-save-label>${escape(t('save'))}</span></button><button id="share-venue" type="button">${icon('share')}${escape(t('share'))}</button></div>
      <section class="detail-section"><h3>${escape(t('address'))}</h3><p lang="zh-Hans">${escape(v.address)}</p><p class="detail-note" lang="zh-Hans">${escape(v.position?.label || '')}</p><button class="text-button" id="copy-address" type="button">${icon('copy')}${escape(labels.copyAddress || t('address'))}</button></section>
      <section class="detail-section"><h3>${escape(t('opening'))}</h3><p lang="zh-Hans">${escape(v.seasonNote || '')}</p><p class="detail-note">${escape(t('dataNotice'))}</p></section>
      <section class="detail-section"><h3>${escape(t('directions'))}</h3><div class="navigation-links">${Object.entries(links).map(([key, url]) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(t(key))}${icon('arrow')}</a>`).join('')}</div></section>
      <section class="detail-section source-section"><h3>${escape(t('sources'))}</h3><p class="detail-note">${escape(t('updated'))} ${escape(v.verifiedAt || '')}</p>${sources.map((s) => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" lang="zh-Hans">${escape(s.label)}${icon('arrow')}</a>`).join('')}</section>
      <button class="primary-button" id="show-on-map" type="button">${icon('pin')}${escape(t('viewMap'))}</button></div>`;
  }
  function openVenue(id, push = true) {
    const v = byId.get(id);
    if (!v) return;
    const dialog = $('venue-detail');
    if (!dialog.open) {
      const element = document.activeElement;
      lastFocus = { element, markerVenue: element?.closest('.surf-marker')?.dataset.markerVenue };
    }
    state.selected = id;
    $('detail-content').innerHTML = detailMarkup(v);
    dialog.setAttribute('aria-labelledby', 'detail-title');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    $('detail-content').scrollTop = 0;
    $('detail-close').focus({ preventScroll: true });
    if (push && location.hash !== `#venue-${id}`) history.pushState({ deepsurfVenue: id }, '', `#venue-${id}`);
    updateSaved();
    drawMarkers();
    $('copy-address').onclick = () => copy(v.address, t('copiedAddress'));
    $('share-venue').onclick = () => share(v);
    $('show-on-map').onclick = () => {
      closeVenue({ preserveSelection: true, restoreFocus: false });
      setView('map');
      $('map').focus({ preventScroll: true });
      focusVenue(v);
    };
  }
  function closeVenue({ updateHistory = true, preserveSelection = false, restoreFocus = true } = {}) {
    if (updateHistory && location.hash.startsWith('#venue-')) {
      if (history.state?.deepsurfVenue === location.hash.slice(7)) {
        // Remove the entry created by opening the detail, so repeated open/close
        // actions do not leave duplicate map entries in browser history.
        if (!historyBackPending) { historyBackPending = true; history.back(); }
      } else history.replaceState(history.state, '', location.pathname + location.search);
    }
    $('venue-detail').close();
    if (!preserveSelection) state.selected = null;
    const returnFocus = lastFocus;
    drawMarkers().then(() => {
    if (restoreFocus && returnFocus && !$('venue-detail').open) {
      const marker = returnFocus.markerVenue && [...document.querySelectorAll('[data-marker-venue]')].find((node) => node.dataset.markerVenue === returnFocus.markerVenue);
      const target = marker || (returnFocus.element?.isConnected ? returnFocus.element : $('map'));
      target.focus({ preventScroll: true });
    }
    });
  }
  async function copy(value, message = t('copied')) {
    try { await navigator.clipboard.writeText(value); announce(message); }
    catch {
      const input = document.createElement('textarea');
      input.className = 'copy-fallback';
      input.value = value;
      input.setAttribute('aria-label', t('copy'));
      ($('venue-detail').open ? $('detail-content') : document.body).append(input);
      input.focus(); input.select();
      try { if (document.execCommand('copy')) { input.remove(); announce(message); } else announce(t('shareError')); } catch { announce(t('shareError')); }
    }
  }
  async function share(v) {
    const data = { title: v.name, text: v.summary, url: `${config.url || 'https://deepsurf.app/RapidSurfingMap'}#venue-${v.id}` };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (error) { if (error.name === 'AbortError') return; }
    }
    await copy(data.url);
  }
  function readHash() {
    historyBackPending = false;
    const id = location.hash.replace(/^#venue-/, '');
    if (location.hash.startsWith('#venue-') && byId.has(id)) {
      // A history traversal emits both popstate and hashchange. Reopening an
      // already-current dialog would replace its content and lose return focus.
      if (!$('venue-detail').open || state.selected !== id) openVenue(id, false);
    } else if ($('venue-detail').open) closeVenue({ updateHistory: false });
  }
  document.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) { event.preventDefault(); save(saveButton.dataset.save); return; }
    const openButton = event.target.closest('[data-open]');
    if (openButton) { event.preventDefault(); openVenue(openButton.dataset.open); }
    const city = event.target.closest('#city-filters [data-city]');
    if (city) { state.city = city.dataset.city; filter(); }
    const view = event.target.closest('.tab-bar [data-view]');
    if (view) setView(view.dataset.view);
  });
  $('search').addEventListener('input', (event) => {
    state.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filter, 160);
  });
  $('search').addEventListener('focus', () => { if (mobile()) setSnap('full'); });
  $('clear-search').onclick = () => { $('search').value = ''; state.query = ''; filter(); $('search').focus(); };
  $('sort').onchange = () => {
    if ($('sort').value === 'nearest' && !state.user) { $('sort').value = state.sort; announce(t('nearestNeedsLocation')); $('locate').focus(); return; }
    state.sort = $('sort').value; filter(false);
  };
  const reset = () => { state.query = ''; state.city = 'all'; state.environment = 'all'; state.seasonal = false; $('search').value = ''; filter(); };
  $('reset-filters').onclick = reset;
  $('filter-open').onclick = () => {
    $('filter-dialog').querySelector(`[name="environment"][value="${state.environment}"]`).checked = true;
    $('seasonal-only').checked = state.seasonal;
    $('filter-dialog').showModal();
  };
  $('filter-apply').onclick = (event) => {
    event.preventDefault();
    state.environment = $('filter-dialog').querySelector('[name="environment"]:checked')?.value || 'all';
    state.seasonal = $('seasonal-only').checked;
    $('filter-dialog').close(); filter();
  };
  $('filter-reset').onclick = (event) => {
    event.preventDefault();
    $('filter-dialog').querySelector('[name="environment"][value="all"]').checked = true;
    $('seasonal-only').checked = false;
  };
  $('about-open').onclick = () => $('about-dialog').showModal();
  $('about-close').onclick = () => $('about-dialog').close();
  $('about-dialog').addEventListener('close', () => {
    if (document.querySelector('dialog[open]')) return;
    const opener = $('about-open'), handle = $('sheet-handle');
    (opener.getClientRects().length ? opener : handle.getClientRects().length ? handle : $('map')).focus({ preventScroll: true });
  });
  $('detail-close').onclick = () => closeVenue();
  $('venue-detail').addEventListener('cancel', (event) => { event.preventDefault(); closeVenue(); });
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      if (dialog.id === 'venue-detail') closeVenue(); else dialog.close();
    }
  }));
  window.addEventListener('popstate', readHash);
  window.addEventListener('hashchange', readHash);
  $('map-retry').onclick = () => switchProvider(providerName);
  $('map-provider').onchange = () => switchProvider($('map-provider').value);
  $('fit-map').onclick = () => { setView('map'); fitMap(); };
  $('zoom-in').onclick = () => map?.zoomIn();
  $('zoom-out').onclick = () => map?.zoomOut();
  $('locate').onclick = () => {
    if (!navigator.geolocation) { announce(t('locationUnsupported')); return; }
    $('locate').disabled = true;
    $('locate').classList.add('loading');
    announce(t('locationLoading'));
    navigator.geolocation.getCurrentPosition(async (position) => {
      $('locate').disabled = false; $('locate').classList.remove('loading');
      state.user = { lat: position.coords.latitude, lng: position.coords.longitude };
      state.sort = 'nearest'; $('sort').value = 'nearest';
      filter(false); announce(t('locationFound'));
      setView('map');
      const currentMap = map;
      if (currentMap) {
        try {
          await currentMap.setUserLocation([state.user.lat, state.user.lng]);
          if (map === currentMap) frameMap([[state.user.lat, state.user.lng]], { maxZoom: 14 });
        } catch { if (map === currentMap) mapMessage(true); }
      }
    }, (error) => {
      $('locate').disabled = false; $('locate').classList.remove('loading');
      announce(t(error.code === 1 ? 'locationDenied' : error.code === 3 ? 'locationTimeout' : 'locationError'));
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };
  const handle = $('sheet-handle');
  let dragStart, dragged = false;
  handle.addEventListener('pointerdown', (event) => { dragStart = event.clientY; dragged = false; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointerup', (event) => {
    if (dragStart === undefined) return;
    const delta = event.clientY - dragStart;
    if (Math.abs(delta) > 28) {
      dragged = true;
      const states = ['low', 'half', 'full'];
      const current = states.indexOf($('explore-sheet').dataset.snap || 'half');
      setSnap(states[Math.max(0, Math.min(2, current + (delta < 0 ? 1 : -1)))]);
    }
    dragStart = undefined;
  });
  handle.onclick = () => {
    if (dragged) { dragged = false; return; }
    setSnap($('explore-sheet').dataset.snap === 'low' ? 'half' : 'low');
  };
  handle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setSnap(event.key === 'ArrowUp' ? 'full' : 'low'); }
  });
  document.documentElement.classList.add('enhanced');
  document.body.dataset.view = 'map';
  setSnap(mapSnap());
  updateSaved(); filter(false); initMap(); readHash();
  window.addEventListener('resize', () => {
    map?.resize();
    if (state.view === 'map') {
      if (state.selected && byId.has(state.selected)) focusVenue(byId.get(state.selected));
      else fitMap();
    }
  });
})();
