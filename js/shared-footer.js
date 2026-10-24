(function () {
  async function loadFooter() {
    const target = document.getElementById('site-footer');
    if (!target) return;
    try {
      const response = await fetch(new URL('footer.html', document.baseURI));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      target.innerHTML = await response.text();
      if (window.jQuery && jQuery.fn.tooltip) {
        jQuery(target).find('[data-toggle="tooltip"]').tooltip();
      }
    } catch (err) {
      console.warn('Shared footer unavailable:', err);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFooter);
  } else {
    loadFooter();
  }
})();
