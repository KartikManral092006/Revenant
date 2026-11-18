/* Mock-only behaviour. In the real app this is React state, not a script. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Glossary terms: tap or keyboard toggle (hover and focus are handled in CSS).
  document.querySelectorAll(".term").forEach(function (t) {
    t.setAttribute("aria-expanded", "false");
    t.addEventListener("click", function () {
      var open = t.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".term").forEach(function (o) { o.setAttribute("aria-expanded", "false"); });
      t.setAttribute("aria-expanded", open ? "false" : "true");
    });
    t.addEventListener("keydown", function (e) { if (e.key === "Escape") t.setAttribute("aria-expanded", "false"); });
  });

  // "Show technical IDs" toggle.
  document.querySelectorAll("[data-toggle-tech]").forEach(function (cb) {
    cb.addEventListener("change", function () {
      document.querySelectorAll(cb.getAttribute("data-toggle-tech")).forEach(function (el) {
        el.classList.toggle("show-tech", cb.checked);
      });
    });
  });

  // Scroll spy for the sticky stepper.
  var links = document.querySelectorAll(".stepper a");
  if (links.length && "IntersectionObserver" in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.removeAttribute("aria-current"); });
          map[en.target.id].setAttribute("aria-current", "step");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }

  // Fake "Run live". data-sim = "ok" | "err". Shows loading, then result text.
  function candles(n) {
    var h = "";
    for (var i = 0; i < 10; i++) h += '<span class="candle' + (i < n ? " lit" : "") + '"><i></i>' + (i < n ? "<b></b>" : "") + "</span>";
    return '<div class="candles" aria-hidden="true">' + h + "</div>";
  }
  document.querySelectorAll("[data-run]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var out = document.getElementById(btn.getAttribute("data-run"));
      var sim = btn.getAttribute("data-sim") || "ok";
      var steps = btn.getAttribute("data-progress") === "candles";
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = "Running…";
      out.className = "status";
      var n = 0;
      out.innerHTML = steps ? candles(0) + '<p class="small muted" style="margin-top:.4rem">Starting…</p>' : '<p class="muted">Working… this can take a few seconds.</p>';
      var tick = setInterval(function () {
        n++;
        if (steps) out.innerHTML = candles(n) + '<p class="small muted" style="margin-top:.4rem">Recording: ' + n * 100 + " / 1,000 inputs</p>";
      }, reduce ? 350 : 220);
      setTimeout(function () {
        clearInterval(tick);
        btn.disabled = false;
        btn.textContent = label;
        if (sim === "err") {
          out.className = "status err";
          out.innerHTML = btn.getAttribute("data-err");
        } else {
          out.className = "status okk";
          out.innerHTML = btn.getAttribute("data-ok");
        }
      }, 2400);
    });
  });
})();
