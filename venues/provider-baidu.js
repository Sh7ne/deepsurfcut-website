/* Baidu JSAPI 4.0. Public directory coordinates stay WGS84; this adapter uses BD09. */
const SDK_TIMEOUT = 16000;
const MAP_TIMEOUT = 20000;
const CONVERSION_TIMEOUT = 12000;
let sdkRequest;
let callbackSequence = 0;

const providerError = (code) => Object.assign(new Error(code), { code, provider: 'baidu' });
const validPosition = (position) => Array.isArray(position) && position.length === 2
  && Number.isFinite(position[0]) && Number.isFinite(position[1])
  && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
const positionKey = (position) => `${position[0]},${position[1]}`;

function loadSDK(ak) {
  if (!ak) return Promise.reject(providerError('BAIDU_KEY_MISSING'));
  if (window.BMap?.Map && window.BMap?.CustomOverlay && window.BMap?.Convertor) return Promise.resolve(window.BMap);
  if (sdkRequest) return sdkRequest;
  sdkRequest = new Promise((resolve, reject) => {
    const callback = `__deepsurfBaiduReady${++callbackSequence}`;
    const script = document.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (error) {
        script.remove();
        // A bootstrap already in flight may still invoke its callback after a
        // timeout. Keep that late callback harmless without accepting its result.
        const ignore = () => {};
        window[callback] = ignore;
        setTimeout(() => { if (window[callback] === ignore) delete window[callback]; }, 60000);
        sdkRequest = undefined;
        reject(error);
      } else {
        delete window[callback];
        resolve(window.BMap);
      }
    };
    window[callback] = () => finish(window.BMap?.Map && window.BMap?.CustomOverlay && window.BMap?.Convertor
      ? null : providerError('BAIDU_SDK_UNAVAILABLE'));
    script.async = true;
    script.src = `https://api.map.baidu.com/api?v=4.0&ak=${encodeURIComponent(ak)}&callback=${callback}`;
    script.onerror = () => finish(providerError('BAIDU_SDK_NETWORK'));
    const timeout = setTimeout(() => finish(providerError('BAIDU_SDK_TIMEOUT')), SDK_TIMEOUT);
    document.head.append(script);
  });
  return sdkRequest;
}

/**
 * createBaiduProvider returns after SDK initialization, while onReady is reserved
 * for the provider's tilesloaded event. prepare/setMarkers/setUserLocation are
 * asynchronous; project and fitBounds require prepared WGS84 coordinates.
 */
export async function createBaiduProvider({ container, attributionContainer, ak, reducedMotion = false, onMove, onReady, onError, locationLabel = 'Current location' }) {
  if (!(container instanceof HTMLElement)) throw providerError('BAIDU_CONTAINER_MISSING');
  let BMap;
  try { BMap = await loadSDK(ak); }
  catch (error) { onError?.(error); throw error; }

  const converted = new Map();
  const pendingConversions = new Set();
  let conversionQueue = Promise.resolve();
  let map;
  let destroyed = false;
  let generation = 0;
  let markerRequest = 0;
  let locationRequest = 0;
  let overlays = [];
  let userOverlay;
  let userPosition;
  let markerSpecs = [];
  let lastViewport;
  let ready = false;
  let mapTimer;
  let moveFrame;
  let listeners = [];
  let attributionObserver;
  let attributionFrame;
  let attributionEpoch = 0;
  const attributionOrigins = new Map();
  container.classList.add('provider-baidu');

  const ensureAlive = () => { if (destroyed) throw providerError('BAIDU_DESTROYED'); };
  const report = (error) => { if (!destroyed && error.code !== 'BAIDU_DESTROYED') onError?.(error); };
  const nativePoint = (position) => {
    const point = converted.get(positionKey(position));
    if (!point) throw providerError('BAIDU_COORDINATE_NOT_PREPARED');
    return point;
  };

  function translate(batch) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        pendingConversions.delete(cancel);
        if (error) reject(error); else resolve(result);
      };
      const cancel = () => finish(providerError('BAIDU_DESTROYED'));
      pendingConversions.add(cancel);
      const timeout = setTimeout(() => finish(providerError('BAIDU_COORDINATE_TIMEOUT')), CONVERSION_TIMEOUT);
      try {
        new BMap.Convertor().translate(batch.map(([lat, lng]) => new BMap.Point(lng, lat)), 1, 5, (result) => {
          if (destroyed) { cancel(); return; }
          const status = typeof result?.status === 'number' ? result.status
            : /^\d+$/.test(result?.status ?? '') ? Number(result.status) : undefined;
          if (Number.isInteger(status) && status !== 0) {
            const error = providerError('BAIDU_COORDINATE_FAILED');
            // Expose only the provider's numeric status for diagnostics. Never
            // retain response bodies, request URLs, coordinates, or the AK.
            error.status = status;
            finish(error);
          } else if (status !== 0 || !Array.isArray(result?.points) || result.points.length !== batch.length
            || result.points.some((point) => !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng))) {
            finish(providerError('BAIDU_COORDINATE_FORMAT'));
          } else finish(null, result.points);
        });
      } catch { finish(providerError('BAIDU_COORDINATE_EXCEPTION')); }
    });
  }

  function prepare(points) {
    const input = points.map((point) => {
      if (!validPosition(point)) throw providerError('BAIDU_COORDINATE_INVALID');
      return [...point];
    });
    const job = conversionQueue.then(async () => {
      ensureAlive();
      const missing = [...new Map(input.filter((point) => !converted.has(positionKey(point)))
        .map((point) => [positionKey(point), point])).values()];
      // Ten-point batches also work with older compatible Convertor endpoints.
      for (let start = 0; start < missing.length; start += 10) {
        ensureAlive();
        const batch = missing.slice(start, start + 10);
        const result = await translate(batch);
        ensureAlive();
        batch.forEach((point, index) => converted.set(positionKey(point), result[index]));
      }
    });
    conversionQueue = job.catch(() => {});
    return job;
  }

  function notifyMove() {
    if (moveFrame || destroyed) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = undefined;
      if (!destroyed) onMove?.();
    });
  }

  function nativeAttributionElements() {
    const elements = [...container.querySelectorAll('.BMap_cpyCtrl, .BMap_cpyCtrlV4, .anchorBL:has(> img)')];
    // Some SDK versions nest a copyright control in an anchored wrapper. Move
    // only its outermost matching node so its original DOM stays together.
    return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
  }

  function startAttribution(current) {
    if (!attributionContainer) return;
    const epoch = ++attributionEpoch;
    const relocate = () => {
      attributionFrame = undefined;
      if (destroyed || current !== generation || epoch !== attributionEpoch) return;
      for (const element of nativeAttributionElements()) {
        if (!attributionOrigins.has(element)) {
          attributionOrigins.set(element, { parent: element.parentNode, nextSibling: element.nextSibling });
        }
      }
      const elements = [...attributionOrigins.keys()].sort((a, b) => {
        const copyright = (element) => element.matches('.BMap_cpyCtrl, .BMap_cpyCtrlV4')
          || Boolean(element.querySelector('.BMap_cpyCtrl, .BMap_cpyCtrlV4'));
        return Number(copyright(b)) - Number(copyright(a));
      });
      const present = [...attributionContainer.children].filter((element) => attributionOrigins.has(element));
      if (elements.some((element, index) => present[index] !== element)) {
        // Reparent the native nodes, preserving their text, links and listeners.
        // Copyright comes first; the provider logo remains after it.
        attributionContainer.append(...elements);
      }
    };
    const schedule = () => {
      if (!attributionFrame && !destroyed && current === generation && epoch === attributionEpoch) {
        attributionFrame = requestAnimationFrame(relocate);
      }
    };
    attributionObserver = new MutationObserver(schedule);
    attributionObserver.observe(container, { childList: true, subtree: true });
    schedule();
  }

  function restoreAttribution() {
    ++attributionEpoch;
    attributionObserver?.disconnect();
    attributionObserver = undefined;
    if (attributionFrame) cancelAnimationFrame(attributionFrame);
    attributionFrame = undefined;
    // Restore siblings in reverse order before SDK cleanup, which may still
    // refer to the controls' original parents. Never clear another map's host.
    for (const [element, { parent, nextSibling }] of [...attributionOrigins].reverse()) {
      parent?.insertBefore(element, nextSibling?.parentNode === parent ? nextSibling : null);
    }
    attributionOrigins.clear();
  }

  function clearMap() {
    clearTimeout(mapTimer);
    if (moveFrame) cancelAnimationFrame(moveFrame);
    moveFrame = undefined;
    for (const [event, handler] of listeners) map?.removeEventListener(event, handler);
    listeners = [];
    restoreAttribution();
    map?.destroy();
    map = undefined;
    overlays = [];
    userOverlay = undefined;
    container.replaceChildren();
  }

  function buildMap() {
    const current = ++generation;
    ready = false;
    map = new BMap.Map(container, {
      minZoom: 3, maxZoom: 18, enableAutoResize: true, fixCenterWhenResize: true,
      enableWheelZoom: true, enableKeyboard: true, enableMapClick: false,
      enableRotate: false, enableRotateGestures: false, enableTilt: false, enableTiltGestures: false,
    });
    startAttribution(current);
    const listen = (event, handler) => {
      const guarded = () => { if (!destroyed && current === generation) handler(); };
      listeners.push([event, guarded]);
      map.addEventListener(event, guarded);
    };
    listen('moveend', notifyMove);
    listen('zoomend', notifyMove);
    listen('tilesloaded', () => {
      clearTimeout(mapTimer);
      if (!ready) { ready = true; onReady?.(); }
    });
    for (const event of ['style_loaded_error', 'style_loaded_timeout']) {
      listen(event, () => { ready = false; report(providerError('BAIDU_MAP_NETWORK')); });
    }
    mapTimer = setTimeout(() => {
      if (!destroyed && current === generation && !ready) report(providerError('BAIDU_MAP_TIMEOUT'));
    }, MAP_TIMEOUT);
    if (reducedMotion) {
      map.disableContinuousZoom();
      map.disableInertialDragging();
    }
    // This is an initial BD09 camera center, not a venue or user coordinate.
    map.centerAndZoom(lastViewport?.center || new BMap.Point(113, 33), lastViewport?.zoom || 5, { noAnimation: true });
  }

  function markerDOM(spec) {
    const wrapper = document.createElement('div');
    wrapper.className = 'provider-marker-wrap';
    const size = Array.isArray(spec.size) ? spec.size : [spec.size || 44, spec.size || 44];
    wrapper.style.width = `${size[0]}px`;
    wrapper.style.height = `${size[1]}px`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${spec.className || 'surf-marker'} provider-marker`;
    button.style.width = `${size[0]}px`;
    button.style.height = `${size[1]}px`;
    button.dataset.markerKey = spec.key;
    if (spec.venueId) button.dataset.markerVenue = spec.venueId;
    button.title = spec.label;
    button.setAttribute('aria-label', spec.label);
    button.innerHTML = spec.html;
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); spec.onActivate?.(); });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) spec.onActivate?.();
    });
    const label = document.createElement('span');
    label.className = 'provider-marker-label';
    label.textContent = spec.label;
    label.setAttribute('aria-hidden', 'true');
    wrapper.append(button, label);
    return wrapper;
  }

  async function setMarkers(specs) {
    const request = ++markerRequest;
    const current = generation;
    markerSpecs = specs;
    try {
      await prepare(specs.map((spec) => spec.position));
      if (destroyed || request !== markerRequest || current !== generation) return;
      const next = specs.map((spec) => new BMap.CustomOverlay(() => markerDOM(spec), {
        point: nativePoint(spec.position), anchors: [0.5, 0.5], enableDraggingMap: false,
        useTranslate: true, zIndex: spec.className?.includes('selected') ? 20 : 10,
      }));
      for (const overlay of overlays) map.removeOverlay(overlay);
      overlays = next;
      for (const overlay of overlays) map.addOverlay(overlay);
    } catch (error) { report(error); throw error; }
  }

  async function setUserLocation(position) {
    const request = ++locationRequest;
    const current = generation;
    userPosition = [...position];
    try {
      await prepare([position]);
      if (destroyed || request !== locationRequest || current !== generation) return;
      if (userOverlay) map.removeOverlay(userOverlay);
      userOverlay = new BMap.CustomOverlay(() => {
        const point = document.createElement('div');
        point.className = 'provider-user-location';
        point.setAttribute('role', 'img');
        point.setAttribute('aria-label', locationLabel);
        return point;
      }, { point: nativePoint(position), anchors: [0.5, 0.5], zIndex: 30 });
      map.addOverlay(userOverlay);
    } catch (error) { report(error); throw error; }
  }

  function fitBounds(points, { paddingTopLeft = [0, 0], paddingBottomRight = [0, 0], maxZoom = 18, animate = true } = {}) {
    ensureAlive();
    if (!points.length) return;
    const native = points.map(nativePoint);
    const margins = [paddingTopLeft[1], paddingBottomRight[0], paddingBottomRight[1], paddingTopLeft[0]];
    let viewport = map.getViewport(native, { margins });
    const zoom = Math.max(3, Math.min(maxZoom, viewport.zoom));
    // Recalculate asymmetric padding at the capped zoom; changing only zoom on
    // the first viewport would put a single pin underneath a mobile sheet.
    if (zoom !== viewport.zoom) viewport = map.getViewport(native, { margins, zoomFactor: zoom - viewport.zoom });
    lastViewport = { center: viewport.center, zoom };
    map.setViewport(lastViewport, { enableAnimation: animate && !reducedMotion });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    ++generation; ++markerRequest; ++locationRequest;
    for (const cancel of [...pendingConversions]) cancel();
    clearMap();
    converted.clear();
    markerSpecs = [];
    userPosition = undefined;
    container.classList.remove('provider-baidu');
  }

  async function retry() {
    ensureAlive();
    ++markerRequest; ++locationRequest;
    clearMap();
    try {
      buildMap();
      await setMarkers(markerSpecs);
      if (userPosition) await setUserLocation(userPosition);
    } catch (error) { report(error); throw error; }
  }

  try { buildMap(); }
  catch (error) { destroy(); onError?.(error); throw error; }
  return {
    prepare, setMarkers, setUserLocation, fitBounds, retry, destroy,
    project(position) { ensureAlive(); const pixel = map.pointToPixel(nativePoint(position)); return { x: pixel.x, y: pixel.y }; },
    getZoom() { return map?.getZoom() ?? 5; },
    zoomIn() { if (!destroyed) map.setZoom(Math.min(18, map.getZoom() + 1), { noAnimation: reducedMotion }); },
    zoomOut() { if (!destroyed) map.setZoom(Math.max(3, map.getZoom() - 1), { noAnimation: reducedMotion }); },
    resize() { if (!destroyed) { map.checkResize(); notifyMove(); } },
    getAttributionElements() { return [...new Set([...attributionOrigins.keys(), ...nativeAttributionElements()])]; },
  };
}
