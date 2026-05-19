/* ============================================================
   CelcomDigi Clone — main.js
   ============================================================ */

// ── Hero Carousel ──────────────────────────────────────────
(function () {
  var track = document.getElementById('heroTrack');
  if (!track) return;

  var slides = track.querySelectorAll('.hero-slide');
  var dots   = document.querySelectorAll('#heroDots .dot');
  var current = 0;
  var timer;

  function goTo(n) {
    current = (n + slides.length) % slides.length;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dots.forEach(function(d, i) { d.classList.toggle('active', i === current); });
  }

  dots.forEach(function(d, i) {
    d.addEventListener('click', function() { clearInterval(timer); goTo(i); startTimer(); });
  });

  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.addEventListener('click', function() { clearInterval(timer); goTo(current - 1); startTimer(); });
  if (nextBtn) nextBtn.addEventListener('click', function() { clearInterval(timer); goTo(current + 1); startTimer(); });

  // Touch swipe
  var startX = 0;
  track.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { clearInterval(timer); goTo(current + (dx < 0 ? 1 : -1)); startTimer(); }
  });

  function startTimer() { timer = setInterval(function() { goTo(current + 1); }, 5000); }
  goTo(0);
  startTimer();
})();

// ── Footer Accordion ───────────────────────────────────────
function toggleFooterAcc(btn) {
  var body = btn.nextElementSibling;
  var isOpen = body.classList.contains('open');
  document.querySelectorAll('.footer-acc-body').forEach(function(b) { b.classList.remove('open'); });
  if (!isOpen) body.classList.add('open');
}

// ── Hamburger Menu ─────────────────────────────────────────
(function () {
  var btn  = document.getElementById('hamburgerBtn');
  var menu = document.getElementById('navMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', function() { menu.classList.toggle('mobile-open'); });
  document.addEventListener('click', function(e) {
    if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('mobile-open');
  });
})();
