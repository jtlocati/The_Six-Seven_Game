/* 67 Game — MediaPipe Hands index-fingertip counter
 *
 * Same tracking style as the Hand-Pong script: we read ONLY the index
 * fingertip (landmark 8) for each detected hand. Hands are distinguished by
 * which half of the frame their fingertip is in (left half = "L", right half
 * = "R") rather than trusting MediaPipe's handedness label. Each fingertip is
 * tracked independently and a "67" = one full down-and-back-up cycle across
 * the horizontal center line (hysteresis prevents jitter).
 *
 * Only needs ONE fingertip visible to keep counting, so tracking doesn't cut
 * out when the other hand leaves the frame.
 */
(() => {
  const cfg = window.GAME_CONFIG;

  const video = document.getElementById("video");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const countEl = document.getElementById("count");
  const timerEl = document.getElementById("timer");
  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const modal = document.getElementById("resultModal");
  const finalCount = document.getElementById("finalCount");
  const rankLine = document.getElementById("rankLine");

  // Game state
  let count = 0;
  let running = false;
  let timeLeft = cfg.duration;
  let timerInterval = null;
  let submitted = false;

  // Per-hand crossing state, keyed by "L" or "R" (which half of the frame the
  // index fingertip is currently in). Each hand tracks whether its fingertip
  // is currently "above" or "below" the line, and what side the current cycle
  // started on so a full round-trip = 1 count.
  //   side:   "above" | "below" | null   (current stable position)
  //   origin: "above" | "below" | null   (side the current cycle started on)
  const handState = new Map();
  const INDEX_TIP = 8; // MediaPipe landmark index for the index fingertip
  const HYSTERESIS = 0.04; // fraction of frame height past midline needed to flip

  function setStatus(msg) { statusEl.textContent = msg; }
  function updateCount(n) { count = n; countEl.textContent = n; }
  function updateTimer(t) { timeLeft = t; timerEl.textContent = t; }

  function resizeCanvas() {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  }

  function getHandState(label) {
    if (!handState.has(label)) {
      handState.set(label, { side: null, origin: null });
    }
    return handState.get(label);
  }

  function resetHandStates() {
    handState.clear();
  }

  function onResults(results) {
    if (canvas.width !== (video.videoWidth || 0)) resizeCanvas();

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror horizontally to match the mirrored video
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Draw horizontal center line
    const midY = canvas.height / 2;
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(canvas.width, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    const landmarksList = results.multiHandLandmarks || [];

    // Pick only the index fingertip (landmark 8) from each detected hand and
    // label it "L" or "R" by which half of the frame it's in.
    const tips = [];
    for (const lm of landmarksList) {
      const tip = lm[INDEX_TIP];
      const label = tip.x < 0.5 ? "L" : "R";
      tips.push({ x: tip.x, y: tip.y, label });
    }

    // Draw a dim skeleton and a bold marker on the index fingertip only
    for (let i = 0; i < landmarksList.length; i++) {
      const lm = landmarksList[i];
      if (window.drawConnectors && window.HAND_CONNECTIONS) {
        drawConnectors(ctx, lm, HAND_CONNECTIONS, {
          color: "rgba(138, 180, 255, 0.35)",
          lineWidth: 2,
        });
      }
      const tip = lm[INDEX_TIP];
      const px = tip.x * canvas.width;
      const py = tip.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#9ef59e";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
    }
    ctx.restore();

    // Counting logic — per fingertip, independently
    if (running && tips.length > 0) {
      // If both tips ended up in the same half of the frame, keep them
      // distinct by forcing one to the other side so we don't merge them.
      if (tips.length === 2 && tips[0].label === tips[1].label) {
        if (tips[0].x < tips[1].x) {
          tips[0].label = "L"; tips[1].label = "R";
        } else {
          tips[0].label = "R"; tips[1].label = "L";
        }
      }

      const seen = new Set();
      for (const t of tips) {
        seen.add(t.label);
        const offset = t.y - 0.5; // negative = above line, positive = below

        const state = getHandState(t.label);
        let newSide = state.side;
        if (offset > HYSTERESIS) newSide = "below";
        else if (offset < -HYSTERESIS) newSide = "above";

        if (newSide && newSide !== state.side) {
          if (state.origin === null) {
            state.origin = newSide; // first confirmed side — start a cycle here
          } else if (newSide === state.origin) {
            updateCount(count + 1); // returned to origin => full "67"
          }
          state.side = newSide;
        } else if (state.side === null && newSide) {
          state.side = newSide;
          state.origin = newSide;
        }
      }

      // Drop state for any side that wasn't seen this frame so it re-enters
      // cleanly rather than triggering a phantom crossing.
      for (const label of Array.from(handState.keys())) {
        if (!seen.has(label)) handState.delete(label);
      }
    }

    // Draw big count overlay
    if (running) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(canvas.width - 140, 10, 130, 60);
      ctx.fillStyle = "#9ef59e";
      ctx.font = "bold 40px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(count), canvas.width - 20, 55);
      ctx.restore();
    }
  }

  // Initialize MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onResults);

  let camera = null;
  async function initCamera() {
    try {
      setStatus("Requesting camera…");
      camera = new Camera(video, {
        onFrame: async () => {
          await hands.send({ image: video });
        },
        width: 640,
        height: 480,
      });
      await camera.start();
      setStatus("Ready — press Start");
      startBtn.disabled = false;
    } catch (err) {
      console.error(err);
      setStatus("Camera error: " + (err.message || err));
    }
  }

  function startGame() {
    submitted = false;
    updateCount(0);
    resetHandStates();
    updateTimer(cfg.duration);
    running = true;
    startBtn.disabled = true;
    setStatus("GO! Bounce your index fingertips across the line!");
    timerInterval = setInterval(() => {
      updateTimer(timeLeft - 1);
      if (timeLeft <= 0) endGame();
    }, 1000);
  }

  async function endGame() {
    running = false;
    clearInterval(timerInterval);
    setStatus("Done!");
    startBtn.disabled = false;
    finalCount.textContent = count;
    rankLine.textContent = "Submitting score…";
    modal.classList.remove("hidden");

    if (!submitted) {
      submitted = true;
      try {
        const resp = await fetch(cfg.submitUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": cfg.csrfToken,
          },
          body: JSON.stringify({
            name: cfg.playerName,
            count: count,
            duration: cfg.duration,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          rankLine.textContent = `Rank #${data.rank} for ${data.duration}s runs.`;
        } else {
          rankLine.textContent = "Could not submit score.";
        }
      } catch (e) {
        rankLine.textContent = "Network error submitting score.";
      }
    }
  }

  function resetGame() {
    running = false;
    clearInterval(timerInterval);
    updateCount(0);
    updateTimer(cfg.duration);
    resetHandStates();
    submitted = false;
    modal.classList.add("hidden");
    setStatus("Ready — press Start");
    startBtn.disabled = false;
  }

  startBtn.addEventListener("click", startGame);
  resetBtn.addEventListener("click", resetGame);

  initCamera();
})();
