import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { buildIcons } from '../scripts/build-icons.mjs';

const root = new URL('../', import.meta.url);
const [icons, originalIcons, home] = await Promise.all(['assets/icons-20261015.js', 'assets/lucide.min.js', 'home.js'].map((file) => readFile(new URL(file, root), 'utf8')));

class Element extends EventTarget {
  constructor(localName = 'div', attributes = {}) {
    super();
    this.localName = localName;
    this.attrs = new Map(Object.entries(attributes));
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.classList = { add() {} };
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) { this.children.push(child); }
  replaceWith(node) { this.replacement = node; }
  querySelector() { return null; }
}

function media() {
  return Object.assign(new Element('video'), {
    paused: true, ended: false, muted: true, currentTime: 0, duration: 18, readyState: 3,
    loads: 0, plays: 0,
    load() { this.loads += 1; },
    play() { this.plays += 1; this.paused = false; return Promise.resolve(); },
    pause() { const wasPlaying = !this.paused; this.paused = true; if (wasPlaying) this.dispatchEvent(new Event('pause')); },
  });
}

function homepage({ reducedMotion = false, saveData = false, effectiveType = '4g', withFollow = false } = {}) {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false, readyState: 'loading' });
  const connection = Object.assign(new EventTarget(), { saveData, effectiveType });
  const motion = Object.assign(new EventTarget(), { matches: reducedMotion });
  const video = media();
  const toggle = new Element('button');
  const frames = [];
  const observers = [];
  const fetched = [];
  const follow = new Element('figure');
  const followNodes = new Map([
    ['source', media()], ['output', media()], ['controls', new Element()], ['toggle', new Element('button')],
    ['mute', new Element('button')], ['replay', new Element('button')], ['seek', new Element('input')],
    ['time', new Element('output')], ['status', new Element()], ['crop-overlay', new Element('svg')], ['crop', new Element('rect')],
  ].map(([name, node]) => [`[data-follow-${name}]`, node]));
  follow.querySelector = (selector) => followNodes.get(selector);
  follow.dataset.followCropUrl = '/assets/follow-crop-20261014.json';
  document.documentElement = Object.assign(new Element('html'), { lang: 'en' });
  document.querySelectorAll = (selector) => selector === '[data-follow-player]' && withFollow ? [follow] : [];
  document.querySelector = (selector) => ({ '[data-hero-video]': video, '[data-video-toggle]': toggle })[selector] || null;
  document.getElementById = () => null;
  document.createElement = (tag) => new Element(tag);
  Object.assign(window, {
    matchMedia: () => motion,
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {}, setTimeout, clearTimeout,
  });
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
  }
  window.IntersectionObserver = IntersectionObserver;
  runInNewContext(home, {
    window, document, navigator: { connection }, IntersectionObserver, Event, URL, AbortController, DOMException,
    performance, fetch: async (url) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ fps: 30, width: .25, height: 1, positions: [[0, 0]] }) };
    },
  });
  return {
    window, document, connection, motion, video, toggle, follow, followNodes, fetched,
    visible(target, isIntersecting = true) { observers.find((observer) => observer.target === target).callback([{ isIntersecting }]); },
    paint() { frames.splice(0).forEach((callback) => callback()); },
  };
}

// This is a transfer-size budget and a glyph/attribute compatibility check, not a
// timing benchmark. Browser rendering and production transfer remain separate checks.
test('the site icon bundle stays small and preserves every used glyph and interactive marker', async () => {
  const built = await buildIcons({ check: true });
  assert.ok(built.bytes < 12_000, 'the public bundle must not grow into the full icon library');
  assert.ok(gzipSync(icons).length < 4_000, 'compressed icon transfer budget');
  assert.ok(Buffer.byteLength(icons) < Buffer.byteLength(originalIcons) / 20);
  const library = {};
  runInNewContext(originalIcons, library);
  const placeholders = [];
  const document = {
    querySelectorAll: () => placeholders.map((node) => node.replacement || node),
    createElementNS: (_, tag) => new Element(tag),
  };
  const window = {};
  runInNewContext(icons, { window, document });
  const names = JSON.parse(icons.match(/const icons = (.*);/)[1]);
  for (const name of Object.keys(names)) {
    placeholders.push(new Element('i', { 'data-lucide': name, 'data-follow-play-icon': '', 'aria-hidden': 'true', class: 'follow-arrow' }));
  }
  window.lucide.createIcons();
  for (const placeholder of placeholders) {
    const rendered = placeholder.replacement;
    const name = placeholder.getAttribute('data-lucide');
    const key = name.replace(/(^|-)([a-z0-9])/g, (_, separator, character) => character.toUpperCase());
    assert.equal(rendered.localName, 'svg', name);
    assert.equal(rendered.getAttribute('data-follow-play-icon'), '');
    assert.equal(rendered.getAttribute('aria-hidden'), 'true');
    assert.ok(rendered.getAttribute('class').includes('follow-arrow'));
    const artwork = rendered.children.map((child) => [child.localName, Object.fromEntries(child.attrs)]);
    assert.equal(JSON.stringify(artwork), JSON.stringify(library.lucide.icons[key]), name);
  }
  window.lucide.createIcons();
  assert.ok(placeholders.every((node) => !node.replacement.replacement), 'rendering a new control icon must preserve existing SVG nodes');
});

test('hero autoplay waits for initial rendering while deliberate playback stays immediate', () => {
  const page = homepage();
  page.visible(page.video);
  assert.equal(page.video.plays, 0, 'visible hero must not compete with the poster during page load');
  page.window.dispatchEvent(new Event('load'));
  page.paint();
  assert.equal(page.video.plays, 0, 'give the loaded page a paint before starting video');
  page.paint();
  assert.equal(page.video.plays, 1);
  page.visible(page.video, false);
  assert.equal(page.video.paused, true);

  const deliberate = homepage();
  deliberate.visible(deliberate.video);
  deliberate.toggle.dispatchEvent(new Event('click'));
  assert.equal(deliberate.video.plays, 1, 'a user can start playback before window.load');
  deliberate.toggle.dispatchEvent(new Event('click'));
  deliberate.window.dispatchEvent(new Event('load'));
  deliberate.paint(); deliberate.paint();
  assert.equal(deliberate.video.paused, true, 'finishing page load must respect a user pause');
});

test('reduced motion and constrained connections avoid automatic video downloads but allow playback', async (t) => {
  for (const preference of [{ reducedMotion: true }, { saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' }, { effectiveType: '3g' }]) {
    await t.test(JSON.stringify(preference), async () => {
      const page = homepage({ ...preference, withFollow: true });
      assert.equal(page.fetched.length, 0, 'offscreen crop data must not compete with the hero poster');
      page.visible(page.video);
      page.window.dispatchEvent(new Event('load')); page.paint(); page.paint();
      assert.equal(page.video.plays, 0);
      page.visible(page.follow);
      const source = page.followNodes.get('[data-follow-source]');
      const portrait = page.followNodes.get('[data-follow-output]');
      assert.equal(source.loads + portrait.loads, 0, 'scrolling into view must not download videos against the preference');
      page.followNodes.get('[data-follow-toggle]').dispatchEvent(new Event('click'));
      await new Promise(setImmediate);
      assert.equal(source.loads + portrait.loads, 2);
      assert.equal(source.plays + portrait.plays, 2);
      assert.equal(page.fetched.length, 1);
      page.toggle.dispatchEvent(new Event('click'));
      assert.equal(page.video.plays, 1, 'the hero play button overrides automatic playback preferences');
    });
  }
});
