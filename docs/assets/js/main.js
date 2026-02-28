/* ============================================================
   Good Vibes — Documentation Site JavaScript
   Mobile nav, code copy buttons, smooth scroll
   ============================================================ */

(function () {
  'use strict';

  // --- Mobile Nav Toggle ---
  const toggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      const expanded = navLinks.classList.contains('open');
      toggle.setAttribute('aria-expanded', expanded);
    });

    // Close nav when clicking a link
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Close nav when clicking outside
    document.addEventListener('click', function (e) {
      if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- Copy Buttons for Code Blocks ---
  document.querySelectorAll('.code-block__copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var codeEl = btn.closest('.code-block').querySelector('code');
      if (!codeEl) return;

      var text = codeEl.textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }).catch(function () {
        // Fallback for older browsers
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          btn.textContent = 'Failed';
          setTimeout(function () {
            btn.textContent = 'Copy';
          }, 2000);
        }
        document.body.removeChild(textarea);
      });
    });
  });

  // --- Smooth Scroll for Anchor Links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        var offset = 80; // Account for fixed nav
        var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

  // --- Active Nav Highlighting ---
  var currentPath = window.location.pathname;
  document.querySelectorAll('.nav__links a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;

    // Normalize both paths
    var linkPath = href.replace(/\/$/, '').replace(/\/index\.html$/, '');
    var pagePath = currentPath.replace(/\/$/, '').replace(/\/index\.html$/, '');

    if (linkPath === pagePath ||
        (href.endsWith('index.html') && (pagePath.endsWith('/docs') || pagePath === '')) ||
        currentPath.endsWith(href)) {
      link.classList.add('active');
    }
  });

  // --- Scroll Spy for TOC (if present) ---
  var tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length > 0) {
    var sections = [];
    tocLinks.forEach(function (link) {
      var id = link.getAttribute('href');
      if (id && id.startsWith('#')) {
        var el = document.querySelector(id);
        if (el) sections.push({ link: link, el: el });
      }
    });

    if (sections.length > 0) {
      var onScroll = function () {
        var scrollPos = window.scrollY + 120;
        var current = sections[0];

        for (var i = 0; i < sections.length; i++) {
          if (sections[i].el.offsetTop <= scrollPos) {
            current = sections[i];
          }
        }

        tocLinks.forEach(function (l) { l.classList.remove('active'); });
        if (current) current.link.classList.add('active');
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // --- Syntax Highlighting for JSON ---
  document.querySelectorAll('.code-block code').forEach(function (block) {
    if (block.closest('.code-block').dataset.lang === 'json' ||
        block.classList.contains('json')) {
      highlightJSON(block);
    }
  });

  function highlightJSON(el) {
    var text = el.textContent;
    // Replace HTML entities first
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Highlight JSON parts
    html = html
      // Keys
      .replace(/"([^"]+)"(\s*:)/g, '<span class="key">"$1"</span>$2')
      // String values
      .replace(/:\s*"([^"]*)"/g, ': <span class="string">"$1"</span>')
      // String values in arrays
      .replace(/\[\s*"([^"]*)"/g, '[ <span class="string">"$1"</span>')
      .replace(/,\s*"([^"]*)"(\s*[,\]])/g, ', <span class="string">"$1"</span>$2')
      // Numbers
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="number">$1</span>')
      // Booleans
      .replace(/:\s*(true|false)/g, ': <span class="boolean">$1</span>')
      // Null
      .replace(/:\s*(null)/g, ': <span class="null">$1</span>')
      // Comments
      .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');

    el.innerHTML = html;
  }
})();
