(() => {
  const stage = document.querySelector('.stage');
  // Keep every Figma coordinate and asset dimension intact at any screen size.
  const fitArtboard = () => stage.style.setProperty('--artboard-scale', stage.getBoundingClientRect().width / 2560);
  new ResizeObserver(fitArtboard).observe(stage);
  fitArtboard();

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

  function setPhase(next) {
    phase = next;
    stage.dataset.phase = next;
    status.textContent = messages[next];
    cat.setAttribute('aria-disabled', String(next !== 'idle'));
    resume.hidden = next !== 'blocked';
  }

  async function play(clip, onPlaying) {
    try {
      await clip.play();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        retry = () => play(clip, onPlaying);
        setPhase('blocked');
      } else {
        setPhase('error');
      }
      return;
    }

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

  for (const button of modes) {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      for (const choice of modes) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }
    });
  }

  cat.addEventListener('click', () => {
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

  for (const clip of [idle, feedback]) {
    // Set the property as well as the HTML attribute for programmatic playback.
    clip.muted = true;
    clip.addEventListener('error', () => setPhase('error'));
  }
  void startIdle();
})();
