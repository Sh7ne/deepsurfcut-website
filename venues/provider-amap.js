/* AMap JS API 2.0 adapter. All public coordinates remain [latitude, longitude] WGS84. */
const SDK_TIMEOUT = 20000;
const CONVERSION_TIMEOUT = 12000;
let sdkPromise;
let sdkIdentity;
let loadedAPI;
let callbackSequence = 0;

const abortError = () => Object.assign(new Error('The map provider was closed.'), { name: 'AbortError' });
const failure = (code, message, response) => {
  const error = Object.assign(new Error(message), { code: `AMAP_${code.replaceAll('-', '_').toUpperCase()}`, provider: 'amap' });
  // Keep only the bounded numeric provider status; SDK error payloads can contain
  // request details and must not be copied into public diagnostics or logs.
  const status = response?.infocode;
  if ((typeof status === 'string' || typeof status === 'number') && /^\d{1,6}$/.test(String(status))) error.status = Number(status);
  return error;
};
const pointKey = (point) => {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) {
    throw failure('invalid-coordinate', 'A valid WGS84 coordinate is required.');
  }
  return `${point[0]},${point[1]}`;
};
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function loadSDK(key, serviceHost) {
  if (typeof key !== 'string' || !key.trim() || /\s/.test(key) || key.length > 256) {
    return Promise.reject(failure('missing-key', 'An AMap browser key is required.'));
  }
  const proxy = new URL(serviceHost, window.location.href);
  if (proxy.origin !== window.location.origin || proxy.pathname !== '/api/maps/amap/_AMapService' || proxy.search || proxy.hash) {
    return Promise.reject(failure('invalid-proxy', 'The AMap security proxy must use the configured same-origin endpoint.'));
  }
  const identity = `${key}\n${proxy.href}`;
  if (sdkIdentity && sdkIdentity !== identity) {
    return Promise.reject(failure('sdk-config-changed', 'Reload the page to change the AMap configuration.'));
  }
  if (loadedAPI) return Promise.resolve(loadedAPI);
  if (sdkPromise) return sdkPromise;
  sdkIdentity = identity;
  // The security code is appended by the server proxy, never sent in page config.
  window._AMapSecurityConfig = { serviceHost: proxy.href };
  const callback = `__deepSurfAmapReady${++callbackSequence}`;
  const script = document.createElement('script');
  script.async = true;
  script.charset = 'utf-8';
  const url = new URL('https://webapi.amap.com/maps');
  url.search = new URLSearchParams({ v: '2.0', key, callback }).toString();
  script.src = url.href;
  sdkPromise = new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => finish(failure('sdk-timeout', 'The AMap service took too long to load.')), SDK_TIMEOUT);
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onerror = null;
      if (error) {
        script.remove();
        // A removed script can still finish an in-flight response. A late JSONP
        // callback must not create a map or throw after another provider is chosen.
        window[callback] = () => {};
        reject(error);
      } else {
        delete window[callback];
        loadedAPI = window.AMap;
        resolve(loadedAPI);
      }
    };
    window[callback] = (response) => {
      // AMap can invoke the loader callback with an authorization/quota error
      // object instead of installing its API. Preserve its numeric status.
      if (response?.status === '0' || response?.status === 0) {
        finish(failure('sdk-rejected', 'The AMap service could not authorize this request.', response));
      } else finish(window.AMap?.Map && window.AMap?.convertFrom ? null : failure('sdk-unavailable', 'The AMap API is unavailable.', response));
    };
    script.onerror = () => finish(failure('sdk-load-failed', 'The AMap service could not be loaded.'));
    document.head.append(script);
  }).catch((error) => {
    sdkPromise = undefined;
    sdkIdentity = undefined;
    throw error;
  });
  return sdkPromise;
}

export async function createAmapProvider({ container, key, serviceHost, reducedMotion = false, onMove = () => {}, onReady = () => {}, onError = () => {} }) {
  if (!container || container.nodeType !== 1) throw new TypeError('A map container is required.');
  let AMap;
  try { AMap = await loadSDK(key, serviceHost); }
  catch (error) { if (container.isConnected) onError(error); throw error; }
  if (!container.isConnected) throw abortError();

  let map, destroyed = false, mapGeneration = 0, readyTimer, moveFrame;
  let markerGeneration = 0, fitGeneration = 0, locationGeneration = 0;
  let desiredMarkers = [], lastFit, userPosition, userMarker;
  const converted = new Map();
  const pending = new Map();
  const conversions = new Set();
  const markers = new Map();
  const assertActive = () => { if (destroyed) throw abortError(); };
  const report = (error) => { if (!destroyed && error.name !== 'AbortError') onError(error); return error; };
  const notifyMove = () => {
    if (destroyed || moveFrame) return;
    moveFrame = requestAnimationFrame(() => { moveFrame = undefined; if (!destroyed) onMove(); });
  };

  function convertBatch(points) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error, positions) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        conversions.delete(cancel);
        if (error) reject(error);
        else { positions.forEach((position, index) => converted.set(pointKey(points[index]), position)); resolve(); }
      };
      const cancel = () => finish(abortError());
      const timer = setTimeout(() => finish(failure('conversion-timeout', 'AMap coordinate conversion timed out.')), CONVERSION_TIMEOUT);
      conversions.add(cancel);
      try {
        AMap.convertFrom(points.map(([lat, lng]) => [lng, lat]), 'gps', (status, result) => {
          if (destroyed) { finish(abortError()); return; }
          if (status !== 'complete' || !Array.isArray(result?.locations) || result.locations.length !== points.length) {
            finish(failure('conversion-failed', 'AMap could not convert the map coordinates.', result)); return;
          }
          const positions = result.locations.map((position) => [Number(position.getLng?.() ?? position.lng), Number(position.getLat?.() ?? position.lat)]);
          if (positions.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) {
            finish(failure('conversion-failed', 'AMap returned invalid map coordinates.')); return;
          }
          finish(null, positions);
        });
      } catch { finish(failure('conversion-failed', 'AMap could not convert the map coordinates.')); }
    });
  }

  async function prepare(points) {
    assertActive();
    try {
      const unique = new Map(points.map((point) => [pointKey(point), [...point]]));
      const missing = [...unique].filter(([id]) => !converted.has(id) && !pending.has(id));
      for (let offset = 0; offset < missing.length; offset += 40) {
        const batch = missing.slice(offset, offset + 40);
        const promise = convertBatch(batch.map(([, point]) => point));
        batch.forEach(([id]) => pending.set(id, promise));
        const clean = () => batch.forEach(([id]) => { if (pending.get(id) === promise) pending.delete(id); });
        promise.then(clean, clean);
      }
      await Promise.all([...new Set([...unique.keys()].map((id) => pending.get(id)).filter(Boolean))]);
      assertActive();
    } catch (error) { throw report(error); }
  }
  const positionFor = (point) => {
    const position = converted.get(pointKey(point));
    if (!position) throw failure('coordinate-not-prepared', 'Prepare coordinates before projecting them.');
    return position;
  };

  function startMap(view = {}) {
    const generation = ++mapGeneration;
    map = new AMap.Map(container, {
      viewMode: '2D', center: view.center || [113, 33], zoom: view.zoom ?? 5,
      zooms: [3, 18], resizeEnable: true, rotateEnable: false, pitchEnable: false,
      animateEnable: !reducedMotion, jogEnable: !reducedMotion,
      keyboardEnable: true, mapStyle: 'amap://styles/whitesmoke',
    });
    readyTimer = setTimeout(() => {
      if (!destroyed && generation === mapGeneration) report(failure('map-timeout', 'The AMap basemap could not finish loading.'));
    }, SDK_TIMEOUT);
    map.on('complete', () => {
      if (destroyed || generation !== mapGeneration) return;
      clearTimeout(readyTimer);
      onReady();
    });
    map.on('moveend', notifyMove);
    map.on('zoomend', notifyMove);
  }
  function removeMap() {
    clearTimeout(readyTimer);
    cancelAnimationFrame(moveFrame);
    moveFrame = undefined;
    mapGeneration++;
    map?.off('moveend', notifyMove);
    map?.off('zoomend', notifyMove);
    markers.clear();
    userMarker = undefined;
    map?.destroy();
    map = undefined;
  }

  const adapter = {
    prepare,
    project(point) {
      assertActive();
      const pixel = map.lngLatToContainer(positionFor(point));
      return { x: Number(pixel.getX?.() ?? pixel.x), y: Number(pixel.getY?.() ?? pixel.y) };
    },
    getZoom() { return map?.getZoom() ?? 5; },
    async fitBounds(points, options = {}) {
      assertActive();
      const generation = ++fitGeneration;
      if (!points.length) return;
      const copied = points.map((point) => [...point]);
      lastFit = { points: copied, options: { ...options } };
      await prepare(copied);
      if (destroyed || generation !== fitGeneration) return;
      const topLeft = options.paddingTopLeft || [0, 0];
      const bottomRight = options.paddingBottomRight || [0, 0];
      const padding = [topLeft[1], bottomRight[1], topLeft[0], bottomRight[0]];
      // Detached overlays let the documented fit API compute a padded viewport
      // without adding temporary visible pins or mixing WGS84 with GCJ-02.
      const boundsMarkers = copied.map((point) => new AMap.Marker({ position: positionFor(point) }));
      try { map.setFitView(boundsMarkers, reducedMotion || options.animate === false, padding, options.maxZoom ?? 18); }
      catch { throw report(failure('fit-failed', 'AMap could not position the map.')); }
    },
    async setMarkers(items) {
      assertActive();
      const generation = ++markerGeneration;
      desiredMarkers = items.map((item) => ({ ...item, position: [...item.position] }));
      const snapshot = desiredMarkers;
      await prepare(snapshot.map((item) => item.position));
      if (destroyed || generation !== markerGeneration) return;
      const ids = new Set(snapshot.map((item) => item.key));
      const focusedKey = document.activeElement?.closest('[data-marker-key]')?.dataset.markerKey;
      for (const [id, entry] of markers) {
        if (!ids.has(id)) { entry.marker.setMap(null); markers.delete(id); }
      }
      for (const item of snapshot) {
        let entry = markers.get(item.key);
        if (!entry) {
          const element = document.createElement('button');
          element.type = 'button';
          entry = { element, item, marker: null };
          element.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); if (!destroyed) entry.item.onActivate?.(); });
          element.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat && !destroyed) entry.item.onActivate?.();
          });
          entry.marker = new AMap.Marker({ position: positionFor(item.position), content: element, anchor: 'center', bubble: false });
          entry.marker.setMap(map);
          markers.set(item.key, entry);
        }
        entry.item = item;
        const { element, marker } = entry;
        element.className = `provider-marker ${item.className || ''}`.trim();
        element.dataset.markerKey = item.key;
        if (item.venueId) element.dataset.markerVenue = item.venueId;
        else delete element.dataset.markerVenue;
        element.setAttribute('aria-label', item.label);
        element.title = item.label;
        const [width, height] = Array.isArray(item.size) ? item.size : [item.size || 40, item.size || 40];
        element.style.width = `${width}px`; element.style.height = `${height}px`;
        if (element.innerHTML !== item.html) element.innerHTML = item.html;
        marker.setPosition(positionFor(item.position));
        marker.setLabel({ direction: 'top', offset: new AMap.Pixel(0, -4), content: escapeHTML(item.label) });
      }
      if (focusedKey && !document.querySelector('dialog[open]')) (markers.get(focusedKey)?.element || container).focus({ preventScroll: true });
    },
    async setUserLocation(point) {
      assertActive();
      const generation = ++locationGeneration;
      userPosition = [...point];
      await prepare([point]);
      if (destroyed || generation !== locationGeneration) return;
      if (userMarker) userMarker.setCenter(positionFor(point));
      else userMarker = new AMap.CircleMarker({ map, center: positionFor(point), radius: 8, fillColor: '#007aff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, strokeOpacity: 1, zIndex: 120 });
    },
    zoomIn() { if (!destroyed) map.zoomIn(); },
    zoomOut() { if (!destroyed) map.zoomOut(); },
    resize() { if (!destroyed) { map.resize(); notifyMove(); } },
    async retry() {
      assertActive();
      const view = { center: map.getCenter(), zoom: map.getZoom() };
      markerGeneration++; fitGeneration++; locationGeneration++;
      removeMap();
      startMap(view);
      await Promise.all([
        adapter.setMarkers(desiredMarkers),
        ...(userPosition ? [adapter.setUserLocation(userPosition)] : []),
        ...(lastFit ? [adapter.fitBounds(lastFit.points, { ...lastFit.options, animate: false })] : []),
      ]);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      markerGeneration++; fitGeneration++; locationGeneration++;
      [...conversions].forEach((cancel) => cancel());
      pending.clear(); converted.clear();
      removeMap();
      desiredMarkers = []; lastFit = undefined; userPosition = undefined;
    },
  };
  try { startMap(); }
  catch { adapter.destroy(); const error = failure('map-init-failed', 'AMap could not initialize the map.'); onError(error); throw error; }
  return adapter;
}
