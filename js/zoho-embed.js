// Resizes the embedded Zoho enquiry form to fit its content.
// Zoho Forms posts "<formperma>|<height>" messages from inside the iframe; we only read the height.
(function () {
  var frame = document.getElementById("zoho-enquiry");
  if (!frame) return;
  window.addEventListener("message", function (event) {
    if (!/^https:\/\/forms\.zohopublic\.(sg|com)$/.test(event.origin)) return;
    if (typeof event.data !== "string") return;
    var parts = event.data.split("|");
    if (parts.length < 2) return;
    var height = parseInt(parts[1], 10);
    if (height > 200 && height < 10000) frame.style.height = (height + 15) + "px";
  });
})();
