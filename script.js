const header = document.querySelector("[data-header]");
const year = document.querySelector("[data-year]");
const video = document.querySelector(".hero-media");
const revealItems = document.querySelectorAll("[data-reveal]");

if (year) {
  year.textContent = new Date().getFullYear();
}

const syncHeader = () => {
  header?.classList.toggle("is-solid", window.scrollY > 20);
};

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  video?.pause();
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => observer.observe(item));
}
