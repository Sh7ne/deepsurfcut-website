(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  const renderIcons = () => window.lucide?.createIcons();

  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileNav = document.getElementById('mobile-nav');
  if (menuToggle && mobileNav) {
    const setMenuOpen = (open, restoreFocus = false) => {
      const label = isChinese
        ? (open ? '\u5173\u95ed\u83dc\u5355' : '\u6253\u5f00\u83dc\u5355')
        : (open ? 'Close menu' : 'Open menu');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', label);
      menuToggle.setAttribute('title', label);
      mobileNav.hidden = !open;
      if (restoreFocus) menuToggle.focus();
    };
    const menuIsOpen = () => menuToggle.getAttribute('aria-expanded') === 'true';

    menuToggle.addEventListener('click', () => setMenuOpen(!menuIsOpen()));
    mobileNav.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      setMenuOpen(false);
      if (!link.hash || link.origin !== window.location.origin
        || link.pathname !== window.location.pathname || link.search !== window.location.search
        || link.target === '_blank') return;
      const destination = document.getElementById(link.hash.slice(1));
      const heading = destination?.querySelector('h1, h2, h3, h4, h5, h6') || destination;
      if (heading) {
        // Leave native fragment scrolling intact, then move focus out of the closed menu.
        window.requestAnimationFrame(() => {
          if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
            heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
          }
          heading.closest('[data-reveal]')?.classList.add('is-visible');
          heading.focus({ preventScroll: true });
        });
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuIsOpen()) {
        event.preventDefault();
        setMenuOpen(false, true);
      }
    });
    document.addEventListener('click', (event) => {
      if (menuIsOpen() && !mobileNav.contains(event.target) && !menuToggle.contains(event.target)) {
        setMenuOpen(false);
      }
    });
    window.addEventListener('resize', () => {
      if (menuIsOpen() && window.getComputedStyle(menuToggle).display === 'none') {
        setMenuOpen(false);
      }
    }, { passive: true });
    setMenuOpen(false);
  }

  const heroVideo = document.querySelector('[data-hero-video]');
  const videoToggle = document.querySelector('[data-video-toggle]');
  if (heroVideo) {
    const connection = navigator.connection;
    let videoIsVisible = false;
    let userPaused = false;
    let explicitPlayback = false;
    let shouldBePlaying = false;

    const updateVideoControl = () => {
      if (!videoToggle) return;
      const playing = !heroVideo.paused && !heroVideo.ended;
      const label = isChinese
        ? (playing ? '\u6682\u505c\u89c6\u9891' : '\u64ad\u653e\u89c6\u9891')
        : (playing ? 'Pause video' : 'Play video');
      videoToggle.setAttribute('aria-label', label);
      videoToggle.setAttribute('title', label);
      videoToggle.dataset.videoState = playing ? 'playing' : 'paused';
      const icon = videoToggle.querySelector('[data-video-icon]');
      const iconName = playing ? 'pause' : 'play';
      if (icon && icon.getAttribute('data-lucide') !== iconName) {
        const replacement = document.createElement('i');
        replacement.setAttribute('data-video-icon', '');
        replacement.setAttribute('data-lucide', iconName);
        replacement.setAttribute('aria-hidden', 'true');
        icon.replaceWith(replacement);
        renderIcons();
      }
    };

    const updatePlayback = () => {
      const automaticPlayback = !reducedMotion.matches && !connection?.saveData;
      shouldBePlaying = videoIsVisible && !document.hidden && !userPaused
        && (explicitPlayback || automaticPlayback);
      if (shouldBePlaying) {
        const request = heroVideo.play();
        request?.catch(updateVideoControl);
      } else {
        heroVideo.pause();
      }
      updateVideoControl();
    };

    heroVideo.addEventListener('playing', () => {
      if (!shouldBePlaying) heroVideo.pause();
      updateVideoControl();
    });
    heroVideo.addEventListener('pause', updateVideoControl);
    heroVideo.addEventListener('error', () => {
      updateVideoControl();
      if (videoToggle) videoToggle.hidden = true;
    });

    videoToggle?.addEventListener('click', () => {
      if (!heroVideo.paused) {
        userPaused = true;
        explicitPlayback = false;
      } else {
        userPaused = false;
        explicitPlayback = true;
      }
      updatePlayback();
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        videoIsVisible = entry.isIntersecting;
        updatePlayback();
      }, { threshold: 0.05 });
      observer.observe(heroVideo);
    } else {
      videoIsVisible = true;
      updatePlayback();
    }

    document.addEventListener('visibilitychange', updatePlayback);
    reducedMotion.addEventListener('change', () => {
      explicitPlayback = false;
      updatePlayback();
    });
    connection?.addEventListener?.('change', () => {
      explicitPlayback = false;
      updatePlayback();
    });
    updateVideoControl();
  }

  document.querySelectorAll('[data-demo]').forEach((demo) => {
    const runButton = demo.querySelector('[data-demo-run]');
    const action = demo.querySelector('[data-demo-action]');
    const status = demo.querySelector('[data-demo-status]');
    const progress = demo.querySelector('[data-demo-progress]');
    const filters = Array.from(demo.querySelectorAll('[data-rider-filter]'));
    if (!runButton) return;

    const fallback = isChinese ? {
      statusIdle: '\u7b49\u5f85\u6574\u7406\u8fd9\u573a\u51b2\u6d6a\u3002',
      statusScanning: '\u6b63\u5728\u67e5\u627e\u51b2\u6d6a\u7247\u6bb5\u2026',
      statusDetected: '\u5df2\u627e\u5230\u51b2\u6d6a\u7247\u6bb5\u3002',
      statusSorted: '\u6574\u7406\u5b8c\u6210\uff0c\u53ef\u4ee5\u5f00\u59cb\u56de\u770b\u3002',
      actionRun: '\u6574\u7406\u8fd9\u573a\u51b2\u6d6a',
      actionWorking: '\u6b63\u5728\u6574\u7406\u2026',
      actionReplay: '\u518d\u770b\u4e00\u6b21',
    } : {
      statusIdle: 'Your session, ready to sort.',
      statusScanning: 'Finding the rides...',
      statusDetected: 'Rides found.',
      statusSorted: 'Sorted and ready to review.',
      actionRun: 'Sort this session',
      actionWorking: 'Sorting...',
      actionReplay: 'Replay',
    };
    const copy = (key) => demo.dataset[key] || fallback[key];
    const stages = {
      idle: { status: 'statusIdle', action: 'actionRun', progress: 0 },
      scanning: { status: 'statusScanning', action: 'actionWorking', progress: 50 },
      detected: { status: 'statusDetected', action: 'actionWorking', progress: 87 },
      sorted: { status: 'statusSorted', action: 'actionReplay', progress: 100 },
    };
    let running = false;
    let timers = [];
    let frame = 0;

    const clearSchedule = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const setFilter = (value) => {
      demo.dataset.filter = value;
      filters.forEach((filter) => {
        filter.setAttribute('aria-pressed', String(filter.dataset.riderFilter === value));
      });
    };

    const setStage = (name) => {
      const stage = stages[name];
      demo.dataset.state = name;
      if (status) status.textContent = copy(stage.status);
      if (action) action.textContent = copy(stage.action);
      if (progress) {
        progress.setAttribute('aria-valuenow', String(stage.progress));
        progress.setAttribute('aria-valuetext', copy(stage.status));
      }
      filters.forEach((filter) => {
        filter.disabled = name !== 'sorted' && filter.dataset.riderFilter !== 'all';
      });
    };

    const finish = () => {
      clearSchedule();
      running = false;
      runButton.disabled = false;
      runButton.setAttribute('aria-busy', 'false');
      setStage('sorted');
    };

    const begin = () => {
      if (!running) return;
      if (reducedMotion.matches || document.hidden) {
        finish();
        return;
      }
      setStage('scanning');
      timers.push(window.setTimeout(() => setStage('detected'), 1300));
      timers.push(window.setTimeout(finish, 2600));
    };

    runButton.addEventListener('click', () => {
      if (running) return;
      clearSchedule();
      running = true;
      runButton.disabled = true;
      runButton.setAttribute('aria-busy', 'true');
      setFilter('all');
      const replaying = demo.dataset.state === 'sorted';
      setStage('idle');
      if (replaying && !reducedMotion.matches && !document.hidden) {
        // Commit the original arrangement before replaying its transformation.
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(begin);
        });
      } else {
        begin();
      }
    });

    filters.forEach((filter) => {
      filter.addEventListener('click', () => {
        if (demo.dataset.state === 'sorted') setFilter(filter.dataset.riderFilter);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && running) finish();
    });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches && running) finish();
    });
    setFilter('all');
    setStage('idle');
  });

  document.querySelectorAll('[data-editor-tabs], [data-screenshot-tabs]').forEach((tabList) => {
    const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    const selectTab = (selected, focus = false) => {
      tabs.forEach((tab) => {
        const active = tab === selected;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
      if (focus) selected.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        let nextIndex;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex !== undefined) {
          event.preventDefault();
          selectTab(tabs[nextIndex], true);
        }
      });
    });
    selectTab(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
  });

  const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
  if (reveals.length) {
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      reveals.forEach((element) => element.classList.add('is-visible'));
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
      reveals.forEach((element) => observer.observe(element));
      reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) {
          observer.disconnect();
          reveals.forEach((element) => element.classList.add('is-visible'));
        }
      });
    }
  }

  document.documentElement.classList.add('js');
  renderIcons();
})();
