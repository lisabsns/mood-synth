// настройки

const BPM = 100
const BARS_PER_WEATHER = 20
const WEATHER_ORDER = ['fog', 'drizzle', 'storm', 'clear']

const WAVES = {
  drops: ['sine', 'triangle', 'square', 'sawtooth'],
  clouds: ['sine', 'triangle', 'sawtooth']
}

const CLOUDS_WAVE_BOOST = { sine: 9, triangle: 0, sawtooth: 0 }
const WAVE_LABELS = {
  sawtooth: 'пила',
  square: 'квадрат',
  triangle: 'треугольник',
  sine: 'синус'
}

const BASE_VOLUME = { drops: -8, clouds: -13, wind: -7 }

// музыка

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11]
}

// шаг, ступень, длина
const THEME = [
  [[0, 5, 6], [6, 3, 2], [8, 4, 4], [12, 5, 4]],
  [[0, 3, 6], [6, 2, 2], [8, 1, 8]],
  [[0, 3, 4], [4, 5, 4], [8, 8, 6], [14, 7, 2]],
  [[0, 5, 6], [6, 4, 2], [8, 2, 8]]
]

const CHORDS = {
  Am7: ['A3', 'C4', 'E4', 'G4'],
  Am9: ['A3', 'C4', 'E4', 'B4'],
  Fmaj7: ['F3', 'A3', 'C4', 'E4'],
  Cmaj7: ['C4', 'E4', 'G4', 'B4'],
  G6: ['G3', 'B3', 'D4', 'E4'],
  Dm7: ['D3', 'F3', 'A3', 'C4'],
  E7: ['E3', 'G#3', 'B3', 'D4'],
  Aadd9: ['A3', 'C#4', 'E4', 'B4'],
  'F#m7': ['F#3', 'A3', 'C#4', 'E4'],
  Dmaj7: ['D3', 'A3', 'C#4', 'F#4']
}

const WEATHERS = {
  fog: {
    label: 'туман',
    mode: 'minor',
    chords: ['Am9', 'Am9', 'Fmaj7', 'Fmaj7'],
    themeFirstOnly: true,
    themeVelocity: 0.25,
    clouds: 'c...............',
    cloudsDuration: '2m',
    cloudsEnvelope: { attack: 0.9, decay: 1.2, sustain: 0.6, release: 2.5 },
    kick: 'x...............',
    clap: '................',
    hat: '........x.......'
  },
  drizzle: {
    label: 'морось',
    mode: 'minor',
    chords: ['Am7', 'Fmaj7', 'Cmaj7', 'G6'],
    themeFirstOnly: false,
    themeVelocity: 0.5,
    clouds: 'c.......c...a.a.',
    cloudsDuration: '4n',
    cloudsEnvelope: { attack: 0.08, decay: 0.6, sustain: 0.3, release: 1.4 },
    kick: 'x.......x.......',
    clap: '............x...',
    hat: '..x...x...x...x.'
  },
  storm: {
    label: 'гроза',
    mode: 'minor',
    chords: ['Am7', 'Fmaj7', 'Dm7', 'E7'],
    themeFirstOnly: false,
    themeVelocity: 0.5,
    clouds: 'c..c..c...c.c.c.',
    cloudsDuration: '16n',
    cloudsEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.35 },
    kick: 'x..x..x...x.x...',
    clap: '....x.......x...',
    hat: 'xxXxxxXxxxXxxxXx'
  },
  clear: {
    label: 'ясно',
    mode: 'major',
    chords: ['Aadd9', 'F#m7', 'Dmaj7', 'E7'],
    themeFirstOnly: false,
    themeVelocity: 0.5,
    clouds: 'c.....a.c...a.a.',
    cloudsDuration: '2n',
    cloudsEnvelope: { attack: 0.3, decay: 0.9, sustain: 0.5, release: 2 },
    kick: 'x.......x.......',
    clap: '........x.......',
    hat: '..x...x...x...X.'
  }
}

// состояние

const state = {
  starting: false,
  playing: false,
  dayComplete: false,
  dayEndTime: null,
  weather: 'fog',
  nextWeather: null,
  bar: -1,
  weatherBar: -1,
  arpIndex: 0,
  waves: { drops: 'sine', clouds: 'triangle' },
  mutes: { drops: false, clouds: false, wind: false }
}

let audio = null

// звук

function buildAudio() {
  // мастер
  const masterLimiter = new Tone.Limiter(-1).toDestination()
  const masterCompressor = new Tone.Compressor({
    threshold: -18,
    ratio: 3
  }).connect(masterLimiter)
  const masterChannel = new Tone.Channel({ volume: -4 }).connect(
    masterCompressor
  )
  const masterMeter = new Tone.Meter({ smoothing: 0.8 })
  masterChannel.connect(masterMeter)

  // капли
  const dropsChannel = new Tone.Channel({ volume: BASE_VOLUME.drops }).connect(
    masterChannel
  )
  const dropsEcho = new Tone.FeedbackDelay({
    delayTime: '8n.',
    feedback: 0.2,
    wet: 0.15
  }).connect(dropsChannel)
  const dropsStorm = new Tone.Distortion({ distortion: 0.4, wet: 0 }).connect(
    dropsEcho
  )
  const synth1Drops = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: softWave(state.waves.drops, 3) },
    envelope: { attack: 0.02, decay: 0.8, sustain: 0, release: 1.2 }
  }).connect(dropsStorm)
  synth1Drops.maxPolyphony = 16

  // облака
  const cloudsChannel = new Tone.Channel({
    volume: BASE_VOLUME.clouds
  }).connect(masterChannel)
  const cloudsEcho = new Tone.PingPongDelay({
    delayTime: '8n.',
    feedback: 0.3,
    wet: 0.3
  }).connect(cloudsChannel)
  const cloudsChorus = new Tone.Chorus({
    frequency: 1.5,
    delayTime: 3.5,
    depth: 0.7,
    wet: 0.5
  })
    .connect(cloudsEcho)
    .start()
  const synth2Clouds = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: softWave(state.waves.clouds, 5) },
    envelope: WEATHERS[state.weather].cloudsEnvelope
  }).connect(cloudsChorus)

  synth2Clouds.maxPolyphony = 24
  synth2Clouds.volume.value = CLOUDS_WAVE_BOOST[state.waves.clouds]

  // ветер
  const windChannel = new Tone.Channel({ volume: BASE_VOLUME.wind }).connect(
    masterChannel
  )
  const windNoise = new Tone.BitCrusher(4).connect(windChannel)
  windNoise.wet.value = 0
  const windKick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 }
  }).connect(windNoise)
  const windClap = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
    volume: -10
  }).connect(windNoise)
  const windHat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5000,
    octaves: 1.5,
    volume: -22
  }).connect(windNoise)

  return {
    masterChannel,
    masterCompressor,
    masterLimiter,
    masterMeter,
    synth1Drops,
    dropsStorm,
    dropsEcho,
    dropsChannel,
    synth2Clouds,
    cloudsChorus,
    cloudsEcho,
    cloudsChannel,
    windKick,
    windClap,
    windHat,
    windNoise,
    windChannel
  }
}

// секвенсор

function octaveUp(note, octaves = 1) {
  return Tone.Frequency(note).transpose(octaves * 12).toNote()
}

function degreeToNote(degree, mode) {
  const index = degree - 1
  const semitones = SCALES[mode][index % 7] + Math.floor(index / 7) * 12
  // октава меняется на до
  return Tone.Frequency('A4').transpose(semitones).toNote()
}

function playDrops(weather, chord, step, time) {
  const themeBar = THEME[state.bar]
  const themeNote = weather.themeFirstOnly
    ? step === 0 ? themeBar[0] : null
    : themeBar.find(([noteStep]) => noteStep === step)

  if (themeNote) {
    const [, degree, length] = themeNote
    const duration = weather.themeFirstOnly ? '1m' : Tone.Time('16n').toSeconds() * length
    audio.synth1Drops.triggerAttackRelease(
      degreeToNote(degree, weather.mode), duration, time, weather.themeVelocity
    )
  } else if (Math.random() < controlValues.dropsHumidity * 0.5) {
    const note = chord[Math.floor(Math.random() * chord.length)]
    audio.synth1Drops.triggerAttackRelease(
      octaveUp(note, 2), '16n', time, 0.12 + Math.random() * 0.15
    )
  } else return

  Tone.getDraw().schedule(() => flashLamp('drops'), time)
}

function playClouds(weather, chord, step, time) {
  if (weather.themeFirstOnly && state.bar % 2 !== 0) return
  const symbol = weather.clouds[step]
  if (symbol === 'c' || symbol === 'a')
    Tone.getDraw().schedule(() => flashLamp('clouds'), time)
  if (symbol === 'c')
    audio.synth2Clouds.triggerAttackRelease(chord, weather.cloudsDuration, time, 0.45)
  if (symbol === 'a') {
    const note = chord[state.arpIndex % chord.length]
    audio.synth2Clouds.triggerAttackRelease(octaveUp(note), '16n', time, 0.3)
    state.arpIndex++
  }
}

function playWind(weather, step, time) {
  const gusts = controlValues.windGusts
  const velocity = 0.6 + gusts * 0.4
  const kick = gusts > 0.05 && weather.kick[step] === 'x'
  const clap = gusts > 0.6 && weather.clap[step] === 'x'
  const hat = gusts > 0.3 && weather.hat[step] !== '.'

  if (kick) audio.windKick.triggerAttackRelease('C1', '8n', time, velocity)
  if (clap) audio.windClap.triggerAttackRelease('16n', time, velocity)
  if (hat) audio.windHat.triggerAttackRelease(
    250, '32n', time, (weather.hat[step] === 'X' ? 1 : 0.4) * velocity
  )

  Tone.getDraw().schedule(() => {
    if (kick) flashLamp('windKick')
    if (clap) flashLamp('windClap')
    if (hat) flashLamp('windHat')
  }, time)
}

let sequence = null

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function buildSequencer() {
  clearSequencer()

  sequence = new Tone.Sequence(
    (time, step) => {
      if (step === 0) {
        state.weatherBar++
        const weatherIndex = WEATHER_ORDER.indexOf(state.weather)
        const weatherFinished = state.weatherBar >= BARS_PER_WEATHER
        if (weatherFinished && state.weather === 'clear' && !state.nextWeather) {

          state.dayEndTime = time
          audio.masterChannel.volume.setValueAtTime(-Infinity, time)
          Tone.getTransport().stop(time)
          Tone.getDraw().schedule(() => stopPlayback(true), time)
          return
        }
        const automatic = weatherFinished
          ? WEATHER_ORDER[Math.min(weatherIndex + 1, WEATHER_ORDER.length - 1)]
          : null
        const nextWeather = state.nextWeather || automatic

        if (nextWeather && nextWeather !== state.weather) {
          applyWeather(nextWeather)
          const currentWeather = state.weather

          Tone.getDraw().schedule(() => renderWeather(currentWeather), time)
        }
        state.nextWeather = null
        state.bar = (state.bar + 1) % THEME.length
      }

      const weather = WEATHERS[state.weather]
      const chord = CHORDS[weather.chords[state.bar]]
      playDrops(weather, chord, step, time)
      playClouds(weather, chord, step, time)
      playWind(weather, step, time)

      Tone.getDraw().schedule(() => highlightStep(step), time)
    },
    STEPS,
    '16n'
  ).start(0)
}

function clearSequencer() {
  const transport = Tone.getTransport()
  transport.stop()
  transport.cancel()
  Tone.getDraw().cancel(0)
  if (sequence) {
    sequence.dispose()
    sequence = null
  }
  if (audio) {
    audio.synth1Drops.releaseAll()
    audio.synth2Clouds.releaseAll()
    audio.windKick.triggerRelease()
    audio.windClap.triggerRelease()
    audio.windHat.triggerRelease()
  }
  state.bar = -1
  state.weatherBar = -1
  state.dayEndTime = null
  state.arpIndex = 0
}

// управление

function setChannelVolume(target, value) {

  if (state.mutes[target]) return
  audio[target + 'Channel'].volume.value = BASE_VOLUME[target] + Tone.gainToDb(value)
}

const params = {
  dropsVolume: (v) => setChannelVolume('drops', v),
  cloudsVolume: (v) => setChannelVolume('clouds', v),
  cloudsFog: (v) => {
    audio.cloudsChorus.wet.value = v
    audio.cloudsEcho.wet.value = v * 0.6
  },
  windVolume: (v) => setChannelVolume('wind', v),
  storm: (v) => {
    audio.windNoise.wet.value = v
    audio.dropsStorm.wet.value = v * 0.8
  }
}

const controlValues = {}
const controls = {}

function setParam(name, value) {
  controlValues[name] = value
  if (audio && params[name]) params[name](value)
  if (name.endsWith('Volume')) updateMute(name.slice(0, -6))
}

function softWave(type, partials = 5) {
  if (type === 'sawtooth' || type === 'square') return type + partials
  return type
}

function applyWave(target) {
  if (!audio) return
  const type = state.waves[target]
  if (target === 'drops')
    audio.synth1Drops.set({ oscillator: { type: softWave(type, 3) } })
  if (target === 'clouds') {
    audio.synth2Clouds.set({ oscillator: { type: softWave(type, 5) } })
    audio.synth2Clouds.volume.value = CLOUDS_WAVE_BOOST[type]
  }
}

function applyMute(target) {
  if (!audio) return
  audio[target + 'Channel'].mute = state.mutes[target]
  if (!state.mutes[target]) setChannelVolume(target, controlValues[target + 'Volume'])
}

function updateWeatherSwitch() {
  const current = document.body.dataset.weather
  document.querySelectorAll('[data-weather-option]').forEach((option) => {
    const weather = option.dataset.weatherOption
    option.setAttribute('aria-checked', weather === current)
    option.dataset.pending = weather === state.nextWeather
    option.setAttribute('aria-label', `${WEATHERS[weather].label}${weather === state.nextWeather ? ': в ожидании' : ''}`)
  })
}

function renderWeather(weather) {
  document.body.dataset.weather = weather
  updateWeatherSwitch()
  renderIsobars()
  updateForecast()
}

function applyWeather(weather) {
  state.weather = weather
  state.bar = -1
  state.weatherBar = 0
  state.arpIndex = 0
  if (audio) audio.synth2Clouds.set({ envelope: WEATHERS[weather].cloudsEnvelope })
}

function setWeather(weather) {
  state.dayComplete = false
  if (state.playing) {
    state.nextWeather = weather === state.weather ? null : weather
    updateWeatherSwitch()
    return
  }
  state.nextWeather = null
  applyWeather(weather)
  renderWeather(weather)
}

function stopPlayback(dayComplete = false) {
  clearSequencer()
  if (audio) audio.masterChannel.mute = true
  state.playing = false
  state.dayComplete = dayComplete
  document.body.dataset.playing = 'false'
  highlightStep(-1)
  Object.keys(lampTimers).forEach((name) => clearTimeout(lampTimers[name]))
  document.querySelectorAll('.Lamp--on').forEach((lamp) => lamp.classList.remove('Lamp--on'))
  const weather = state.nextWeather || state.weather
  state.nextWeather = null
  applyWeather(weather)
  renderWeather(weather)
  setStartText('старт')
}

async function togglePlay() {
  if (state.starting) return
  if (state.playing) {
    stopPlayback()
    return
  }

  state.starting = true
  setStartText('загрузка')
  try {
    const context = Tone.getContext()
    context.lookAhead = 0.15
    await Tone.start()
    if (state.dayComplete) setWeather('fog')

    if (audio) Object.values(audio).forEach((node) => node.dispose())
    audio = null
    Tone.getTransport().bpm.value = BPM
    // эффекты запускаются сразу
    context.lookAhead = 0
    try {
      audio = buildAudio()
    } finally {
      context.lookAhead = 0.15
    }
    Object.keys(params).forEach((name) => params[name](controlValues[name]))
    Object.keys(state.mutes).forEach(applyMute)
    buildSequencer()
    state.playing = true
    Tone.getTransport().start('+0.1')
    document.body.dataset.playing = 'true'
    setStartText('стоп')
    updateForecast()
  } catch (error) {
    stopPlayback()
    document.getElementById('forecastTempo').textContent = 'не удалось включить звук'
    console.error('не удалось включить звук', error)
  } finally {
    state.starting = false
  }
}

// интерфейс

const clamp = (v) => Math.min(1, Math.max(0, v))
const formatValue = (v) => (v * 10).toFixed(1)

// ручки и ползунки

function setupControl(el, surface, render) {
  const name = el.dataset.param
  const label = el.dataset.label
  const initial = parseFloat(el.dataset.value)
  let current = initial

  const caption = document.createElement('div')
  caption.className = 'Control__caption'
  caption.innerHTML = `<span class="Control__label">${label}</span><span class="Control__value"></span>`
  el.appendChild(caption)
  const valueEl = caption.querySelector('.Control__value')

  surface.setAttribute('role', 'slider')
  surface.setAttribute('tabindex', '0')
  surface.setAttribute('aria-label', label)
  surface.setAttribute('aria-valuemin', '0')
  surface.setAttribute('aria-valuemax', '10')

  function set(value) {
    current = clamp(value)
    render(current)
    valueEl.textContent = formatValue(current)
    surface.setAttribute('aria-valuenow', formatValue(current))
    setParam(name, current)
  }

  surface.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(current + step)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(current - step)
    else if (e.key === 'Home') set(0)
    else if (e.key === 'End') set(1)
    else return
    e.preventDefault()
  })

  surface.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      set(current - e.deltaY * 0.001)
    },
    { passive: false }
  )

  surface.addEventListener('dblclick', () => set(initial))

  const control = { set, get: () => current, reset: () => set(initial) }
  controls[name] = control
  control.reset()
  return control
}

// ручки

const KNOB_ANGLE = 135

function polar(radius, angle) {
  const a = ((angle - 90) * Math.PI) / 180
  return [
    (50 + radius * Math.cos(a)).toFixed(2),
    (50 + radius * Math.sin(a)).toFixed(2)
  ]
}

function createKnob(el) {
  const count = 25
  const majorEvery = 6
  let ticks = ''

  for (let i = 0; i < count; i++) {
    const angle = -KNOB_ANGLE + (2 * KNOB_ANGLE * i) / (count - 1)
    const major = i % majorEvery === 0
    const [x1, y1] = polar(major ? 39 : 42, angle)
    const [x2, y2] = polar(47, angle)
    ticks += `<line class="Knob__tick${major ? ' Knob__tick--major' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
  }

  const dial = document.createElement('div')
  dial.className = 'Knob__dial'
  dial.innerHTML = `
    <svg viewBox="0 0 100 100">
      ${ticks}
      <circle class="Knob__face" cx="50" cy="50" r="34"/>
      <g class="Knob__needle"><line x1="50" y1="50" x2="50" y2="21"/></g>
      <circle class="Knob__hub" cx="50" cy="50" r="3.6"/>
    </svg>`
  el.appendChild(dial)

  const tickEls = dial.querySelectorAll('.Knob__tick')
  const needle = dial.querySelector('.Knob__needle')
  let litTicks = -1

  const control = setupControl(el, dial, (v) => {
    needle.setAttribute(
      'transform',
      `rotate(${-KNOB_ANGLE + v * 2 * KNOB_ANGLE} 50 50)`
    )

    const lit = Math.floor(v * (count - 1) + 0.001) + 1
    if (lit === litTicks) return
    tickEls.forEach((tick, i) =>
      tick.classList.toggle('Knob__tick--lit', i < lit)
    )
    litTicks = lit
  })

  let startY = 0
  let startValue = 0
  dial.addEventListener('pointerdown', (e) => {
    dial.setPointerCapture(e.pointerId)
    startY = e.clientY
    startValue = control.get()
  })
  dial.addEventListener('pointermove', (e) => {
    if (!dial.hasPointerCapture(e.pointerId)) return
    control.set(startValue + (startY - e.clientY) / 160)
  })
}

// ползунки

const FADER_TOP = 8
const FADER_BOTTOM = 148
const FADER_HEIGHT = 176

function createFader(el) {
  let ticks = ''
  for (let i = 0; i <= 20; i++) {
    const y = FADER_BOTTOM - (i / 20) * (FADER_BOTTOM - FADER_TOP)
    const major = i % 5 === 0
    ticks += `<line class="Fader__tick${major ? ' Fader__tick--major' : ''}" x1="31" y1="${y}" x2="${major ? 41 : 36}" y2="${y}"/>`
    if (i % 10 === 0)
      ticks += `<text class="Fader__num" x="45" y="${y}">${i / 2}</text>`
  }

  const body = document.createElement('div')
  body.className = 'Fader__body'
  body.innerHTML = `
    <svg viewBox="0 0 60 ${FADER_HEIGHT}">
      <rect class="Fader__tube" x="12" y="2" width="12" height="154" rx="6"/>
      <rect class="Fader__mercury" x="15" y="0" width="6" height="0"/>
      <circle class="Fader__bulb" cx="18" cy="161" r="11"/>
      ${ticks}
      <rect class="Fader__thumb" x="6" y="0" width="24" height="3"/>
    </svg>`
  el.appendChild(body)

  const svg = body.querySelector('svg')
  const mercury = body.querySelector('.Fader__mercury')
  const thumb = body.querySelector('.Fader__thumb')

  const control = setupControl(el, body, (v) => {
    const y = FADER_BOTTOM - v * (FADER_BOTTOM - FADER_TOP)
    mercury.setAttribute('y', y)
    mercury.setAttribute('height', 158 - y)
    thumb.setAttribute('y', y - 1.5)
  })

  function setFromPointer(e) {
    const rect = svg.getBoundingClientRect()
    const y = ((e.clientY - rect.top) / rect.height) * FADER_HEIGHT
    control.set((FADER_BOTTOM - y) / (FADER_BOTTOM - FADER_TOP))
  }
  body.addEventListener('pointerdown', (e) => {
    body.setPointerCapture(e.pointerId)
    setFromPointer(e)
  })
  body.addEventListener('pointermove', (e) => {
    if (body.hasPointerCapture(e.pointerId)) setFromPointer(e)
  })
}

// волны

const WAVE_SHAPES = {
  sine: '<circle cx="12" cy="12" r="8.5"/>',
  triangle: '<polygon points="12,3.5 21,20 3,20"/>',
  square: '<rect x="4" y="4" width="16" height="16"/>',
  sawtooth: '<polygon points="3.5,20 20.5,3.5 20.5,20"/>'
}

function createWavePicker(el) {
  const target = el.dataset.wave
  el.setAttribute('role', 'radiogroup')
  el.setAttribute('aria-label', 'форма волны')

  WAVES[target].forEach((type) => {
    const button = document.createElement('button')
    button.className = 'WaveButton'
    button.dataset.type = type
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-label', WAVE_LABELS[type])
    button.title = WAVE_LABELS[type]
    button.innerHTML = `<svg viewBox="0 0 24 24">${WAVE_SHAPES[type]}</svg>`
    button.addEventListener('click', () => {
      state.waves[target] = type
      applyWave(target)
      updateWavePicker(el)
    })
    el.appendChild(button)
  })

  const name = document.createElement('span')
  name.className = 'WavePicker__name'
  el.appendChild(name)
  updateWavePicker(el)
}

function updateWavePicker(el) {
  const current = state.waves[el.dataset.wave]
  el.querySelectorAll('.WaveButton').forEach((button) => {
    button.setAttribute('aria-checked', button.dataset.type === current)
  })
  el.querySelector('.WavePicker__name').textContent = WAVE_LABELS[current]
}

// вкл и выкл

function updateMute(target) {
  const button = document.querySelector(`[data-mute="${target}"]`)
  if (!button) return
  const card = button.closest('.Instrument')
  const name = card.querySelector('.Instrument__name').textContent
  const on = !state.mutes[target] && controlValues[target + 'Volume'] > 0

  button.setAttribute('aria-pressed', on)
  button.setAttribute('aria-label', `${on ? 'выключить' : 'включить'} ${name}`)
  button.title = `${on ? 'выключить' : 'включить'} ${name}`
  const label = button.querySelector('.Mute__label')
  if (label) label.textContent = on ? 'вкл' : 'выкл'
  card.classList.toggle('Instrument--muted', !on)
}

function setupMute(button) {
  const target = button.dataset.mute
  const label = document.createElement('span')
  label.className = 'Mute__label'
  button.appendChild(label)

  button.addEventListener('click', () => {
    const volume = target + 'Volume'
    if (state.mutes[target] || controlValues[volume] === 0) {
      state.mutes[target] = false
      if (controlValues[volume] === 0) controls[volume].reset()
    } else state.mutes[target] = true
    applyMute(target)
    updateMute(target)
  })
  updateMute(target)
}

// лампы

const LAMP_PART = {
  drops: 'drops',
  clouds: 'clouds',
  windKick: 'wind',
  windClap: 'wind',
  windHat: 'wind'
}
const lampTimers = {}

function flashLamp(name) {
  const part = LAMP_PART[name]
  if (state.mutes[part] || controlValues[part + 'Volume'] === 0) return
  const lamp = document.querySelector(`[data-lamp="${name}"]`)
  if (!lamp) return
  lamp.classList.add('Lamp--on')
  clearTimeout(lampTimers[name])
  lampTimers[name] = setTimeout(() => lamp.classList.remove('Lamp--on'), 90)
}

// время

function renderSteps() {
  const container = document.getElementById('steps')
  for (let i = 0; i < 16; i++) {
    const step = document.createElement('span')
    step.className = i % 4 === 0 ? 'Step Step--beat' : 'Step'
    container.appendChild(step)
  }
}

function highlightStep(index) {
  document.querySelectorAll('.Step').forEach((el, i) => {
    el.classList.toggle('Step--now', i === index)
  })
}

// прогноз и старт

function setStartText(text) {
  document.getElementById('startText').textContent = text
}

function updateForecast() {
  const weather = document.body.dataset.weather
  document.getElementById('forecastWeather').textContent = WEATHERS[weather].label
  document.getElementById('forecastTempo').textContent = state.playing
    ? `${BPM} уд/мин`
    : 'тишина'
}

// изобары

const PRESSURE = {
  fog: {
    letter: 'Н',
    cx: 690,
    cy: 250,
    gap: 50
  },
  drizzle: {
    letter: 'Н',
    cx: 650,
    cy: 240,
    gap: 43
  },
  storm: {
    letter: 'Н',
    cx: 680,
    cy: 220,
    gap: 26
  },
  clear: {
    letter: 'В',
    cx: 330,
    cy: 160,
    gap: 50
  }
}

function renderIsobars() {
  const p = PRESSURE[document.body.dataset.weather]
  let out = ''

  for (let k = 0; k < 9; k++) {
    const radius = 44 + k * p.gap
    const wobble = (t) =>
      1 + 0.08 * Math.sin(3 * t + k * 0.8) + 0.05 * Math.sin(5 * t - k * 0.5)
    let d = ''
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2
      const x = p.cx + Math.cos(t) * radius * 1.6 * wobble(t)
      const y = p.cy + Math.sin(t) * radius * wobble(t)
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    out += `<path d="${d}Z"/>`
  }

  out += `<g class="Isobars__center"><circle cx="${p.cx}" cy="${p.cy}" r="17"/><text x="${p.cx}" y="${p.cy}">${p.letter}</text></g>`
  document.getElementById('isobars').innerHTML = out
}

// небо

let skyLevel = 0
let shownLevel = -1
let skyWeather = null
let skySuns = []
const reduceMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches

function animateSky() {

  if (state.dayEndTime !== null && Tone.immediate() >= state.dayEndTime)
    stopPlayback(true)

  let target = 0
  if (audio && state.playing) {
    let db = audio.masterMeter.getValue()
    if (Array.isArray(db)) db = Math.max(...db)
    target = clamp((db + 45) / 35)
  }

  skyLevel += (target - skyLevel) * (target > skyLevel ? 0.35 : 0.08)

  if (Math.abs(skyLevel - shownLevel) > 0.004) {
    shownLevel = skyLevel
    if (!reduceMotion)
      skyWeather.style.transform = `scale(${(1 + skyLevel * 0.08).toFixed(4)})`
    skySuns.forEach(
      (sun) => (sun.style.opacity = (0.5 + skyLevel * 0.5).toFixed(3))
    )
  }

  requestAnimationFrame(animateSky)
}

// курсор

function setupCursor() {
  const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
  const cursor = document.createElement('div')
  cursor.className = 'Cursor'
  cursor.setAttribute('aria-hidden', 'true')
  cursor.innerHTML = '<span class="Cursor__dot"></span>'
  document.body.appendChild(cursor)

  let x = 0
  let y = 0
  let frame = 0
  let dragging = false
  let blurred = false

  function updateTarget(target) {
    const control = target instanceof Element
      ? target.closest('button, [role="slider"], a[href], [tabindex]:not([tabindex="-1"])')
      : null
    const interactive = control && !control.matches(':disabled, [aria-disabled="true"]')
    cursor.classList.toggle('Cursor--interactive', dragging || Boolean(interactive))
  }

  function hide() {
    cancelAnimationFrame(frame)
    frame = 0
    dragging = false
    cursor.classList.remove('Cursor--visible', 'Cursor--interactive')
    if (document.body.dataset.cursor === 'true') document.body.dataset.cursor = 'false'
  }

  function render() {
    frame = 0
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
    if (!cursor.classList.contains('Cursor--visible')) {
      cursor.classList.add('Cursor--visible')
      document.body.dataset.cursor = 'true'
    }
  }

  function move(event) {
    if (event.pointerType !== 'mouse' || !finePointer.matches || blurred) {
      hide()
      return
    }
    x = event.clientX
    y = event.clientY
    updateTarget(event.target)
    if (!frame) frame = requestAnimationFrame(render)
  }

  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', (event) => {
    move(event)
    dragging = event.pointerType === 'mouse' && cursor.classList.contains('Cursor--interactive')
  }, { passive: true })
  document.addEventListener('pointerup', (event) => {
    dragging = false
    if (event.pointerType === 'mouse' && finePointer.matches && !blurred)
      updateTarget(document.elementFromPoint(event.clientX, event.clientY))
  }, { passive: true })
  document.addEventListener('pointercancel', hide, { passive: true })
  document.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) hide()
  }, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide()
  })
  window.addEventListener('blur', () => {
    blurred = true
    hide()
  })
  window.addEventListener('focus', () => {
    blurred = false
  })
  finePointer.addEventListener('change', () => {
    if (!finePointer.matches) hide()
  })
}

// запуск

document.addEventListener('DOMContentLoaded', () => {
  renderSteps()
  renderWeather(state.weather)

  document.querySelectorAll('.Fader').forEach(createFader)
  document.querySelectorAll('.Knob').forEach(createKnob)
  document.querySelectorAll('.WavePicker').forEach(createWavePicker)
  document.querySelectorAll('[data-mute]').forEach(setupMute)
  setupCursor()

  document.getElementById('startButton').addEventListener('click', togglePlay)

  document.querySelectorAll('[data-weather-option]').forEach((option) => {
    option.addEventListener('click', () => setWeather(option.dataset.weatherOption))
  })

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return
    if (e.target.closest('button, [role="slider"]')) return
    e.preventDefault()
    togglePlay()
  })

  skyWeather = document.querySelector('.Sky__weather')
  skySuns = document.querySelectorAll('.Cloud--d')
  requestAnimationFrame(animateSky)
})
