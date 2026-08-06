document.documentElement.classList.add("has-js");

const header = document.querySelector("[data-header]");
const year = document.querySelector("[data-year]");
const hero = document.querySelector(".hero");
const video = document.querySelector(".hero-media");
const revealItems = document.querySelectorAll("[data-reveal]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (year) {
  year.textContent = new Date().getFullYear();
}

let scrollFrame = 0;

const syncScroll = () => {
  if (scrollFrame) return;

  scrollFrame = window.requestAnimationFrame(() => {
    const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollRange > 0 ? window.scrollY / scrollRange : 0;

    document.documentElement.style.setProperty("--page-progress", Math.min(1, progress));
    header?.classList.toggle("is-solid", window.scrollY > 20);

    if (hero && !reducedMotion.matches) {
      const heroShift = Math.min(window.scrollY, hero.offsetHeight) * 0.035;
      hero.style.setProperty("--hero-scroll-y", `${heroShift}px`);
    }

    scrollFrame = 0;
  });
};

syncScroll();
window.addEventListener("scroll", syncScroll, { passive: true });
window.addEventListener("resize", syncScroll, { passive: true });

if (hero && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  let pointerFrame = 0;
  let pointerX = 0;
  let pointerY = 0;

  hero.addEventListener("pointermove", (event) => {
    pointerX = ((event.clientX / window.innerWidth) - 0.5) * 10;
    pointerY = ((event.clientY / window.innerHeight) - 0.5) * 7;

    if (pointerFrame || reducedMotion.matches) return;

    pointerFrame = window.requestAnimationFrame(() => {
      hero.style.setProperty("--hero-pointer-x", `${pointerX}px`);
      hero.style.setProperty("--hero-pointer-y", `${pointerY}px`);
      pointerFrame = 0;
    });
  });

  hero.addEventListener("pointerleave", () => {
    hero.style.setProperty("--hero-pointer-x", "0px");
    hero.style.setProperty("--hero-pointer-y", "0px");
  });
}

const revealEverything = () => {
  revealItems.forEach((item) => item.classList.add("is-visible"));
};

if (reducedMotion.matches) {
  video?.pause();
  revealEverything();
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

const sceneItems = document.querySelectorAll(".product, .export-band, .platform-band");

if (reducedMotion.matches) {
  sceneItems.forEach((item) => item.classList.add("is-scene-visible"));
} else {
  const sceneObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-scene-visible");
        sceneObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.18 },
  );

  sceneItems.forEach((item) => sceneObserver.observe(item));
}

reducedMotion.addEventListener("change", (event) => {
  if (!event.matches) return;
  video?.pause();
  revealEverything();
  sceneItems.forEach((item) => item.classList.add("is-scene-visible"));
});

const workflowRows = [...document.querySelectorAll(".workflow-list li")];

if (workflowRows.length) {
  workflowRows[0].classList.add("is-active");

  if (!reducedMotion.matches) {
    const workflowObserver = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries.find((entry) => entry.isIntersecting);
        if (!activeEntry) return;

        workflowRows.forEach((row) => row.classList.toggle("is-active", row === activeEntry.target));
      },
      { rootMargin: "-32% 0px -52% 0px", threshold: 0 },
    );

    workflowRows.forEach((row) => workflowObserver.observe(row));
  }
}

const navLinks = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
const navTargets = navLinks
  .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
  .filter(({ target }) => target);

if (navTargets.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      const activeEntry = entries.find((entry) => entry.isIntersecting);
      if (!activeEntry) return;

      navTargets.forEach(({ link, target }) => {
        link.classList.toggle("is-current", target === activeEntry.target);
      });
    },
    { rootMargin: "-18% 0px -70% 0px", threshold: 0 },
  );

  navTargets.forEach(({ target }) => navObserver.observe(target));
}

const demo = document.querySelector("[data-autocut]");

if (demo) {
  const status = demo.querySelector("[data-autocut-status]");
  const action = demo.querySelector("[data-autocut-action]");
  const button = demo.querySelector("[data-autocut-button]");
  let demoTimers = [];

  const copy = (name) => demo.dataset[name] || "";

  const clearDemoTimers = () => {
    demoTimers.forEach((timer) => window.clearTimeout(timer));
    demoTimers = [];
  };

  const setDemoState = (state) => {
    demo.dataset.state = state;
    status.textContent = copy(`status${state[0].toUpperCase()}${state.slice(1)}`);
  };

  const finishDemo = () => {
    setDemoState("ready");
    demo.setAttribute("aria-busy", "false");
    demo.classList.remove("is-processing");
    demo.classList.add("is-complete");
    action.textContent = copy("actionReplay");
    button.disabled = false;
  };

  const startDemo = () => {
    clearDemoTimers();
    demo.classList.remove("is-complete");
    demo.classList.add("is-processing");
    demo.setAttribute("aria-busy", "true");
    setDemoState("analysing");
    action.textContent = copy("actionWorking");
    button.disabled = true;

    if (reducedMotion.matches) {
      finishDemo();
      return;
    }

    demoTimers.push(window.setTimeout(() => setDemoState("detecting"), 650));
    demoTimers.push(window.setTimeout(() => setDemoState("grouping"), 1450));
    demoTimers.push(window.setTimeout(finishDemo, 2450));
  };

  const resetDemo = () => {
    clearDemoTimers();
    demo.dataset.state = "idle";
    demo.setAttribute("aria-busy", "false");
    demo.classList.remove("is-processing", "is-complete");
    status.textContent = copy("statusIdle");
    action.textContent = copy("actionRun");
    button.disabled = false;
  };

  resetDemo();

  button.addEventListener("click", () => {
    if (button.disabled) return;

    if (demo.dataset.state === "ready") {
      resetDemo();
      demoTimers.push(window.setTimeout(startDemo, 90));
      return;
    }

    startDemo();
  });

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches && demo.classList.contains("is-processing")) {
      clearDemoTimers();
      finishDemo();
    }
  });
}

if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.querySelectorAll("[data-tilt]").forEach((target) => {
    target.addEventListener("pointermove", (event) => {
      if (reducedMotion.matches) return;

      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      target.style.setProperty("--tilt-x", `${(0.5 - y) * 3.5}deg`);
      target.style.setProperty("--tilt-y", `${(x - 0.5) * 4.5}deg`);
    });

    target.addEventListener("pointerleave", () => {
      target.style.setProperty("--tilt-x", "0deg");
      target.style.setProperty("--tilt-y", "0deg");
    });
  });
}
