(() => {
  'use strict';

  const tablist = document.querySelector('[data-platform-tabs]');
  if (!tablist) return;
  const tabs = [...tablist.querySelectorAll('[data-platform-tab]')];
  const panels = [...document.querySelectorAll('[data-platform-panel]')];
  const languageLinks = [...document.querySelectorAll('[data-updates-language]')];
  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tab.dataset.platformTab);
  });
  panels.forEach((panel) => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${panel.id}`);
    panel.tabIndex = 0;
  });

  const targetFromHash = () => {
    try { return document.getElementById(decodeURIComponent(window.location.hash.slice(1))); }
    catch { return null; }
  };
  const syncLanguageLinks = () => {
    const hash = targetFromHash()?.closest('[data-platform-panel]') ? window.location.hash : '';
    languageLinks.forEach((link) => { link.hash = hash; });
  };
  const selectPlatform = (platform, focus = false) => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.platformTab === platform;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (focus && selected) tab.focus({ preventScroll: true });
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== platform; });
    syncLanguageLinks();
  };
  const syncFromLocation = () => {
    const target = targetFromHash();
    const panel = target?.closest('[data-platform-panel]');
    selectPlatform(panel?.id || 'ios');
    // Make a version permalink visible before the browser scrolls to it.
    if (panel && target !== panel) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  const activate = (tab, focus = false) => {
    const hash = `#${tab.dataset.platformTab}`;
    if (window.location.hash !== hash) history.pushState(null, '', hash);
    selectPlatform(tab.dataset.platformTab, focus);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activate(tab);
    });
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next !== undefined) {
        event.preventDefault();
        activate(tabs[next], true);
      } else if (event.key === ' ') {
        event.preventDefault();
        activate(tab);
      }
    });
  });
  window.addEventListener('hashchange', syncFromLocation);
  window.addEventListener('popstate', syncFromLocation);
  syncFromLocation();
})();
