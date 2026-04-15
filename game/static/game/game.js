/* 67 Game — palm-center tracking with peak/trough cycle detection
 *
 * Chosen for the use case: a palm-up hand facing the camera, moving FAST up
 * and down.
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

  // Tracking config
  const PALM_POINTS = [0, 5, 9, 13, 17]; // wrist + 4 finger-MCP knuckles
  const SMOOTH = 0.55;        // low-pass for palm Y (0 = no smoothing, ~0.8 = very smooth)
  const MIN_AMPLITUDE = 0.05; // fraction of frame height that counts as a real reversal
  const MIN_INTERVAL_MS = 80; // min time between counted peaks/troughs (debounce)

  // Per-hand state. Keyed by "L" or "R" based on which half of the frame the
  const handState = new Map();

  function getHandState(label) {
    if (!handState.has(label)) {
      handState.set(label, {
        smoothY: null,
        candidateY: null,
        lastExtType: null,
        lastExtAt: 0,
      });
    }
    return handState.get(label);
  }
  function resetHandStates() { handState.clear(); }

  function setStatus(msg) { statusEl.textContent = msg; }
  function updateCount(n) { count = n; countEl.textContent = n; }
  function updateTimer(t) { timeLeft = t; timerEl.textContent = t; }

  function resizeCanvas() {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  }

  function palmCenter(lm) {
    let sx = 0, sy = 0;
    for (const i of PALM_POINTS) { sx += lm[i].x; sy += lm[i].y; }
    return { x: sx / PALM_POINTS.length, y: sy / PALM_POINTS.length };
  }

  function onResults(results) {
    if (canvas.width !== (video.videoWidth || 0)) resizeCanvas();

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror horizontally to match the mirrored video
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const landmarksList = results.multiHandLandmarks || [];

    // Compute palm centers and assign "L" or "R" by horizontal position
    const palms = [];
    for (const lm of landmarksList) {
      const c = palmCenter(lm);
      palms.push({ ...c, lm, label: c.x < 0.5 ? "L" : "R" });
    }
    // If both palms collapsed to the same half, split them by relative x
    if (palms.length === 2 && palms[0].label === palms[1].label) {
      if (palms[0].x < palms[1].x) { palms[0].label = "L"; palms[1].label = "R"; }
      else                         { palms[0].label = "R"; palms[1].label = "L"; }
    }

    // Draw dim skeleton for each hand + bold palm-center marker
    for (const p of palms) {
      if (window.drawConnectors && window.HAND_CONNECTIONS) {
        drawConnectors(ctx, p.lm, HAND_CONNECTIONS, {
          color: "rgba(138, 180, 255, 0.35)",
          lineWidth: 2,
        });
      }
      const px = p.x * canvas.width;
      const py = p.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#9ef59e";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
      // label
      ctx.save();
      ctx.scale(-1, 1); // un-mirror text
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.label, -px, py - 22);
      ctx.restore();
    }
    ctx.restore();

    // Counting — peak/trough detection on smoothed palm Y, per hand
    if (running && palms.length > 0) {
      const now = performance.now();
      const seen = new Set();
      for (const p of palms) {
        seen.add(p.label);
        const s = getHandState(p.label);

        // Low-pass filter Y
        s.smoothY = s.smoothY == null ? p.y : (1 - SMOOTH) * p.y + SMOOTH * s.smoothY;

        if (s.candidateY == null) {
          s.candidateY = s.smoothY;
          continue;
        }

        const huntingPeak = s.lastExtType !== "peak"; // default: hunt peak first

        if (huntingPeak) {
          // Track the smallest (highest) Y we've seen since last confirmation
          if (s.smoothY < s.candidateY) s.candidateY = s.smoothY;
          // candidate by at least MIN_AMPLITUDE
          if (s.smoothY - s.candidateY >= MIN_AMPLITUDE &&
              (now - s.lastExtAt) >= MIN_INTERVAL_MS) {
            if (s.lastExtType !== null) {
              updateCount(count + 1);
            }
            s.lastExtType = "peak";
            s.candidateY = s.smoothY; // start hunting a trough from here
            s.lastExtAt = now;
          }
        } else {

          if (s.smoothY > s.candidateY) s.candidateY = s.smoothY;
          if (s.candidateY - s.smoothY >= MIN_AMPLITUDE &&
              (now - s.lastExtAt) >= MIN_INTERVAL_MS) {
            updateCount(count + 1);
            s.lastExtType = "trough";
            s.candidateY = s.smoothY;
            s.lastExtAt = now;
          }
        }
      }

      // Drop stale hand state so re-entering doesn't trigger ghosts
      for (const label of Array.from(handState.keys())) {
        if (!seen.has(label)) handState.delete(label);
      }
    }

    // Big count overlay
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

  // Initialize MediaPipe Hands (low complexity + lenient thresholds for speed)
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.4, // a touch lenient to survive motion blur
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
    setStatus("GO! Palm up, bounce your hands up and down!");
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
