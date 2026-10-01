(function () {
  'use strict';
  var base = document.body.getAttribute('data-base') || '';
  var KEY = 'dnq-learned-v1';

  // ---------- хранилище (устойчиво к запрету localStorage) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* игнор */ } }
  var learned = new Set(load(KEY, []));
  function persist() { save(KEY, Array.from(learned)); refreshProgress(); }

  // ---------- тема ----------
  var toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* игнор */ }
  });

  // ---------- прогресс ----------
  function refreshProgress() {
    var cats = window.SITE_CATS || [];
    var totalAll = 0, doneAll = 0;
    cats.forEach(function (c) {
      var done = 0;
      learned.forEach(function (id) { if (id.indexOf(c.slug + '/') === 0) done++; });
      totalAll += c.total; doneAll += done;
      var pct = c.total ? Math.round(done / c.total * 100) : 0;
      document.querySelectorAll('[data-progress="' + c.slug + '"]').forEach(function (el) { el.style.width = pct + '%'; });
      document.querySelectorAll('[data-progress-text="' + c.slug + '"]').forEach(function (el) {
        el.textContent = el.hasAttribute('data-short') ? done + '/' + c.total : 'Изучено ' + done + ' из ' + c.total;
      });
    });
    var pctAll = totalAll ? Math.round(doneAll / totalAll * 100) : 0;
    document.querySelectorAll('[data-progress="*"]').forEach(function (el) { el.style.width = pctAll + '%'; });
    document.querySelectorAll('[data-total-progress]').forEach(function (el) { el.textContent = pctAll + '%'; });
    var lvTotals = {}, lvDone = {};
    (window.SITE_INDEX || []).forEach(function (x) {
      lvTotals[x.lv] = (lvTotals[x.lv] || 0) + 1;
      if (learned.has(x.id)) lvDone[x.lv] = (lvDone[x.lv] || 0) + 1;
    });
    Object.keys(lvTotals).forEach(function (lv) {
      var t = lvTotals[lv], d = lvDone[lv] || 0, pct = Math.round(d / t * 100);
      document.querySelectorAll('[data-lv-progress="' + lv + '"]').forEach(function (el) { el.style.width = pct + '%'; });
      document.querySelectorAll('[data-lv-progress-text="' + lv + '"]').forEach(function (el) {
        el.textContent = el.hasAttribute('data-short') ? d + '/' + t : 'Изучено ' + d + ' из ' + t;
      });
    });
    document.querySelectorAll('[data-qid]').forEach(function (el) {
      el.classList.toggle('is-done', learned.has(el.getAttribute('data-qid')));
    });
    document.querySelectorAll('[data-learn]').forEach(function (btn) {
      var on = learned.has(btn.getAttribute('data-learn'));
      btn.classList.toggle('on', on);
      btn.querySelector('span').textContent = on ? 'Изучено' : 'Отметить как изученное';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-learn]');
    if (!btn) return;
    var id = btn.getAttribute('data-learn');
    if (learned.has(id)) learned.delete(id); else learned.add(id);
    persist();
  });
  var reset = document.getElementById('reset-progress');
  if (reset) reset.addEventListener('click', function () {
    if (confirm('Сбросить отметки об изученных вопросах?')) { learned.clear(); persist(); }
  });

  // последний открытый вопрос → «Продолжить изучение»
  var art = document.querySelector('.article[data-qid]');
  if (art) save('dnq-last', { u: location.pathname.split('/').slice(-3).join('/'), t: document.querySelector('.article h1').textContent });
  var cont = document.getElementById('continue-link');
  var last = load('dnq-last', null);
  if (cont && last && last.u) { cont.href = base + last.u; cont.textContent = 'Продолжить: ' + last.t.slice(0, 48) + (last.t.length > 48 ? '…' : '') + ' →'; cont.hidden = false; }

  // ---------- фильтр по уровню на странице раздела ----------
  var lvBtns = Array.prototype.slice.call(document.querySelectorAll('[data-lv-filter]'));
  function applyLevel(lv) {
    lvBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-lv-filter') === lv); b.setAttribute('aria-pressed', b.getAttribute('data-lv-filter') === lv ? 'true' : 'false'); });
    document.querySelectorAll('.q-list > li[data-level]').forEach(function (li) { li.hidden = lv !== 'all' && li.getAttribute('data-level') !== lv; });
  }
  if (lvBtns.length) {
    lvBtns.forEach(function (b) { b.addEventListener('click', function () { var lv = b.getAttribute('data-lv-filter'); save('dnq-level', lv); applyLevel(lv); }); });
    var savedLv = load('dnq-level', 'all');
    applyLevel(lvBtns.some(function (b) { return b.getAttribute('data-lv-filter') === savedLv; }) ? savedLv : 'all');
  }

  // ---------- копирование кода ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copy');
    if (!b) return;
    var code = b.closest('.code').querySelector('code').innerText;
    var done = function () { b.textContent = 'Скопировано'; setTimeout(function () { b.textContent = 'Копировать'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, function () {});
  });

  // ---------- боковая панель на мобильных ----------
  var sideBtn = document.querySelector('.side-toggle');
  var sidebar = document.getElementById('sidebar');
  if (sideBtn && sidebar) {
    sideBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = sidebar.classList.toggle('open');
      sideBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) { sidebar.classList.remove('open'); sideBtn.setAttribute('aria-expanded', 'false'); }
    });
    var act = sidebar.querySelector('.active');
    if (act && window.innerWidth > 960) act.scrollIntoView({ block: 'center' });
  }

  // ---------- оглавление: подсветка текущего раздела ----------
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var heads = tocLinks.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); }).filter(Boolean);
    var current = null;
    var io = new IntersectionObserver(function () {
      var top = null;
      heads.forEach(function (h) { if (h.getBoundingClientRect().top < 140) top = h; });
      top = top || heads[0];
      if (top !== current) {
        current = top;
        tocLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + top.id); });
      }
    }, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
    heads.forEach(function (h) { io.observe(h); });
  }

  // ---------- поиск ----------
  var input = document.getElementById('search');
  var box = document.getElementById('search-results');
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
  function strip(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }
  function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function highlight(text, terms) {
    var out = escHtml(text);
    terms.forEach(function (t) {
      if (t.length < 2) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  var prepared = null;
  function prepare() {
    if (prepared) return prepared;
    prepared = (window.SITE_INDEX || []).map(function (x) {
      var plain = strip(x.a).replace(/\s+/g, ' ').trim();
      return { x: x, plain: plain, t: norm(x.t), rest: norm(x.k + ' ' + x.h + ' ' + x.c), a: norm(plain) };
    });
    return prepared;
  }
  function search(q) {
    var terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return prepare().map(function (p) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], s = 0;
        if (p.t.indexOf(t) >= 0) s += 10;
        if (p.rest.indexOf(t) >= 0) s += 4;
        if (p.a.indexOf(t) >= 0) s += 2;
        if (!s) return null;
        score += s;
      }
      return { p: p, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 12);
  }
  var sel = -1;
  function render(q) {
    var res = search(q);
    var terms = norm(q).split(/\s+/).filter(Boolean);
    sel = -1;
    if (!q.trim()) { box.hidden = true; return; }
    box.innerHTML = res.length ? res.map(function (r) {
      var x = r.p.x;
      return '<a class="sr-item" href="' + base + x.u + '"><div class="sr-cat" style="--c:' + x.col + '">' + escHtml(x.c) + '</div>' +
        '<div class="sr-t">' + highlight(x.t, terms) + '</div><div class="sr-s">' + highlight(r.p.plain.slice(0, 220), terms) + '</div></a>';
    }).join('') : '<div class="sr-empty">Ничего не найдено. Попробуйте другое слово, например «GC», «индекс», «JWT».</div>';
    box.hidden = false;
  }
  if (input && box) {
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { if (input.value) render(input.value); });
    input.addEventListener('keydown', function (e) {
      var items = box.querySelectorAll('.sr-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (it, i) { it.classList.toggle('sel', i === sel); });
        items[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        var target = items[sel >= 0 ? sel : 0];
        if (target) location.href = target.href;
      } else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.hidden = true; });
  }
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/' && input) { e.preventDefault(); input.focus(); }
    if (document.body.classList.contains('page-question')) {
      if (e.key === 'ArrowLeft') { var p = document.querySelector('.pn.prev'); if (p && p.href) location.href = p.href; }
      if (e.key === 'ArrowRight') { var n = document.querySelector('.pn.next'); if (n && n.href) location.href = n.href; }
    }
  });

  // ---------- тренажёр ----------
  function initTrainer() {
    var cardQ = document.getElementById('card-q');
    if (!cardQ) return;
    var all = window.SITE_INDEX || [];
    var cardA = document.getElementById('card-a'), cardCat = document.getElementById('card-cat');
    var btnShow = document.getElementById('btn-show'), btnKnow = document.getElementById('btn-know'), btnAgain = document.getElementById('btn-again');
    var link = document.getElementById('card-link');
    var elLeft = document.getElementById('tr-left'), elKnown = document.getElementById('tr-known'), elAgain = document.getElementById('tr-again');
    var boxes = Array.prototype.slice.call(document.querySelectorAll('.tr-cats input'));
    var onlyNew = document.getElementById('tr-only-new');
    var lvBoxes = Array.prototype.slice.call(document.querySelectorAll('.tr-levels input'));
    var savedLvs = load('dnq-trainer-levels', null);
    if (savedLvs) lvBoxes.forEach(function (b) { b.checked = savedLvs.indexOf(b.value) >= 0; });
    var saved = load('dnq-trainer-cats', null);
    if (saved) boxes.forEach(function (b) { b.checked = saved.indexOf(b.value) >= 0; });
    var deck = [], cur = null, known = 0, again = 0;
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function build() {
      var cats = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      var lvs = lvBoxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      save('dnq-trainer-cats', cats); save('dnq-trainer-levels', lvs);
      deck = shuffle(all.filter(function (x) { return cats.indexOf(x.cs) >= 0 && lvs.indexOf(x.lv) >= 0 && !(onlyNew.checked && learned.has(x.id)); }));
      known = 0; again = 0; next();
    }
    function stats() { elLeft.textContent = deck.length + (cur ? 1 : 0); elKnown.textContent = known; elAgain.textContent = again; }
    function next() {
      cur = deck.shift() || null;
      cardA.hidden = true; btnShow.hidden = false; btnKnow.hidden = true; btnAgain.hidden = true;
      if (!cur) {
        cardCat.textContent = ''; cardQ.textContent = 'Колода пройдена! 🎉'; link.hidden = true;
        btnShow.hidden = true; stats(); return;
      }
      cardCat.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + cur.col + '"></span>' + escHtml(cur.c);
      cardQ.textContent = cur.t; cardA.innerHTML = cur.a; link.href = base + cur.u; link.hidden = false; stats();
    }
    function show() { if (!cur) return; cardA.hidden = false; btnShow.hidden = true; btnKnow.hidden = false; btnAgain.hidden = false; }
    function know() { if (!cur) return; known++; learned.add(cur.id); persist(); next(); }
    function repeat() { if (!cur) return; again++; deck.splice(Math.min(deck.length, 3 + Math.floor(Math.random() * 4)), 0, cur); cur = null; next(); }
    btnShow.addEventListener('click', show); btnKnow.addEventListener('click', know); btnAgain.addEventListener('click', repeat);
    boxes.concat(lvBoxes, onlyNew).forEach(function (b) { b.addEventListener('change', build); });
    document.getElementById('tr-restart').addEventListener('click', build);
    document.addEventListener('keydown', function (e) {
      if ((e.target.tagName || '').toLowerCase() === 'input') return;
      if (e.key === ' ' && !btnShow.hidden) { e.preventDefault(); show(); }
      else if (e.key === '1' && !btnKnow.hidden) know();
      else if (e.key === '2' && !btnAgain.hidden) repeat();
    });
    build();
  }

  refreshProgress();
  initTrainer();
})();
