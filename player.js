(() => {
  const stage = document.querySelector('.stage');
  // Keep every Figma coordinate and asset dimension intact at any screen size.
  const fitArtboard = () => stage.style.setProperty('--artboard-scale', stage.getBoundingClientRect().width / 2560);
  new ResizeObserver(fitArtboard).observe(stage);
  fitArtboard();

  const slot = document.querySelector('.screen-slot');
  new ResizeObserver(() => {
    stage.style.width = Math.max(0, Math.min(slot.clientWidth, slot.clientHeight * 1.6)) + 'px';
  }).observe(slot);

  const idle = document.querySelector('#idle');
  const feedback = document.querySelector('#feedback');
  const cat = document.querySelector('.cat');
  const resume = document.querySelector('.resume');
  const status = document.querySelector('#status');
  const modes = document.querySelectorAll('[data-mode]');

  const messages = {
    loading: '正在加载视频…',
    idle: '待机循环中 · 点一下猫咪',
    waiting: '等当前这轮待机播完…',
    feedback: '正在播放触摸反馈…',
    returning: '正在回到待机…',
    blocked: '浏览器需要点一下才能开始播放',
    error: '视频加载失败。请刷新页面重试。',
  };

  let phase = 'loading';
  let mode = 'immediate';
  let visible = idle;
  let retry = null;
  let playbackVersion = 0;

  function setPhase(next) {
    phase = next;
    stage.dataset.phase = next;
    status.textContent = messages[next];
    cat.setAttribute('aria-disabled', String(next !== 'idle'));
    resume.hidden = next !== 'blocked';
  }

  async function play(clip, onPlaying) {
    const version = ++playbackVersion;
    try {
      await clip.play();
    } catch (error) {
      if (version !== playbackVersion) return;
      if (error.name === 'NotAllowedError') {
        retry = () => play(clip, onPlaying);
        setPhase('blocked');
      } else {
        setPhase('error');
      }
      return;
    }

    if (version !== playbackVersion) return;
    if (visible !== clip) {
      visible.pause();
      visible = clip;
      stage.dataset.clip = clip.id;
    }
    onPlaying();
  }

  function startIdle() {
    idle.loop = true;
    idle.currentTime = 0;
    return play(idle, () => setPhase('idle'));
  }

  function startFeedback() {
    setPhase('feedback');
    feedback.currentTime = 0;
    return play(feedback, () => setPhase('feedback'));
  }

  function resetPlayback() {
    ++playbackVersion;
    retry = null;
    idle.pause();
    feedback.pause();
    feedback.currentTime = 0;
    visible = idle;
    stage.dataset.clip = 'idle';
    setPhase('loading');
    return startIdle();
  }

  for (const button of modes) {
    button.addEventListener('click', () => {
      stopSound();
      mode = button.dataset.mode;
      for (const choice of modes) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }
      void resetPlayback();
    });
  }

  cat.addEventListener('click', () => {
    touchSound();
    if (phase !== 'idle') return;
    if (mode === 'immediate') {
      void startFeedback();
      return;
    }

    setPhase('waiting');
    // Removing loop lets the currently playing pass finish at its actual end.
    idle.loop = false;
    if (idle.ended) {
      void startFeedback();
    } else if (idle.paused) {
      void play(idle, () => setPhase('waiting'));
    }
  });

  idle.addEventListener('ended', () => {
    if (phase === 'waiting') void startFeedback();
  });

  feedback.addEventListener('ended', () => {
    if (phase !== 'feedback') return;
    setPhase('returning');
    void startIdle();
  });

  resume.addEventListener('click', () => {
    if (!retry) return;
    const attempt = retry;
    retry = null;
    setPhase('loading');
    void attempt();
  });

  // One short, softly decaying tap, generated locally without audio downloads.
  let audioContext;
  let soundNodes = [];
  let soundVersion = 0;
  function stopSound() {
    ++soundVersion;
    for (const node of soundNodes) { try { node.stop(); } catch {} }
    soundNodes = [];
  }
  async function touchSound() {
    stopSound();
    const version = soundVersion;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      await audioContext.resume();
      if (version !== soundVersion) return;
      {
        const t = audioContext.currentTime;
        const tone = audioContext.createOscillator();
        const gain = audioContext.createGain();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(420, t);
        tone.frequency.exponentialRampToValueAtTime(180, t + .035);
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(.18, t + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .04);
        tone.connect(gain).connect(audioContext.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(t); tone.stop(t + .045);
        soundNodes.push(tone);
      }
    } catch { /* Playback remains usable when audio is unavailable. */ }
  }

  const presentation = document.querySelector('#presentation');
  let presenting = false;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function presentationState(on) {
    presenting = on;
    document.documentElement.classList.toggle('presenting', on);
    presentation.textContent = on ? '退出演示' : '进入演示';
    presentation.setAttribute('aria-pressed', String(on));
  }
  presentation.addEventListener('click', async () => {
    if (presenting) {
      presentationState(false);
      stopSound();
      if (fullscreenElement()) {
        try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {}
      }
      return;
    }
    presentationState(true);
    void resetPlayback();
    const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    try {
      if (!request) throw new Error('Fullscreen unavailable');
      await request.call(document.documentElement);
    } catch { /* Keep the page locked when browser fullscreen is unavailable. */ }
  });
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(name, () => {
      if (!fullscreenElement()) { presentationState(false); stopSound(); }
    });
  }
  // Prevent page gestures; retain the browser/system's own escape controls.
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  for (const name of ['gesturestart', 'gesturechange', 'touchmove']) {
    document.addEventListener(name, e => { if (presenting) e.preventDefault(); }, { passive: false });
  }
  document.addEventListener('wheel', e => { if (presenting) e.preventDefault(); }, { passive: false });

  for (const clip of [idle, feedback]) {
    // Set the property as well as the HTML attribute for programmatic playback.
    clip.muted = true;
    clip.addEventListener('error', () => setPhase('error'));
  }
  void startIdle();
})();
