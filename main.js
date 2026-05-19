// ===== HERO CAROUSEL =====
(function() {
  const track = document.getElementById('heroTrack');
  const dots = document.querySelectorAll('.hero-dot');
  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  if (!track) return;

  const slides = track.querySelectorAll('.hero-slide');
  let current = 0;
  let autoTimer;

  function getVisibleCount() {
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 768) return 2;
    return 1;
  }

  function goTo(index) {
    const count = slides.length;
    if (index < 0) index = count - 1;
    if (index >= count) index = 0;
    current = index;
    const slideWidth = slides[0].offsetWidth + 12; // gap
    track.style.transform = `translateX(-${current * slideWidth}px)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { goTo(current - 1); resetAuto(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { goTo(current + 1); resetAuto(); });
  dots.forEach(d => {
    d.addEventListener('click', () => { goTo(parseInt(d.dataset.index)); resetAuto(); });
  });

  function resetAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1), 4000);
  }
  resetAuto();

  // Touch swipe
  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { goTo(diff > 0 ? current + 1 : current - 1); resetAuto(); }
  }, { passive: true });
})();

// ===== PROMO CAROUSEL =====
(function() {
  const track = document.getElementById('promoTrack');
  const dots = document.querySelectorAll('.promo-dot');
  if (!track) return;

  const slides = track.querySelectorAll('.promo-slide');
  let current = 0;

  function goTo(index) {
    const count = slides.length;
    if (index < 0) index = count - 1;
    if (index >= count) index = 0;
    current = index;
    const slideWidth = slides[0].offsetWidth;
    track.style.transform = `translateX(-${current * slideWidth}px)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  dots.forEach(d => {
    d.addEventListener('click', () => goTo(parseInt(d.dataset.index)));
  });

  // Touch swipe
  let startX = 0;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? current + 1 : current - 1);
  }, { passive: true });

  // Auto
  setInterval(() => goTo(current + 1), 5000);
})();

// ===== HELP TABS =====
(function() {
  const tabBtns = document.querySelectorAll('.help-tab-btn');
  const tabContents = document.querySelectorAll('.help-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.getElementById('tab-' + target);
      if (content) content.classList.add('active');
    });
  });
})();

// ===== MOBILE MENU =====
(function() {
  const menuBtn = document.getElementById('menuBtn');
  if (!menuBtn) return;
  menuBtn.addEventListener('click', () => {
    // Simple toggle - could expand to show a drawer
    console.log('Menu clicked');
  });
})();
