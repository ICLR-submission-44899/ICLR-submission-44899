/* Recorded transitions and their nearest neighbors; retrieval was computed offline.
   The three clips step through the same 17 retained frames together. */
(function () {
  var explorer = document.getElementById('neighbor-explorer');
  var tabs = document.getElementById('neighbor-tabs');
  var figs = Array.prototype.slice.call(document.querySelectorAll('#neighbor-trio figure'));
  var videos = figs.map(function (f) { return f.querySelector('video'); });
  var playBtn = document.getElementById('neighbor-play');
  var scrub = document.getElementById('neighbor-scrub');
  var stepOut = document.getElementById('neighbor-step');
  var metrics = document.getElementById('bottleneck-metrics');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var FPS = 6, LAST = 16;
  var NAMES = { dino: 'DINOv3', wan: 'WAN2.1-VAE' };
  // Tab labels for the selected examples; any other query falls back to its instruction.
  var SHORT = {
    KITCHEN_SCENE7_open_the_microwave: '(a) Microwave',
    KITCHEN_SCENE8_put_the_right_moka_pot_on_the_stove: '(b) Moka pot',
    LIVING_ROOM_SCENE1_pick_up_the_tomato_sauce_and_put_it_in_the_basket: '(c) Tomato sauce',
    STUDY_SCENE3_pick_up_the_red_mug_and_place_it_to_the_right_of_the_caddy: '(d) Red mug'
  };
  var data, backbone = 'dino', index = 0, frame = 0, clock = 0;
  var ready = false, wantPlay = !reduceMotion.matches, inView = false, generation = 0, urls = [];

  function el(tag, text) { var n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  function sentence(s) { s = s.trim(); return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.'); }

  function setFrame(f) {
    frame = Math.max(0, Math.min(LAST, Math.round(f)));
    videos.forEach(function (v) {
      if (v.readyState >= 1 && v.duration) v.currentTime = Math.min(frame / FPS + 0.001, v.duration - 0.001);
    });
    scrub.value = String(frame);
    stepOut.textContent = 'Step ' + frame + ' / ' + LAST;
  }
  function updateButton() {
    playBtn.classList.toggle('paused', !wantPlay);
    playBtn.setAttribute('aria-label', wantPlay ? 'Pause' : 'Play');
  }
  function loop(t) {
    var running = ready && wantPlay && inView && !document.hidden;
    if (running && !videos.some(function (v) { return v.seeking; }) && t - clock >= 1000 / FPS) {
      clock = t;
      setFrame((frame + 1) % (LAST + 1));
    }
    requestAnimationFrame(loop);
  }

  function renderMetrics() {
    if (!metrics) return;
    var n = data.summary[backbone + '_input'], p = data.summary[backbone + '_prism_L_mu_full_grid'];
    var spec = [
      ['action_chunk_rmse', 'Action error ↓', 'normalized action RMSE', function (v) { return v.toFixed(4); }, ''],
      ['eef_displacement_vector_error_m', 'End-effector error ↓', 'displacement-vector difference', function (v) { return (v * 100).toFixed(2); }, ' cm'],
      ['gripper_sign_agreement', 'Gripper agreement ↑', 'matching open / close commands', function (v) { return (v * 100).toFixed(2); }, '%']
    ];
    metrics.replaceChildren.apply(metrics, spec.map(function (s) {
      var item = el('div'), dt = el('dt'), dd = el('dd');
      dt.append(s[3](p[s[0]]) + s[4] + ' ', el('small', 'vs ' + s[3](n[s[0]])));
      dd.append(el('b', s[1]), ', ' + s[2] + ', PRISM vs native');
      item.append(dt, dd);
      return item;
    }));
  }

  function renderQuery() {
    var q = data.queries[index];
    var triplet = [q, q.retrieval[backbone + '_input'][0], q.retrieval[backbone + '_prism_L_mu_full_grid'][0]];
    var mine = ++generation;
    ready = false;
    playBtn.disabled = true;
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
    var old = explorer.querySelector('.load-error');
    if (old) old.remove();
    figs[1].querySelector('.who').firstChild.nodeValue = NAMES[backbone] + ' native';
    figs[2].querySelector('.who').firstChild.nodeValue = NAMES[backbone] + ' PRISM';
    tabs.querySelectorAll('[role="tab"]').forEach(function (b) {
      b.setAttribute('aria-selected', String(Number(b.dataset.index) === index));
    });
    var loads = triplet.map(function (entry, k) {
      var v = videos[k];
      v.poster = entry.poster;
      v.setAttribute('aria-label', figs[k].querySelector('.who').textContent + ': ' + entry.instruction);
      figs[k].querySelector('figcaption').textContent = sentence(entry.instruction);
      // Blob URLs allow exact seeking even on servers without HTTP Range support.
      return fetch(entry.video).then(function (r) {
        if (!r.ok) throw new Error('Could not load ' + entry.video);
        return r.blob();
      }).then(function (blob) {
        if (mine !== generation) return;
        var url = URL.createObjectURL(blob);
        urls.push(url);
        return new Promise(function (resolve, reject) {
          v.addEventListener('loadeddata', resolve, { once: true });
          v.addEventListener('error', function () { reject(new Error('Could not decode ' + entry.video)); }, { once: true });
          v.src = url;
        });
      });
    });
    Promise.all(loads).then(function () {
      if (mine !== generation) return;
      ready = true;
      playBtn.disabled = false;
      setFrame(0);
      clock = performance.now();
    }, function (error) {
      if (mine !== generation) return;
      var p = el('p', 'These clips could not be loaded. Refresh the page to try again.');
      p.className = 'load-error';
      document.getElementById('neighbor-trio').after(p);
      console.error(error);
    });
  }

  function select(i) {
    if (i === index && ready) return;
    index = i;
    renderQuery();
  }

  fetch(explorer.dataset.source || 'bottleneck-data.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('Could not load bottleneck-data.json');
    return r.json();
  }).then(function (json) {
    data = json;
    tabs.replaceChildren.apply(tabs, data.queries.map(function (q, i) {
      var b = el('button', SHORT[q.task] || sentence(q.instruction).slice(0, -1));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.index = String(i);
      b.title = sentence(q.instruction);
      return b;
    }));
    tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('[role="tab"]');
      if (b) select(Number(b.dataset.index));
    });
    tabs.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      var all = Array.prototype.slice.call(tabs.querySelectorAll('[role="tab"]'));
      var i = all.indexOf(document.activeElement);
      if (i < 0) return;
      var j = (i + (ev.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
      all[j].focus();
      select(j);
    });
    document.querySelectorAll('[data-analysis-backbone]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (backbone === b.dataset.analysisBackbone) return;
        backbone = b.dataset.analysisBackbone;
        document.querySelectorAll('[data-analysis-backbone]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        renderMetrics();
        renderQuery();
      });
    });
    playBtn.addEventListener('click', function () {
      wantPlay = !wantPlay;
      updateButton();
      clock = performance.now();
    });
    scrub.addEventListener('input', function () {
      wantPlay = false;
      updateButton();
      setFrame(Number(scrub.value));
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; }, { threshold: 0.35 })
        .observe(document.getElementById('neighbor-trio'));
    } else {
      inView = true;
    }
    updateButton();
    renderMetrics();
    renderQuery();
    requestAnimationFrame(loop);
  }).catch(function (error) {
    var p = el('p', 'The comparison could not be loaded. Refresh the page to try again.');
    p.className = 'load-error';
    explorer.replaceChildren(p);
    console.error(error);
  }).finally(function () {
    explorer.setAttribute('aria-busy', 'false');
  });
})();
