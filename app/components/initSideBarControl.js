export default function initSidebarControl() {

  const cleanups = [];

  function addListener(el, event, handler) {
    if (!el) return;

    el.addEventListener(event, handler);

    cleanups.push(() => {
      el.removeEventListener(event, handler);
    });
  }

  const toggleBtn = document.getElementById('toggle_btn');
  const mobileBtn = document.getElementById('mobile_btn');
  const sidebarEl = document.getElementById('sidebar');
  const dashboardContainer = document.querySelector('.dashboard-container');

  // Prevent duplicate overlays
  let overlay = document.querySelector('.sidebar-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
  }

  let lastOpenedSubmenu = null;

  // =========================
  // Slide Helpers
  // =========================

  function slideDown(el) {

    if (!el) return;

    el.style.display = 'block';
    el.style.overflow = 'hidden';
    el.style.height = '0px';

    const height = el.scrollHeight + 'px';

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.3s ease';
      el.style.height = height;
    });

    function handler(e) {
      if (e && e.target !== el) return; // a nested submenu's transition bubbling up
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';

      el.removeEventListener('transitionend', handler);
    }

    el.addEventListener('transitionend', handler);
  }

  function slideUp(el) {

    if (!el) return;

    el.style.overflow = 'hidden';
    el.style.height = el.scrollHeight + 'px';

    requestAnimationFrame(() => {
      el.style.transition = 'height 0.3s ease';
      el.style.height = '0px';
    });

    function handler(e) {
      if (e && e.target !== el) return; // a nested submenu's transition bubbling up
      el.style.display = 'none';
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';

      el.removeEventListener('transitionend', handler);
    }

    el.addEventListener('transitionend', handler);
  }

  // =========================
  // Mini Sidebar Toggle
  // =========================

  addListener(toggleBtn, 'click', function (e) {

    e.preventDefault();

    if (!dashboardContainer) return;

    const isMini = dashboardContainer.classList.contains('mini-sidebar');

    dashboardContainer.classList.toggle('mini-sidebar');

    const submenus = document.querySelectorAll('.submenu.subdrop > ul');

    submenus.forEach((ul) => {

      if (isMini) {
        slideDown(ul);
      } else {
        slideUp(ul);
      }

    });

  });

  // =========================
  // Mobile Sidebar
  // =========================

  addListener(mobileBtn, 'click', function () {

    document.body.classList.add('slide-nav');

    if (!document.body.contains(overlay)) {
      document.body.appendChild(overlay);
    }

    overlay.style.display = 'block';

  });

  addListener(overlay, 'click', function () {

    document.body.classList.remove('slide-nav');

    overlay.style.display = 'none';

    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }

  });

  // =========================
  // Hover Expand Mini Sidebar
  // =========================

  addListener(sidebarEl, 'mouseenter', function () {

    if (!dashboardContainer) return;

    if (dashboardContainer.classList.contains('mini-sidebar')) {

      dashboardContainer.classList.add('expand-menu');

      if (lastOpenedSubmenu) {

        lastOpenedSubmenu.style.display = 'block';
        lastOpenedSubmenu.style.opacity = '0';

        requestAnimationFrame(() => {
          lastOpenedSubmenu.style.transition = 'opacity 0.2s ease';
          lastOpenedSubmenu.style.opacity = '1';
        });

      }

    }

  });

  addListener(sidebarEl, 'mouseleave', function () {

    if (!dashboardContainer) return;

    if (dashboardContainer.classList.contains('mini-sidebar')) {

      dashboardContainer.classList.remove('expand-menu');

      if (lastOpenedSubmenu) {
        lastOpenedSubmenu.style.display = 'none';
      }

    }

  });

  // =========================
  // Submenu Toggle
  // =========================

  const submenuItems = document.querySelectorAll('.submenu > a');

  // Close one submenu <li> and everything open inside it.
  function closeSub(li) {
    li.classList.remove('subdrop');
    const ul = li.querySelector(':scope > ul');
    if (ul && ul.style.display !== 'none') slideUp(ul);
    li.querySelectorAll('.submenu.subdrop').forEach((d) => {
      d.classList.remove('subdrop');
      const u = d.querySelector(':scope > ul');
      if (u) u.style.display = 'none';
    });
  }

  submenuItems.forEach((item) => {

    addListener(item, 'click', function (e) {

      e.preventDefault();

      const submenu = item.nextElementSibling;
      const parent = item.parentElement;

      if (!submenu || !parent) return;

      const isOpen = parent.classList.contains('subdrop');

      // The submenus this one lives inside (reports > orders > online ...) must stay open.
      const ancestors = [];
      let up = parent.parentElement ? parent.parentElement.closest('.submenu') : null;
      while (up) {
        ancestors.push(up);
        up = up.parentElement ? up.parentElement.closest('.submenu') : null;
      }

      // Close every other open submenu except this one and its ancestors (siblings and their children close).
      document.querySelectorAll('.submenu.subdrop').forEach((li) => {
        if (li === parent || ancestors.includes(li)) return;
        closeSub(li);
      });

      if (isOpen) {

        closeSub(parent);
        lastOpenedSubmenu = null;

      } else {

        parent.classList.add('subdrop');

        slideDown(submenu);

        lastOpenedSubmenu = submenu;

      }

    });

  });

  // =========================
  // User Dropdown
  // =========================

  const userDropdownTrigger = document.querySelector(
    '.nav-item.dropdown.has-arrow > a'
  );

  const userDropdownMenu = document.querySelector(
    '.nav-item.dropdown.has-arrow .dropdown-menu'
  );

  function closeAllDropdowns() {

    document.querySelectorAll('.nav-item.dropdown.has-arrow').forEach((el) => {

      el.classList.remove('show');

      const menu = el.querySelector('.dropdown-menu');

      if (menu) {
        menu.classList.remove('show');
      }

    });

  }

  addListener(userDropdownTrigger, 'click', function (e) {

    e.preventDefault();

    const parent = this.closest('.dropdown');

    if (!parent) return;

    const isOpen = parent.classList.contains('show');

    closeAllDropdowns();

    if (!isOpen) {

      parent.classList.add('show');

      userDropdownMenu?.classList.add('show');

    }

  });

  addListener(document, 'click', function (e) {

    if (
      userDropdownTrigger &&
      userDropdownMenu &&
      !userDropdownTrigger.contains(e.target) &&
      !userDropdownMenu.contains(e.target)
    ) {

      closeAllDropdowns();

    }

  });

  // =========================
  // CLEANUP
  // =========================

  return () => {

    cleanups.forEach((cleanup) => {
      cleanup();
    });

    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }

  };

}