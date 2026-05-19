// ===================== HERO CAROUSEL =====================
let currentSlide = 0;
const totalSlides = 2;

function goToSlide(index) {
  currentSlide = index;
  document.getElementById('heroTrack').style.transform = `translateX(-${currentSlide * 100}%)`;
  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', i === currentSlide);
  });
}

function nextSlide() {
  goToSlide((currentSlide + 1) % totalSlides);
}

function prevSlide() {
  goToSlide((currentSlide - 1 + totalSlides) % totalSlides);
}

// Auto-play carousel
setInterval(nextSlide, 5000);

// ===================== PLANS TABS =====================
function switchPlan(btn, id) {
  document.querySelectorAll('.plan-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.plans-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===================== HELP TABS =====================
function switchHelp(btn, id) {
  document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.help-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===================== MOBILE MENU =====================
document.getElementById('hamburger').addEventListener('click', function () {
  const navLinks = document.querySelector('.nav-links');
  navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
  navLinks.style.flexDirection = 'column';
  navLinks.style.position = 'absolute';
  navLinks.style.top = '60px';
  navLinks.style.left = '0';
  navLinks.style.right = '0';
  navLinks.style.background = '#0a1628';
  navLinks.style.padding = '16px';
  navLinks.style.zIndex = '999';
});

// ===================== STICKY HEADER SHADOW =====================
window.addEventListener('scroll', function () {
  const header = document.querySelector('.header');
  if (window.scrollY > 10) {
    header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
  } else {
    header.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
  }
});
