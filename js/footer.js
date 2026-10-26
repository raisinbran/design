/* One shared footer source, with a harmless fallback if loaded from file:// */
(function () {
  function mount() {
    const target = document.getElementById('site-footer-2026');
    if (!target) return;
    fetch('footer-2026.html')
      .then(response => { if (!response.ok) throw new Error('Footer request failed'); return response.text(); })
      .then(html => { target.innerHTML = html; })
      .catch(error => { console.warn('Shared footer could not be loaded. Use the local HTTP preview.', error); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
