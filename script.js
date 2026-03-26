/**
 * Flores CSS + pedido de namoro + confete de corações
 */
(function () {
  "use strict";

  const body = document.body;
  const flowers = document.querySelector(".flowers");
  const gameLayer = document.getElementById("gameLayer");
  const proposalOverlay = document.getElementById("proposalOverlay");
  const confettiLayer = document.getElementById("confettiLayer");
  const finalMessage = document.getElementById("finalMessage");

  let proposalShown = false;
  let confettiActive = false;

  function startFlowerAnimations() {
    body.classList.remove("not-loaded");
  }

  function showProposalUI() {
    if (proposalShown) return;
    proposalShown = true;
    proposalOverlay?.classList.remove("is-hidden");
    body.classList.add("proposal-reveal");
  }

  function spawnHeartConfetti() {
    if (!confettiLayer || confettiActive) return;
    confettiActive = true;
    const hearts = ["❤", "💕", "💖", "💗", "💘"];
    const count = 48;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "heart-bit";
      el.textContent = hearts[i % hearts.length];
      el.style.left = `${Math.random() * 100}%`;
      el.style.animationDuration = `${2.5 + Math.random() * 3}s`;
      el.style.animationDelay = `${Math.random() * 0.8}s`;
      confettiLayer.appendChild(el);
    }
    window.setTimeout(() => {
      confettiLayer.querySelectorAll(".heart-bit").forEach((n) => n.remove());
      confettiActive = false;
    }, 8000);
  }

  function onYes() {
    proposalOverlay?.classList.add("is-hidden");
    finalMessage?.classList.remove("is-hidden");
    spawnHeartConfetti();
  }

  window.addEventListener("agatha:gameComplete", () => {
    flowers?.classList.remove("flowers--hidden");
    startFlowerAnimations();
    gameLayer?.classList.add("is-fading-out");
    window.setTimeout(showProposalUI, 1100);
  });

  document.getElementById("btnYes1")?.addEventListener("click", onYes);
  document.getElementById("btnYes2")?.addEventListener("click", onYes);
})();
