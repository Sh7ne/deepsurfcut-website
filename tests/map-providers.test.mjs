import assert from 'node:assert/strict';
import { test } from 'node:test';

// Deliberately small DOM/SDK doubles: these tests never request either provider.
// They test the adapter boundary, not how the third-party SDK renders its tiles.
let importSequence = 0;
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function harness(t, name, { reducedMotion = true, bootstrapResult } = {}) {
  const originals = new Map();
  const replaceGlobal = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  };
  let document;
  class Element extends EventTarget {
    nodeType = 1;
    parent = null;
    children = [];
    dataset = {};
    style = {};
    attributes = {};
    innerHTML = '';
    className = '';
    constructor(tag = 'div') {
      super(); this.tagName = tag.toUpperCase();
      this.classList = {
        add: (name) => { this.className = `${this.className} ${name}`.trim(); },
        remove: (name) => { this.className = this.className.split(' ').filter((part) => part !== name).join(' '); },
      };
    }
    get isConnected() { return this.root === true || Boolean(this.parent?.isConnected); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    append(...elements) { for (const element of elements) { element.remove(); element.parent = this; this.children.push(element); } }
    remove() {
      if (!this.parent) return;
      if (document.activeElement === this || this.descendants().includes(document.activeElement)) document.activeElement = document.body;
      this.parent.children = this.parent.children.filter((element) => element !== this);
      this.parent = null;
    }
    replaceChildren(...elements) { [...this.children].forEach((element) => element.remove()); this.append(...elements); }
    descendants() { return this.children.flatMap((element) => [element, ...element.descendants()]); }
    querySelectorAll(selector) {
      if (selector === '[data-marker-key]') return this.descendants().filter((element) => element.dataset.markerKey);
      return [];
    }
    closest(selector) { return selector === '[data-marker-key]' && this.dataset.markerKey ? this : this.parent?.closest(selector) || null; }
    focus() { document.activeElement = this; }
  }
  const container = new Element(); container.root = true;
  const body = new Element('body'); body.root = true;
  const head = new Element('head'); head.root = true;
  document = { body, head, activeElement: body, createElement: (tag) => new Element(tag), querySelector: () => null };
  const scripts = [], maps = [], markers = [], conversions = [], deferred = [];
  const control = { fail: false, hold: false };
  class NativeMap {
    handlers = new Map();
    overlays = [];
    fitCalls = [];
    viewportCalls = [];
    destroyed = false;
    constructor(element, options) { this.container = element; this.options = options; this.zoom = options.zoom ?? 5; this.center = options.center; maps.push(this); if (name === 'amap') queueMicrotask(() => this.emit('complete')); }
    on(event, callback) { this.handlers.set(event, callback); }
    off(event) { this.handlers.delete(event); }
    addEventListener(event, callback) { this.on(event, callback); }
    removeEventListener(event) { this.off(event); }
    emit(event) { this.handlers.get(event)?.(); }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    lngLatToContainer(position) { return { x: position[0] * 2, y: position[1] * 2 }; }
    pointToPixel(position) { return { x: position.lng * 2, y: position.lat * 2 }; }
    setFitView(...args) { this.fitCalls.push(args); }
    getViewport(points, options) { this.viewportCalls.push({ points, options }); return { center: points[0], zoom: 17 + (options.zoomFactor || 0) }; }
    setViewport(viewport, options) { this.viewport = viewport; this.viewportOptions = options; }
    centerAndZoom(center, zoom) { this.center = center; this.zoom = zoom; queueMicrotask(() => this.emit('tilesloaded')); }
    addOverlay(overlay) { overlay.element = overlay.factory(); this.container.append(overlay.element); this.overlays.push(overlay); }
    removeOverlay(overlay) { overlay.element?.remove(); this.overlays = this.overlays.filter((entry) => entry !== overlay); }
    setZoom(zoom) { this.zoom = zoom; }
    zoomIn() { this.zoom++; }
    zoomOut() { this.zoom--; }
    resize() { this.resized = true; }
    checkResize() { this.resize(); }
    disableContinuousZoom() { this.continuousZoomDisabled = true; }
    disableInertialDragging() { this.inertialDraggingDisabled = true; }
    destroy() { this.destroyed = true; this.container.replaceChildren(); }
  }
  class Point { constructor(lng, lat) { this.lng = lng; this.lat = lat; } getLng() { return this.lng; } getLat() { return this.lat; } }
  const convert = (points, from, to, callback) => {
    conversions.push({ points, from, to });
    const deliver = () => {
      const result = points.map((point) => new Point((point.lng ?? point[0]) + 0.01, (point.lat ?? point[1]) + 0.02));
      if (name === 'amap') callback(control.fail ? 'error' : 'complete', { locations: control.fail ? [] : result });
      else callback({ status: control.fail ? 1 : 0, points: control.fail ? [] : result });
    };
    if (control.hold) deferred.push(deliver); else queueMicrotask(deliver);
  };
  const sdk = name === 'amap' ? {
    Map: NativeMap,
    Pixel: class { constructor(x, y) { this.x = x; this.y = y; } },
    Marker: class {
      constructor(options) { this.options = options; this.position = options.position; markers.push(this); }
      setMap(map) { this.options.content?.remove(); this.map = map; if (map && this.options.content) map.container.append(this.options.content); }
      setPosition(position) { this.position = position; }
      setLabel(label) { this.label = label; }
    },
    CircleMarker: class { constructor(options) { this.options = options; this.center = options.center; this.map = options.map; markers.push(this); } setCenter(center) { this.center = center; } },
    convertFrom: (points, type, callback) => convert(points, type, undefined, callback),
  } : {
    Map: NativeMap, Point,
    CustomOverlay: class { constructor(factory, options) { this.factory = factory; this.options = options; } },
    Convertor: class { translate(points, from, to, callback) { convert(points, from, to, callback); } },
  };
  const window = { location: { href: 'https://example.test/zh/venues/', origin: 'https://example.test' } };
  head.append = (script) => {
    scripts.push(script);
    if (!bootstrapResult) window[name === 'amap' ? 'AMap' : 'BMap'] = sdk;
    queueMicrotask(() => window[new URL(script.src).searchParams.get('callback')](bootstrapResult));
  };
  replaceGlobal('window', window); replaceGlobal('document', document); replaceGlobal('HTMLElement', Element);
  replaceGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0));
  replaceGlobal('cancelAnimationFrame', clearTimeout);
  let adapter;
  t.after(() => {
    adapter?.destroy();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const module = await import(`../venues/provider-${name}.js?contract-test=${++importSequence}`);
  const create = module[name === 'amap' ? 'createAmapProvider' : 'createBaiduProvider'];
  const errors = [], ready = [];
  adapter = await create({ container, key: 'test-browser-key', ak: 'test-browser-key', serviceHost: '/api/maps/amap/_AMapService', reducedMotion, onMove() {}, onReady: () => ready.push(true), onError: (error) => errors.push(error) });
  return { adapter, create, container, document, window, scripts, maps, markers, conversions, deferred, control, errors, ready };
}

for (const name of ['amap', 'baidu']) {
  test(`${name}: only the selected official SDK loads and native coordinates are prepared before projection`, async (t) => {
    const h = await harness(t, name);
    assert.equal(h.scripts.length, 1);
    const sdkURL = new URL(h.scripts[0].src);
    assert.equal(sdkURL.origin, name === 'amap' ? 'https://webapi.amap.com' : 'https://api.map.baidu.com');
    assert.equal(sdkURL.searchParams.get('v'), name === 'amap' ? '2.0' : '4.0');
    if (name === 'amap') assert.deepEqual(h.window._AMapSecurityConfig, { serviceHost: 'https://example.test/api/maps/amap/_AMapService' });
    const points = [[31, 121], [39, 116]];
    assert.throws(() => h.adapter.project(points[0]), /prepar/i);
    h.control.hold = true;
    const first = h.adapter.prepare(points);
    const duplicate = h.adapter.prepare(points);
    await tick();
    assert.equal(h.conversions.length, 1, 'concurrent requests must share conversion work');
    assert.throws(() => h.adapter.project(points[0]), /prepar/i, 'projection must not silently use WGS84 on a native basemap');
    h.deferred.shift()();
    await Promise.all([first, duplicate]);
    const call = h.conversions[0];
    assert.deepEqual(call.points.map((point) => [point.lng ?? point[0], point.lat ?? point[1]]), [[121, 31], [116, 39]]);
    assert.equal(call.from, name === 'amap' ? 'gps' : 1);
    if (name === 'baidu') assert.equal(call.to, 5);
    assert.deepEqual(h.adapter.project(points[0]), { x: 242.02, y: 62.04 });
    await h.adapter.prepare(points);
    assert.equal(h.conversions.length, 1, 'already converted points must stay cached');
    assert.ok(h.ready.length, 'the SDK map completion event marks the provider ready');
  });

  test(`${name}: asymmetric panel padding and maximum zoom reach the native fit API`, async (t) => {
    const h = await harness(t, name);
    const points = [[31, 121], [39, 116]];
    await h.adapter.prepare(points);
    await h.adapter.fitBounds(points, { paddingTopLeft: [442, 145], paddingBottomRight: [65, 66], maxZoom: 11, animate: true });
    const map = h.maps[0];
    if (name === 'amap') {
      assert.deepEqual(map.fitCalls[0].slice(1), [true, [145, 66, 442, 65], 11]);
      assert.deepEqual(map.fitCalls[0][0].map((marker) => marker.position), [[121.01, 31.02], [116.01, 39.02]]);
    } else {
      assert.deepEqual(map.viewportCalls[0].options.margins, [145, 65, 66, 442]);
      assert.equal(map.viewportCalls[1].options.zoomFactor, -6, 'recalculate padded center after capping zoom');
      assert.equal(map.viewport.zoom, 11);
      assert.equal(map.viewportOptions.enableAnimation, false);
      assert.deepEqual(map.viewportCalls[0].points.map((point) => [point.lng, point.lat]), [[121.01, 31.02], [116.01, 39.02]]);
    }
  });

  test(`${name}: DOM markers provide named keyboard buttons and wait for cluster coordinate conversion`, async (t) => {
    const h = await harness(t, name);
    let activations = 0;
    const item = { key: 'group-a', venueId: 'venue-a', position: [31.5, 121.5], label: 'Test venue', html: '<svg aria-hidden="true"></svg>', className: 'surf-marker selected', size: [44, 44], onActivate: () => activations++ };
    h.control.hold = true;
    const rendering = h.adapter.setMarkers([item]);
    await tick();
    assert.equal(h.container.querySelectorAll('[data-marker-key]').length, 0, 'no unconverted marker may appear');
    h.deferred.shift()(); await rendering;
    const button = h.container.querySelectorAll('[data-marker-key]')[0];
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.equal(button.attributes['aria-label'], 'Test venue');
    assert.equal(button.dataset.markerVenue, 'venue-a');
    for (const key of ['Enter', ' ']) {
      const event = new Event('keydown', { cancelable: true });
      Object.assign(event, { key, repeat: false });
      button.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    }
    const repeat = new Event('keydown', { cancelable: true }); Object.assign(repeat, { key: 'Enter', repeat: true }); button.dispatchEvent(repeat);
    button.dispatchEvent(new Event('click', { cancelable: true }));
    assert.equal(activations, 3, 'Enter, Space and pointer activate once; holding a key does not repeat');
    if (name === 'amap') {
      button.focus();
      await h.adapter.setMarkers([{ ...item, className: 'surf-marker' }]);
      assert.equal(h.document.activeElement, button, 'stable markers retain keyboard focus when restyled');
    }
  });

  test(`${name}: retry rebuilds map state without repeating successful coordinate conversion`, async (t) => {
    const h = await harness(t, name);
    const item = { key: 'venue-a', venueId: 'venue-a', position: [31, 121], label: 'Test venue', html: '', size: 44, onActivate() {} };
    await h.adapter.setMarkers([item]);
    await h.adapter.setUserLocation([32, 122]);
    await h.adapter.fitBounds([item.position], { maxZoom: 14 });
    const oldMap = h.maps[0];
    await h.adapter.retry();
    assert.equal(oldMap.destroyed, true);
    assert.equal(h.maps.length, 2);
    assert.equal(h.container.querySelectorAll('[data-marker-key]').length, 1);
    assert.equal(h.conversions.length, 2, 'retry must retain the venue and user conversion cache');
    if (name === 'amap') {
      assert.ok(h.markers.some((marker) => marker.map === h.maps[1] && marker.options.radius === 8));
      assert.equal(h.maps[1].fitCalls.length, 1);
    } else {
      assert.equal(h.maps[1].overlays.length, 2, 'restore both venue and user overlays');
      assert.equal(h.maps[1].zoom, 14, 'restore the fitted viewport');
    }
  });

  test(`${name}: conversion failures are recoverable and destruction rejects pending work without late markers`, async (t) => {
    const h = await harness(t, name);
    const item = { key: 'venue-a', position: [31, 121], label: 'Test venue', html: '', onActivate() {} };
    h.control.fail = true;
    await assert.rejects(h.adapter.setMarkers([item]), /conver|coordinate/i);
    assert.equal(h.errors.length, 1);
    assert.equal(h.container.querySelectorAll('[data-marker-key]').length, 0);
    h.control.fail = false;
    await h.adapter.setMarkers([item]);
    assert.equal(h.conversions.length, 2, 'failed conversion must not poison the cache');
    h.control.hold = true;
    const stale = h.adapter.setMarkers([{ ...item, position: [32, 122] }]);
    await tick();
    const rejected = assert.rejects(stale, (error) => error.name === 'AbortError' || error.code === 'BAIDU_DESTROYED');
    h.adapter.destroy();
    await rejected;
    h.deferred.shift()(); await tick();
    assert.equal(h.container.querySelectorAll('[data-marker-key]').length, 0);
    assert.equal(h.maps[0].destroyed, true);
    assert.equal(h.errors.length, 1, 'a canceled provider must not display a late failure');
  });
}

test('amap: an external security proxy is rejected before a script can load', async (t) => {
  const h = await harness(t, 'amap');
  await assert.rejects(h.create({ container: h.container, key: 'test-browser-key', serviceHost: 'https://other.test/api/maps/amap/_AMapService' }), (error) => error.code === 'AMAP_INVALID_PROXY');
  assert.equal(h.scripts.length, 1);
});


test('amap: rejected SDK bootstrap preserves a safe numeric quota status without disclosing payload details', async (t) => {
  const bootstrapResult = { status: '0', info: 'USER_DAILY_QUERY_OVER_LIMIT', infocode: '10044', request: 'private-request-details' };
  await assert.rejects(harness(t, 'amap', { bootstrapResult }), (error) => {
    assert.equal(error.code, 'AMAP_SDK_REJECTED');
    assert.equal(error.provider, 'amap');
    assert.equal(error.status, 10044);
    assert.doesNotMatch(JSON.stringify(error), /private-request-details|USER_DAILY/);
    assert.doesNotMatch(error.message, /private-request-details/);
    return true;
  });
});

test('amap: untrusted nonnumeric SDK status is not copied into diagnostics', async (t) => {
  await assert.rejects(harness(t, 'amap', { bootstrapResult: { status: '0', infocode: 'https://example.test/?private=value' } }), (error) => {
    assert.equal(error.code, 'AMAP_SDK_REJECTED');
    assert.equal(error.status, undefined);
    assert.doesNotMatch(JSON.stringify(error), /private=value/);
    return true;
  });
});
