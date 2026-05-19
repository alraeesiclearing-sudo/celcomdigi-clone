// ===== HERO CAROUSEL =====
(function() {
  const track = document.getElementById('heroTrack');
  const dots = document.querySelectorAll('.dot');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (!track) return;

  let current = 0;
  const slides = track.querySelectorAll('.hero-slide');
  const total = slides.length;

  function goTo(index) {
    current = (index + total) % total;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dots.forEach(function(d, i) { d.classList.toggle('active', i === current); });
  }

  if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); });
  dots.forEach(function(dot, i) { dot.addEventListener('click', function() { goTo(i); }); });

  setInterval(function() { goTo(current + 1); }, 5000);
})();

// ===== PLANS TABS =====
(function() {
  var tabs = document.querySelectorAll('.plan-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
    });
  });
})();

// ===== SELF SERVICE TABS =====
(function() {
  var tabs = document.querySelectorAll('.ss-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
    });
  });
})();

// ===== HAMBURGER MENU =====
(function() {
  var btn = document.getElementById('hamburgerBtn');
  var menu = document.querySelector('.nav-menu');
  if (!btn || !menu) return;
  var open = false;
  btn.addEventListener('click', function() {
    open = !open;
    if (open) {
      menu.style.display = 'flex';
      menu.style.flexDirection = 'column';
      menu.style.position = 'absolute';
      menu.style.top = '64px';
      menu.style.left = '0';
      menu.style.right = '0';
      menu.style.background = '#0a1f5c';
      menu.style.padding = '16px';
      menu.style.zIndex = '999';
    } else {
      menu.style.display = '';
    }
  });
})();
