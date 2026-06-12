// viz · analytics — lightweight Firebase Analytics shared by every page.
//
// Uses Firebase Hosting's reserved URLs (/__/firebase/...), so there is no
// config to hardcode: the SDK and the project config are served by Hosting
// itself, and the whole thing silently no-ops when the site is opened
// locally (file:// or a non-Firebase server).
//
// Every page gets automatic page_view tracking. Pages can also log custom
// events through the global helper, which is always safe to call:
//     vizTrack("event_name", { any: "params" });
(function () {
  window.vizTrack = function () {};
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  var V = "10.14.1";
  function load(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  load("/__/firebase/" + V + "/firebase-app-compat.js")
    .then(function () { return load("/__/firebase/" + V + "/firebase-analytics-compat.js"); })
    .then(function () { return load("/__/firebase/init.js"); })
    .then(function () {
      // Throws if Google Analytics isn't linked to the Firebase project.
      var analytics = firebase.analytics();
      window.vizTrack = function (name, params) {
        try { analytics.logEvent(name, params || {}); } catch (e) {}
      };
    })
    .catch(function () { /* not on Firebase Hosting or GA not enabled — stay silent */ });
})();
