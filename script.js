// =====================================================
// СТРУКТУРА ИНСТРУМЕНТА
//
// synth1Bass   -> bassDistortion                              -> bassChannel   -\
// synth2Chords -> chordsChorus -> chordsDelay -> chordsPanner  -> chordsChannel -->  masterChannel -> compressor -> limiter -> выход
// drumKick/Clap/Hat -> drumsCrusher                           -> drumsChannel  -/
//
// Каждый канал ещё отправляет часть звука на общую шину реверба (send 'reverb')
// =====================================================

// ---------- 1. НАСТРОЙКИ ----------

const BPM = { minor: 112, major: 128 }

const WAVES = ['sawtooth', 'square', 'triangle', 'sine']
const WAVE_LABELS = {
  sawtooth: 'пила',
  square: 'квадрат',
  triangle: 'треугольник',
  sine: 'синус'
}
const MOOD_LABELS = { minor: 'минор', major: 'мажор' }

// базовая громкость каналов в dB (слайдер громкости работает поверх неё)
const BASE_VOLUME = { bass: -6, chords: -14, drums: -4 }

// ---------- 2. МУЗЫКА ----------
// Паттерн = строка из 16 шагов (1 такт шестнадцатыми)
// bass:   x = основной тон, o = октавой выше, . = пауза
// hits:   c = аккорд целиком, a = нота арпеджио
// hat:    x = тихо, X = акцент

const songs = {
  minor: {
    chords: [
      ['A3', 'C4', 'E4', 'G4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['D3', 'F3', 'A3', 'C4'],
      ['E3', 'G3', 'B3', 'D4']
    ],
    bassRoots: ['A1', 'F1', 'D2', 'E2'],
    bass: 'x..x..x.x..x.o..',
    hits: 'c.....c...c.....',
    kick: 'x...x...x...x...',
    clap: '........x.......',
    hat: '..x...x...x...X.'
  },
  major: {
    chords: [
      ['D4', 'F#4', 'A4', 'C#5'],
      ['A3', 'C#4', 'E4', 'A4'],
      ['B3', 'D4', 'F#4', 'A4'],
      ['G3', 'B3', 'D4', 'F#4']
    ],
    bassRoots: ['D2', 'A1', 'B1', 'G1'],
    bass: 'x.ox.ox.x.ox.oxo',
    hits: 'c.ac.ac.a.c.acaa',
    kick: 'x...x...x...x..x',
    clap: '....x.......x...',
    hat: 'x.X.x.X.x.X.xxX.'
  }
}

// ---------- 3. СОСТОЯНИЕ ----------

const state = {
  started: false,
  starting: false, // защита от двойного клика, пока звук запускается
  playing: false,
  mood: 'minor',
  bar: -1,
  arpIndex: 0,
  waves: { bass: 'sawtooth', chords: 'square' },
  mutes: { bass: false, chords: false, drums: false }
}

let audio = null // сюда соберутся все звуковые узлы после первого старта

// ---------- 4. ЗВУКОВОЙ ГРАФ ----------

function buildAudio() {
  // МАСТЕР
  const masterLimiter = new Tone.Limiter(-1).toDestination()
  const masterCompressor = new Tone.Compressor({
    threshold: -18,
    ratio: 3
  }).connect(masterLimiter)
  const masterChannel = new Tone.Channel({ volume: -4 }).connect(
    masterCompressor
  )
  const masterMeter = new Tone.Meter({ smoothing: 0.8 }) // пригодится для градиента
  masterChannel.connect(masterMeter)

  // ШИНА РЕВЕРБА (общая)
  const reverb = new Tone.Reverb({ decay: 4, wet: 1 })
  const reverbBus = new Tone.Channel({ volume: -6 }).receive('reverb')
  reverbBus.chain(reverb, masterChannel)

  // СИНТ 1 / БАС
  const bassChannel = new Tone.Channel({ volume: BASE_VOLUME.bass }).connect(
    masterChannel
  )
  const bassDistortion = new Tone.Distortion({
    distortion: 0.5,
    wet: 0.2
  }).connect(bassChannel)
  const synth1Bass = new Tone.MonoSynth({
    oscillator: { type: state.waves.bass },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.2 },
    filterEnvelope: {
      attack: 0.005,
      decay: 0.15,
      sustain: 0.3,
      baseFrequency: 120,
      octaves: 3
    }
  }).connect(bassDistortion)
  bassChannel.send('reverb', -30)

  // СИНТ 2 / АККОРДЫ
  const chordsChannel = new Tone.Channel({
    volume: BASE_VOLUME.chords
  }).connect(masterChannel)
  const chordsPanner = new Tone.AutoPanner({ frequency: 2, depth: 0.8, wet: 0 })
    .connect(chordsChannel)
    .start()
  const chordsDelay = new Tone.PingPongDelay({
    delayTime: '8n.',
    feedback: 0.3,
    wet: 0.25
  }).connect(chordsPanner)
  const chordsChorus = new Tone.Chorus({
    frequency: 1.5,
    delayTime: 3.5,
    depth: 0.7,
    wet: 0.5
  })
    .connect(chordsDelay)
    .start()
  const synth2Chords = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: state.waves.chords },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.15, release: 0.6 }
  }).connect(chordsChorus)
  chordsChannel.send('reverb', -10)

  // БАРАБАНЫ
  const drumsChannel = new Tone.Channel({ volume: BASE_VOLUME.drums }).connect(
    masterChannel
  )
  const drumsCrusher = new Tone.BitCrusher(4).connect(drumsChannel)
  drumsCrusher.wet.value = 0
  const drumKick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 }
  }).connect(drumsCrusher)
  const drumClap = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
    volume: -10
  }).connect(drumsCrusher)
  const drumHat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5000,
    octaves: 1.5,
    volume: -22
  }).connect(drumsCrusher)
  drumsChannel.send('reverb', -24)

  return {
    masterChannel,
    masterMeter,
    reverb,
    reverbBus,
    synth1Bass,
    bassDistortion,
    bassChannel,
    synth2Chords,
    chordsChorus,
    chordsDelay,
    chordsPanner,
    chordsChannel,
    drumKick,
    drumClap,
    drumHat,
    drumsCrusher,
    drumsChannel
  }
}

// ---------- 5. СЕКВЕНСОР ----------

function octaveUp(note) {
  return Tone.Frequency(note).transpose(12).toNote()
}

function playBass(symbol, root, time) {
  if (symbol === 'x') audio.synth1Bass.triggerAttackRelease(root, '16n', time)
  if (symbol === 'o')
    audio.synth1Bass.triggerAttackRelease(octaveUp(root), '16n', time)
}

function playChords(symbol, chord, time) {
  if (symbol === 'c')
    audio.synth2Chords.triggerAttackRelease(chord, '16n', time, 0.7)
  if (symbol === 'a') {
    const note = chord[state.arpIndex % chord.length]
    audio.synth2Chords.triggerAttackRelease(octaveUp(note), '32n', time, 0.5)
    state.arpIndex++
  }
}

function playDrums(song, step, time) {
  if (song.kick[step] === 'x')
    audio.drumKick.triggerAttackRelease('C1', '8n', time)
  if (song.clap[step] === 'x') audio.drumClap.triggerAttackRelease('16n', time)
  if (song.hat[step] === 'x')
    audio.drumHat.triggerAttackRelease(250, '32n', time, 0.4)
  if (song.hat[step] === 'X')
    audio.drumHat.triggerAttackRelease(250, '32n', time, 1)
}

function buildSequencer() {
  const steps = [...Array(16).keys()] // [0, 1, ... 15]

  new Tone.Sequence(
    (time, step) => {
      const song = songs[state.mood]
      if (step === 0) state.bar = (state.bar + 1) % song.chords.length

      playBass(song.bass[step], song.bassRoots[state.bar], time)
      playChords(song.hits[step], song.chords[state.bar], time)
      playDrums(song, step, time)

      Tone.getDraw().schedule(() => highlightStep(step), time)
    },
    steps,
    '16n'
  ).start(0)
}

// ---------- 6. УПРАВЛЕНИЕ ----------

const params = {
  bassVolume: (v) =>
    (audio.bassChannel.volume.value = BASE_VOLUME.bass + Tone.gainToDb(v)),
  bassDrive: (v) => (audio.bassDistortion.wet.value = v),
  chordsVolume: (v) =>
    (audio.chordsChannel.volume.value = BASE_VOLUME.chords + Tone.gainToDb(v)),
  chordsChorus: (v) => (audio.chordsChorus.wet.value = v),
  chordsDelay: (v) => (audio.chordsDelay.wet.value = v),
  chordsPan: (v) => (audio.chordsPanner.wet.value = v),
  drumsVolume: (v) =>
    (audio.drumsChannel.volume.value = BASE_VOLUME.drums + Tone.gainToDb(v)),
  drumsCrush: (v) => (audio.drumsCrusher.wet.value = v),
  reverb: (v) => (audio.reverbBus.volume.value = Tone.gainToDb(v))
}

function applyParam(input) {
  if (!audio) return
  params[input.dataset.param](parseFloat(input.value))
}

function applyWave(target) {
  if (!audio) return
  const type = state.waves[target]
  if (target === 'bass') audio.synth1Bass.oscillator.type = type
  if (target === 'chords') audio.synth2Chords.set({ oscillator: { type } })
}

function applyMute(target) {
  if (!audio) return
  audio[target + 'Channel'].mute = state.mutes[target]
}

function setMood(mood) {
  state.mood = mood
  document.body.dataset.mood = mood // CSS/градиент будут смотреть сюда
  document.getElementById('moodButton').textContent = MOOD_LABELS[mood]
  if (audio) Tone.getTransport().bpm.rampTo(BPM[mood], 2)
}

async function togglePlay() {
  const button = document.getElementById('startButton')
  const transport = Tone.getTransport()

  if (state.starting) return // уже запускаемся: игнорируем лишние клики

  if (!state.started) {
    state.starting = true
    button.textContent = '...'
    await Tone.start()
    audio = buildAudio()
    buildSequencer()
    transport.bpm.value = BPM[state.mood]
    document.querySelectorAll('[data-param]').forEach(applyParam)
    Object.keys(state.mutes).forEach(applyMute)
    await audio.reverb.ready
    state.started = true
    state.starting = false
  }

  if (state.playing) {
    transport.stop()
    state.bar = -1
    highlightStep(-1)
    button.textContent = 'старт'
  } else {
    transport.start('+0.1')
    button.textContent = 'стоп'
  }
  state.playing = !state.playing
}

// ---------- 7. ИНТЕРФЕЙС ----------

function renderSteps() {
  const container = document.getElementById('steps')
  for (let i = 0; i < 16; i++) {
    const step = document.createElement('div')
    step.className = 'Step'
    container.appendChild(step)
  }
}

function highlightStep(index) {
  document.querySelectorAll('.Step').forEach((el, i) => {
    el.classList.toggle('Step--active', i === index)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  renderSteps()

  document.getElementById('startButton').addEventListener('click', togglePlay)

  document.getElementById('moodButton').addEventListener('click', () => {
    setMood(state.mood === 'minor' ? 'major' : 'minor')
  })

  document.querySelectorAll('[data-param]').forEach((input) => {
    input.addEventListener('input', () => applyParam(input))
  })

  document.querySelectorAll('[data-wave]').forEach((button) => {
    const target = button.dataset.wave
    button.textContent = WAVE_LABELS[state.waves[target]]

    button.addEventListener('click', () => {
      const next = (WAVES.indexOf(state.waves[target]) + 1) % WAVES.length
      state.waves[target] = WAVES[next]
      button.textContent = WAVE_LABELS[WAVES[next]]
      applyWave(target)
    })
  })

  document.querySelectorAll('[data-mute]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.mute
      state.mutes[target] = !state.mutes[target]
      button.textContent = state.mutes[target] ? 'выкл' : 'вкл'
      button.classList.toggle('Button--off', state.mutes[target])
      applyMute(target)
    })
  })
})
