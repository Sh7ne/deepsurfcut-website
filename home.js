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

  document.querySelectorAll('[data-follow-player]').forEach((player) => {
    const source = player.querySelector('[data-follow-source]');
    const portrait = player.querySelector('[data-follow-output]');
    const controls = player.querySelector('[data-follow-controls]');
    const toggle = player.querySelector('[data-follow-toggle]');
    const mute = player.querySelector('[data-follow-mute]');
    const replay = player.querySelector('[data-follow-replay]');
    const seek = player.querySelector('[data-follow-seek]');
    const time = player.querySelector('[data-follow-time]');
    const status = player.querySelector('[data-follow-status]');
    const cropOverlay = player.querySelector('[data-follow-crop-overlay]');
    const cropRect = player.querySelector('[data-follow-crop]');
    if (!source || !portrait || !controls || !toggle || !mute || !replay || !seek || !time || !status) return;

    const videos = [source, portrait];
    const connection = navigator.connection;
    const copy = isChinese ? {
      play: '\u540c\u65f6\u64ad\u653e\u4e24\u4e2a\u89c6\u9891',
      pause: '\u540c\u65f6\u6682\u505c\u4e24\u4e2a\u89c6\u9891',
      soundOn: '\u5f00\u542f\u58f0\u97f3',
      soundOff: '\u5173\u95ed\u58f0\u97f3',
      loading: '\u6b63\u5728\u52a0\u8f7d\u89c6\u9891...',
      error: '\u89c6\u9891\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u64ad\u653e\u3002',
      retry: '\u91cd\u8bd5\u64ad\u653e',
    } : {
      play: 'Play both videos', pause: 'Pause both videos',
      soundOn: 'Turn sound on', soundOff: 'Turn sound off',
      loading: 'Loading videos...', error: 'Videos could not load. Try playing again.', retry: 'Retry videos',
    };
    let visible = false;
    let loaded = false;
    let userPaused = false;
    let explicitPlayback = false;
    let wanted = false;
    let scrubbing = false;
    let failed = false;
    let starting = false;
    let run = 0;
    let frame = 0;
    let pending = null;
    let cropTrack = null;
    let cropFrameUpdatedAt = 0;

    const duration = () => Math.min(...videos.map((video) => Number.isFinite(video.duration) ? video.duration : 18));
    const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const updateCrop = (seconds = source.currentTime) => {
      if (!cropTrack || !cropRect || !cropOverlay) return;
      const index = Math.min(cropTrack.positions.length - 1, Math.max(0, Math.round(seconds * cropTrack.fps)));
      const [x, y] = cropTrack.positions[index];
      cropRect.setAttribute('x', String(x * 1280));
      cropRect.setAttribute('y', String(y * 720));
      cropRect.setAttribute('width', String(cropTrack.width * 1280));
      cropRect.setAttribute('height', String(cropTrack.height * 720));
      cropOverlay.removeAttribute('hidden');
    };
    if (cropOverlay && cropRect && player.dataset.followCropUrl) {
      fetch(player.dataset.followCropUrl).then((response) => {
        if (!response.ok) throw new Error('Crop track unavailable');
        return response.json();
      }).then((track) => {
        const valid = Number.isFinite(track.fps) && track.fps > 0
          && Number.isFinite(track.width) && track.width > 0 && track.width <= 1
          && Number.isFinite(track.height) && track.height > 0 && track.height <= 1
          && Array.isArray(track.positions) && track.positions.length > 0
          && track.positions.every((point) => Array.isArray(point) && point.length === 2
            && point.every(Number.isFinite) && point[0] >= 0 && point[1] >= 0
            && point[0] + track.width <= 1.000001 && point[1] + track.height <= 1.000001);
        if (!valid) throw new Error('Invalid crop track');
        cropTrack = track;
        updateCrop();
      }).catch(() => cropOverlay.setAttribute('hidden', ''));
      if ('requestVideoFrameCallback' in source) {
        // Use the displayed source frame, including paused seeks, as the crop frame's clock.
        const drawCrop = (_now, metadata) => {
          cropFrameUpdatedAt = performance.now();
          updateCrop(metadata.mediaTime);
          source.requestVideoFrameCallback(drawCrop);
        };
        source.requestVideoFrameCallback(drawCrop);
      }
      source.addEventListener('seeked', () => updateCrop());
    }
    const setStatus = (message = '') => {
      if (status.textContent !== message) status.textContent = message;
      status.hidden = !message;
    };
    const setButton = (button, label, marker, name) => {
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      const icon = button.querySelector(`[${marker}]`);
      if (icon?.getAttribute('data-lucide') === name) return;
      const replacement = document.createElement('i');
      replacement.setAttribute(marker, '');
      replacement.setAttribute('data-lucide', name);
      replacement.setAttribute('aria-hidden', 'true');
      icon?.replaceWith(replacement);
      renderIcons();
    };
    const updateControls = () => {
      setButton(toggle, failed ? copy.retry : (wanted ? copy.pause : copy.play), 'data-follow-play-icon', failed ? 'rotate-ccw' : (wanted ? 'pause' : 'play'));
      setButton(mute, source.muted ? copy.soundOn : copy.soundOff, 'data-follow-sound-icon', source.muted ? 'volume-x' : 'volume-2');
    };
    const updateTime = () => {
      const end = duration();
      const current = Math.min(end, source.currentTime);
      seek.max = String(end);
      seek.disabled = !videos.every((video) => video.readyState >= 1);
      if (!scrubbing) seek.value = String(current);
      const value = `${clock(current)} / ${clock(end)}`;
      if (time.textContent !== value) time.textContent = value;
      seek.setAttribute('aria-valuetext', isChinese ? `${clock(current)}\uff0c\u5171 ${clock(end)}` : `${clock(current)} of ${clock(end)}`);
      // Browsers can suspend frame callbacks when the original scrolls out of view.
      if (!('requestVideoFrameCallback' in source) || performance.now() - cropFrameUpdatedAt > 50) updateCrop();
    };
    const load = (retry = false) => {
      if (loaded && !retry) return;
      loaded = true;
      videos.forEach((video) => { video.preload = 'auto'; video.load(); });
    };
    const pausePair = () => {
      run += 1;
      pending?.abort();
      pending = null;
      starting = false;
      window.cancelAnimationFrame(frame);
      videos.forEach((video) => { video.pause(); video.playbackRate = 1; });
    };
    const seekPair = (value) => {
      videos.forEach((video) => { if (video.readyState >= 1) video.currentTime = value; });
      updateTime();
    };
    const ready = (video, signal) => new Promise((resolve, reject) => {
      if (video.readyState >= 3 && !video.seeking) { resolve(); return; }
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('canplay', check);
        video.removeEventListener('seeked', check);
        video.removeEventListener('error', error);
        signal.removeEventListener('abort', abort);
      };
      const check = () => { if (video.readyState >= 3 && !video.seeking) { cleanup(); resolve(); } };
      const error = () => { cleanup(); reject(new Error('Video unavailable')); };
      const abort = () => { cleanup(); reject(new DOMException('Playback cancelled', 'AbortError')); };
      const timer = window.setTimeout(error, 15000);
      video.addEventListener('canplay', check);
      video.addEventListener('seeked', check);
      video.addEventListener('error', error);
      signal.addEventListener('abort', abort, { once: true });
    });
    const syncFrame = () => {
      if (!wanted || source.paused || portrait.paused) return;
      const drift = source.currentTime - portrait.currentTime;
      // The original is the shared clock; correct small drift gently and large drift by seeking.
      if (Math.abs(drift) > .12 && !portrait.seeking) portrait.currentTime = source.currentTime;
      portrait.playbackRate = Math.abs(drift) > .035 && Math.abs(drift) <= .12 ? (drift > 0 ? 1.04 : .96) : 1;
      updateTime();
      frame = window.requestAnimationFrame(syncFrame);
    };
    const startPair = async () => {
      if (!wanted || scrubbing || starting || (!source.paused && !portrait.paused)) return;
      load();
      starting = true;
      const currentRun = ++run;
      pending = new AbortController();
      setStatus(copy.loading);
      try {
        await Promise.all(videos.map((video) => ready(video, pending.signal)));
        if (currentRun !== run || !wanted) return;
        if (source.ended || source.currentTime >= duration()) seekPair(0);
        if (Math.abs(source.currentTime - portrait.currentTime) > .025) {
          portrait.currentTime = source.currentTime;
          await ready(portrait, pending.signal);
          if (currentRun !== run || !wanted) return;
        }
        await Promise.all(videos.map((video) => video.play()));
        if (currentRun !== run || !wanted) { if (!wanted) videos.forEach((video) => video.pause()); return; }
        setStatus();
        frame = window.requestAnimationFrame(syncFrame);
      } catch (error) {
        if (currentRun !== run || error.name === 'AbortError') return;
        wanted = false;
        userPaused = true;
        failed = error.name !== 'NotAllowedError';
        pausePair();
        setStatus(failed ? copy.error : '');
        updateControls();
      } finally {
        if (currentRun === run) { starting = false; pending = null; }
      }
    };
    const updatePlayback = () => {
      wanted = visible && !document.hidden && !userPaused && (explicitPlayback || (!reducedMotion.matches && !connection?.saveData));
      if (wanted) startPair();
      else { pausePair(); if (!failed) setStatus(); }
      updateControls();
    };
    const togglePlayback = () => {
      if (failed) { failed = false; load(true); }
      userPaused = wanted;
      explicitPlayback = !userPaused;
      updatePlayback();
    };
    toggle.addEventListener('click', togglePlayback);
    videos.forEach((video) => video.addEventListener('click', togglePlayback));
    mute.addEventListener('click', () => { source.muted = !source.muted; updateControls(); });
    replay.addEventListener('click', () => {
      pausePair();
      if (failed) { failed = false; load(true); }
      seekPair(0);
      userPaused = false;
      explicitPlayback = true;
      updatePlayback();
    });
    seek.addEventListener('input', () => { scrubbing = true; pausePair(); seekPair(Number(seek.value)); });
    const finishSeeking = () => { if (scrubbing) { scrubbing = false; updatePlayback(); } };
    seek.addEventListener('change', finishSeeking);
    seek.addEventListener('blur', finishSeeking);
    videos.forEach((video) => {
      video.controls = false;
      video.addEventListener('loadedmetadata', updateTime);
      video.addEventListener('playing', () => { if (!wanted || scrubbing) video.pause(); });
      video.addEventListener('waiting', () => {
        if (wanted && !scrubbing && !starting && !videos.some((item) => item.seeking)) { pausePair(); startPair(); }
      });
      video.addEventListener('ended', () => {
        if (wanted && source.currentTime >= duration() - .1) { pausePair(); seekPair(0); startPair(); }
        else updateTime();
      });
    });
    portrait.muted = true;
    controls.hidden = false;
    time.setAttribute('aria-live', 'off');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) load();
        updatePlayback();
      }, { threshold: .05 });
      observer.observe(player);
    } else { visible = true; updatePlayback(); }
    document.addEventListener('visibilitychange', updatePlayback);
    reducedMotion.addEventListener('change', () => { explicitPlayback = false; updatePlayback(); });
    connection?.addEventListener?.('change', updatePlayback);
    updateControls();
    updateTime();
  });

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
