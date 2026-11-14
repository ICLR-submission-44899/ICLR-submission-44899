(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  // The top bar is pinned; publish its height so jumps to a section and the sticky
  // section labels clear it, also when its links wrap on narrow screens.
  var topBar = document.querySelector('.top');
  function syncTopHeight() { root.style.setProperty('--top-h', topBar.offsetHeight + 'px'); }
  if (topBar) {
    syncTopHeight();
    if (window.ResizeObserver) new ResizeObserver(syncTopHeight).observe(topBar);
    else window.addEventListener('resize', syncTopHeight);
  }

  // Theme toggle: the schedule picks the theme, a manual
  // choice holds until the next scheduled switch.
  var btn = document.getElementById('theme-toggle');
  var theme = window.pageTheme;
  function current() { return root.getAttribute('data-theme'); }
  function sync() {
    var mode = current();
    var action = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    var o = theme.override();
    var until = o && new Date(o.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    btn.dataset.mode = mode;
    btn.setAttribute('aria-label', action);
    btn.title = action + (o ? ' (your choice holds until ' + until + ')' : ' (automatic: dark ' + theme.night + ', your local time)');
  }
  function setTheme(next, how, origin) {
    if (current() === next) { sync(); return; }
    var swap = function () { root.setAttribute('data-theme', next); sync(); };
    if (reduceMotion.matches || document.hidden) { swap(); return; }
    if (!document.startViewTransition) {
      root.classList.add('theme-fade');
      swap();
      setTimeout(function () { root.classList.remove('theme-fade'); }, 700);
      return;
    }
    root.setAttribute('data-theme-anim', how === 'auto' ? (next === 'dark' ? 'dusk' : 'dawn') : 'reveal');
    var t = document.startViewTransition(swap);
    if (how !== 'auto') {
      t.ready.then(function () {
        var x = origin.x, y = origin.y;
        var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.style.setProperty('--reveal-x', x + 'px');
        root.style.setProperty('--reveal-y', y + 'px');
        root.animate(
          { '--reveal': ['0px', (r + 220) + 'px'] },
          { duration: 1000, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards', pseudoElement: '::view-transition-new(root)' }
        );
      }, function () {});
    }
    t.finished.then(clear, clear);
    function clear() { root.removeAttribute('data-theme-anim'); }
  }
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    var box = btn.getBoundingClientRect();
    theme.choose(next);
    setTheme(next, 'manual', { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  });
  function tick() { setTheme(theme.desired(), 'auto'); }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('storage', tick);
  sync();

  // Rollouts play only while mostly on screen. Reduced motion shows controls instead.
  var loops = Array.prototype.slice.call(document.querySelectorAll('video[data-autoplay]'));
  if (reduceMotion.matches) {
    loops.forEach(function (v) { v.controls = true; v.preload = 'metadata'; });
  } else if ('IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.intersectionRatio >= 0.5) { if (e.target.preload === 'none') e.target.preload = 'auto'; play(e.target); }
        else e.target.pause();
      });
    }, { threshold: [0, 0.5] });
    loops.forEach(function (v) { seen.observe(v); });
  } else {
    loops.forEach(play);
  }

  // Carousels: one slide per view; buttons step through, the count follows scrolling.
  Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), function (box) {
    var track = box.querySelector('.carousel-track');
    var slides = track.children;
    var count = box.querySelector('.carousel-count');
    var prev = box.querySelector('[data-step="-1"]'), next = box.querySelector('[data-step="1"]');
    function stride() { return slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth; }
    function index() { return Math.round(track.scrollLeft / Math.max(1, stride())); }
    function update() {
      var i = index();
      count.textContent = (i + 1) + ' / ' + slides.length;
      prev.disabled = i <= 0;
      next.disabled = i >= slides.length - 1;
    }
    function go(step) {
      var i = Math.min(slides.length - 1, Math.max(0, index() + step));
      track.scrollTo({ left: i * stride(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });
    var pending;
    track.addEventListener('scroll', function () { cancelAnimationFrame(pending); pending = requestAnimationFrame(update); }, { passive: true });
    track.addEventListener('scrollend', update);
    window.addEventListener('resize', update);
    update();
  });

  // Highlight the top-bar link of the section being read.
  var links = Array.prototype.slice.call(document.querySelectorAll('.top nav a[href^="#"]'));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function spy() {
    var line = (topBar ? topBar.offsetHeight : 0) + window.innerHeight * 0.3, k = -1;
    targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) k = i; });
    links.forEach(function (a, i) {
      if (i === k) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', spy, { passive: true });
  window.addEventListener('resize', spy);
  spy();
})();
