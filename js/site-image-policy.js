/* R77 shared passive media policy.
   Suppresses casual image/video context menus and dragging, not direct downloads.
   Avoids altering gallery layout, intentional crops, native keyboard navigation or playback. */
(() => {
  "use strict";
  const contentMedia = target => {
    if (!(target instanceof Element)) return null;
    const node = target.closest("img, video");
    return node && (node.tagName === "VIDEO" || node.closest("main, .photo-gallery, .project-accordion, .engineering-projects, .field-image"))
      ? node : null;
  };
  document.addEventListener("contextmenu", event => {
    if (contentMedia(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("dragstart", event => {
    if (contentMedia(event.target)) event.preventDefault();
  }, true);

  const configure = video => {
    video.setAttribute("controlsList", "nodownload noremoteplayback");
    video.setAttribute("disablePictureInPicture", "");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("draggable", "false");
  };
  const refresh = () => document.querySelectorAll("video").forEach(configure);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, {once:true});
  } else refresh();
  // Project sections can create video nodes dynamically.
  const startObserver = () => {
    if (!document.body) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("video")) configure(node);
          node.querySelectorAll("video").forEach(configure);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",startObserver,{once:true});
  } else startObserver();
})();
