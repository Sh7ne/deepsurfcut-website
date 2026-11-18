import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { load } from 'cheerio';
import { venueContact } from '../venues/detail-extras.js';

const root = new URL('../', import.meta.url);
const scriptPath = 'assets/contact-email-20261118.js';
const stylePath = 'assets/contact-email-20261118.css';
const source = await readFile(new URL(scriptPath, root), 'utf8');
const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const pages = ['', 'zh/', 'de/'].flatMap((prefix) => ['support', 'privacy', 'terms'].map((page) => `${prefix}${page}/index.html`));
pages.push('deepfollow/support/index.html', 'deepfollow/privacy/index.html');

test('every contact remains readable without JavaScript and loads the shared enhancement once', async () => {
  for (const file of pages) {
    const html = await readFile(new URL(file, root), 'utf8');
    const $ = load(html);
    assert.equal($('[data-contact-email]').length, 1, file);
    assert.match($('[data-contact-email]').text(), / \[at\] .* \[dot\] /, file);
    assert.equal($('[data-contact-email] button, [data-contact-email] a').length, 0, file);
    assert.equal($(`script[src="/${scriptPath}"][defer]`).length, 1, file);
    assert.equal($(`link[rel="stylesheet"][href="/${stylePath}"]`).length, 1, file);
    assert.equal($('a[href^="mailto:"]').length, 0, file);
  }
});

test('public HTML and assets contain no standard email, including entity-encoded addresses', async () => {
  const publicDirectories = new Set(['assets', 'privacy', 'support', 'terms', 'zh', 'de', 'deepfollow',
    'updates', 'surf-video-editing', 'portrait-follow', 'device-preview', 'venues', 'rapid-surf-map']);
  const inspect = async (directory = '') => {
    for (const item of await readdir(new URL(directory || './', root), { withFileTypes: true })) {
      const file = directory + item.name;
      if (item.isDirectory()) {
        if (directory || publicDirectories.has(item.name)) await inspect(file + '/');
      } else if (/\.(?:html|js|css|json|txt)$/i.test(file) && (directory || /\.html$/.test(file))) {
        const text = await readFile(new URL(file, root), 'utf8');
        assert.doesNotMatch(text, emailPattern, file);
        if (file.endsWith('.html')) {
          const $ = load(text);
          assert.doesNotMatch($.text(), emailPattern, `${file}: decoded text`);
          $('*').each((_, element) => {
            for (const value of Object.values(element.attribs || {})) {
              let decoded = value;
              try { decoded = decodeURIComponent(value); } catch { /* Non-URL attributes need no decoding. */ }
              assert.doesNotMatch(decoded, emailPattern, `${file}: decoded attribute`);
            }
          });
        }
      }
    }
  };
  await inspect();
});

function enhance(label, language = 'en', subject) {
  const navigations = [];
  const element = { textContent: label, dataset: { contactSubject: subject },
    replaceChildren(button) { this.button = button; } };
  const document = {
    documentElement: { lang: language },
    querySelectorAll: () => [element],
    addEventListener: () => {},
    createElement(tag) {
      assert.equal(tag, 'button');
      return { attributes: {}, handlers: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(event, handler) { this.handlers[event] = handler; } };
    },
  };
  runInNewContext(source, { document, window: { location: { assign: (url) => navigations.push(url) } } });
  return { element, navigations };
}

test('email is assembled only on activation; labels and DOM stay obfuscated', () => {
  for (const [language, action] of [['en', 'Send email'], ['zh-Hans', '发送邮件'], ['de', 'E-Mail senden']]) {
    const label = 'support [at] deepsurf [dot] app';
    const { element, navigations } = enhance(label, language);
    assert.deepEqual(navigations, []);
    assert.equal(element.button.type, 'button');
    assert.equal(element.button.textContent, label);
    assert.match(element.button.attributes['aria-label'], new RegExp(action));
    assert.equal(element.button.attributes.href, undefined);
    element.button.handlers.click();
    assert.equal(navigations[0], 'mailto:' + ['support', 'deepsurf.app'].join(String.fromCharCode(64)));
    assert.equal(element.button.textContent, label);
    assert.doesNotMatch(JSON.stringify(element), emailPattern);
  }
});

test('existing DeepFollow subjects are retained and safely encoded', () => {
  for (const subject of ['DeepFollow Support', 'DeepFollow Privacy', 'Question & details #1']) {
    const { element, navigations } = enhance('shinenirvana [at] googlemail [dot] com', 'zh-CN', subject);
    element.button.handlers.click();
    const target = new URL(navigations[0]);
    assert.equal(target.protocol, 'mailto:');
    assert.equal(target.pathname, ['shinenirvana', 'googlemail.com'].join(String.fromCharCode(64)));
    assert.equal(target.searchParams.get('subject'), subject);
  }
});

test('invalid labels remain plain readable text instead of creating broken buttons', () => {
  for (const label of ['Contact support', 'name [at] invalid', 'name [at] site [dot] app?body=unsafe']) {
    const { element, navigations } = enhance(label);
    assert.equal(element.button, undefined);
    assert.deepEqual(navigations, []);
  }
});

test('contacts inserted later by the map keep their obfuscated label and open the right recipient', () => {
  const label = 'hello [at] wave [dot] example';
  const html = venueContact({ contact: { email: label } }, { email: 'E-Mail', visitDetails: 'Kontakt' });
  const $ = load(html);
  assert.equal($('a[href^="mailto:"]').length, 0);
  assert.equal($('button[data-contact-email]').text(), label);
  const navigations = [];
  let click;
  runInNewContext(source, {
    document: { querySelectorAll: () => [], addEventListener: (_, handler) => { click = handler; } },
    window: { location: { assign: (url) => navigations.push(url) } },
  });
  const button = { textContent: label, dataset: {} };
  click({ target: { closest: () => button } });
  assert.equal(navigations[0], 'mailto:' + ['hello', 'wave.example'].join(String.fromCharCode(64)));
  assert.doesNotMatch(html, emailPattern);
});
