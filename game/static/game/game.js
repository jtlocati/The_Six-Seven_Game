/* 67 Game — MediaPipe Hands hand-tracking counter */
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

  // Crossing detection:
  //   We compute an average wrist Y for each hand (mirror-flipped to match display).
  //   "state" is which hand is higher: "AB" (hand0 higher) or "BA" (hand1 higher).
  //   Each confirmed flip (with hysteresis) = +1.
  let crossState = null; // null | "AB" | "BA"
  const HYSTERESIS = 0.06; // fraction of video height difference required to flip

  function setStatus(msg) { statusEl.textContent = msg; }
  function updateCount(n) { count = n; countEl.textContent = n; }
  function updateTimer(t) { timeLeft = t; timerEl.textContent = t; }

  function resizeCanvas() {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
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
    const handedness = results.multiHandedness || [];

    // Draw landmarks
    for (let i = 0; i < landmarksList.length; i++) {
      const lm = landmarksList[i];
      if (window.drawConnectors && window.HAND_CONNECTIONS) {
        drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#8ab4ff", lineWidth: 3 });
      }
      if (window.drawLandmarks) {
        drawLandmarks(ctx, lm, { color: "#9ef59e", lineWidth: 1, radius: 3 });
      }
    }
    ctx.restore();

    // Counting logic — needs exactly 2 hands
    if (landmarksList.length === 2 && running) {
      // Use average Y of a few landmarks for stability
      const avgY = (lm) => {
        const idx = [0, 5, 9, 13, 17]; // wrist + knuckles
        let s = 0;
        for (const i of idx) s += lm[i].y;
        return s / idx.length;
      };
      // Sort hands by handedness label so hand ordering is stable
      const tagged = landmarksList.map((lm, i) => ({
        lm,
        label: (handedness[i] && handedness[i].label) || `H${i}`,
      }));
      tagged.sort((a, b) => a.label.localeCompare(b.label));
      const yA = avgY(tagged[0].lm);
      const yB = avgY(tagged[1].lm);
      const diff = yB - yA; // positive means A higher (smaller y)

      let newState = crossState;
      if (diff > HYSTERESIS) newState = "AB"; // A is clearly higher
      else if (diff < -HYSTERESIS) newState = "BA";

      if (newState && newState !== crossState) {
        if (crossState !== null) {
          updateCount(count + 1);
        }
        crossState = newState;
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
    crossState = null;
    updateTimer(cfg.duration);
    running = true;
    startBtn.disabled = true;
    setStatus("GO! Cross your hands over the line!");
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
    crossState = null;
    submitted = false;
    modal.classList.add("hidden");
    setStatus("Ready — press Start");
    startBtn.disabled = false;
  }

  startBtn.addEventListener("click", startGame);
  resetBtn.addEventListener("click", resetGame);

  initCamera();
})();
