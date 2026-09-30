// Mr.digitailor — הטמעת סוכן הצ'אט בדף נחיתה.
// שימוש: <script src="https://agency.mr-digitailor.co.il/embed-chat.js" defer></script>
(function () {
  if (window.__mrdChat) return; window.__mrdChat = true;
  var BASE = "https://agency.mr-digitailor.co.il";
  var open = false;

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "פתח שיחה");
  btn.innerHTML = "💬";
  btn.style.cssText = "position:fixed;bottom:22px;left:22px;z-index:99998;width:60px;height:60px;border-radius:50%;border:none;background:#eed89b;color:#0a0908;font-size:26px;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.45);transition:transform .15s";
  btn.onmouseenter = function () { btn.style.transform = "scale(1.08)"; };
  btn.onmouseleave = function () { btn.style.transform = "none"; };

  var frame = document.createElement("iframe");
  frame.src = BASE + "/start";
  frame.title = "שיחה עם Mr.digitailor";
  frame.style.cssText = "position:fixed;bottom:94px;left:22px;z-index:99999;width:390px;height:620px;max-height:calc(100vh - 120px);border:1px solid rgba(238,216,155,.35);border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.55);display:none;background:#0a0908";

  function toggle() {
    open = !open;
    if (window.innerWidth < 480 && open) {
      frame.style.width = "calc(100vw - 16px)"; frame.style.left = "8px"; frame.style.bottom = "8px"; frame.style.maxHeight = "calc(100vh - 16px)"; frame.style.height = "calc(100vh - 16px)";
      btn.style.display = "none";
      var close = document.createElement("button");
      close.id = "__mrdClose"; close.innerHTML = "✕";
      close.style.cssText = "position:fixed;top:16px;left:16px;z-index:100000;width:38px;height:38px;border-radius:50%;border:none;background:#eed89b;color:#0a0908;font-size:17px;cursor:pointer";
      close.onclick = function () { toggle(); close.remove(); btn.style.display = "block"; };
      document.body.appendChild(close);
    }
    frame.style.display = open ? "block" : "none";
    btn.innerHTML = open ? "✕" : "💬";
  }
  btn.onclick = toggle;

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(btn); document.body.appendChild(frame);
  });
  if (document.readyState !== "loading") { document.body.appendChild(btn); document.body.appendChild(frame); }
})();
