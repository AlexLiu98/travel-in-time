(() => {
  "use strict";
  const accountMode = new URLSearchParams(window.location.search).get("mode") === "account";
  const homeHref = accountMode ? "./index.html?mode=account" : "./index.html";
  ["backLink", "brandLink"].forEach(id => {
    const link = document.getElementById(id);
    if (link) link.href = homeHref;
  });
  const flags = document.getElementById("flagsGame");
  const train = document.getElementById("trainGame");
  if (flags) flags.href = accountMode ? "./flags.html?v=14&mode=account" : "./flags.html?v=14";
  if (train) train.href = accountMode ? "./train.html?v=3&mode=account" : "./train.html?v=3";
})();
