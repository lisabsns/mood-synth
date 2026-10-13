// =====================================================
// СТРУКТУРА ИНСТРУМЕНТА
//
// synth1Bells                                 -> bellsChannel  -\
// synth2Chords -> chordsChorus -> chordsDelay   -> chordsChannel -->  masterChannel -> compressor -> limiter -> выход
// drumKick/Clap/Hat -> drumsCrusher            -> drumsChannel  -/
//
// Пространство в звуке дают эффекты внутри каналов: туман (хорус) и отражение (эхо) у облаков.
// =====================================================

// ---------- 1. НАСТРОЙКИ ----------

const BPM = { minor: 112, major: 128 }

// какие волны доступны каждому синту (у аккордов без квадрата)
const WAVES = {
  bells: ['sine', 'triangle', 'square', 'sawtooth'],
  chords: ['sine', 'triangle', 'sawtooth']
}

// поправка громкости аккордов для каждой волны (dB):
// синус почти без призвуков, поэтому на слух он тише остальных — поднимаем его
const CHORDS_WAVE_BOOST = { sine: 9, triangle: 0, sawtooth: 0 }
const WAVE_LABELS = {
  sawtooth: 'пила',
  square: 'квадрат',
  triangle: 'треугольник',
  sine: 'синус'
}
const MOOD_LABELS = { minor: 'пасмурно', major: 'ясно' }

// базовая громкость каналов в dB (слайдер громкости работает поверх неё)
const BASE_VOLUME = { bells: -11, chords: -17, drums: -4 }

// ДЛЯ ПРОВЕРКИ: можно выключить часть прямо в коде и слушать остальное по отдельности
// (например, сначала только бит: bells: false, chords: false)
const PARTS_ON = { bells: true, chords: true, drums: true }

// ---------- 2. МУЗЫКА ----------
// Паттерн = строка из 16 шагов (1 такт шестнадцатыми)
// bells:  0-3 = номер ноты текущего аккорда (звучит на 1 октаву выше), . = пауза
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
    bells: '3.....2...1.....',
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
    bells: '0..2..3...2.1...',
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
  waves: { bells: 'sine', chords: 'triangle' },
  mutes: { bells: false, chords: false, drums: false }
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

  // СИНТ 1 / КОЛОКОЛЬЧИКИ: мягкие ноты в среднем регистре
  const bellsChannel = new Tone.Channel({ volume: BASE_VOLUME.bells }).connect(
    masterChannel
  )
  // обычный синт: тип волны напрямую определяет тембр (синус / треугольник / квадрат / пила)
  const synth1Bells = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: softWave(state.waves.bells, 3) },
    envelope: { attack: 0.02, decay: 0.8, sustain: 0, release: 1.2 }
  }).connect(bellsChannel)
  synth1Bells.maxPolyphony = 8 // не больше 8 нот одновременно, чтобы хвосты не копились

  // СИНТ 2 / АККОРДЫ
  const chordsChannel = new Tone.Channel({
    volume: BASE_VOLUME.chords
  }).connect(masterChannel)
  const chordsDelay = new Tone.PingPongDelay({
    delayTime: '8n.',
    feedback: 0.3,
    wet: 0.25
  }).connect(chordsChannel)
  const chordsChorus = new Tone.Chorus({
    frequency: 1.5,
    delayTime: 3.5,
    depth: 0.7,
    wet: 0.5
  })
    .connect(chordsDelay)
    .start()
  const synth2Chords = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: softWave(state.waves.chords) },
    envelope: { attack: 0.06, decay: 0.4, sustain: 0.2, release: 0.8 }
  }).connect(chordsChorus)
  synth2Chords.maxPolyphony = 12
  synth2Chords.volume.value = CHORDS_WAVE_BOOST[state.waves.chords]

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

  return {
    masterChannel,
    masterMeter,
    synth1Bells,
    bellsChannel,
    synth2Chords,
    chordsChorus,
    chordsDelay,
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

function playBells(symbol, chord, time) {
  if (symbol === '.') return
  const note = octaveUp(chord[parseInt(symbol)])
  audio.synth1Bells.triggerAttackRelease(note, '8n', time, 0.5)
  Tone.getDraw().schedule(() => flashLamp('bells'), time) // лампа «капли»
}

function playChords(symbol, chord, time) {
  if (symbol === 'c' || symbol === 'a')
    Tone.getDraw().schedule(() => flashLamp('chords'), time) // лампа «облака»
  if (symbol === 'c')
    audio.synth2Chords.triggerAttackRelease(chord, '8n', time, 0.45)
  if (symbol === 'a') {
    const note = chord[state.arpIndex % chord.length]
    audio.synth2Chords.triggerAttackRelease(octaveUp(note), '16n', time, 0.3)
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

  // лампы «ветра»: бочка, клэп, хэт
  Tone.getDraw().schedule(() => {
    if (song.kick[step] === 'x') flashLamp('kick')
    if (song.clap[step] === 'x') flashLamp('clap')
    if (song.hat[step] !== '.') flashLamp('hat')
  }, time)
}

let sequence = null // текущий секвенсор (храним, чтобы очищать при стопе)

// 16 шагов такта. Это НЕ ноты, а номера шагов: секвенсор по очереди
// передаёт каждый номер в функцию ниже, а она смотрит в паттерны, что играть на этом шаге
const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function buildSequencer() {
  clearSequencer() // на всякий случай убираем старый, чтобы два секвенсора не играли одновременно

  sequence = new Tone.Sequence(
    (time, step) => {
      const song = songs[state.mood]
      if (step === 0) state.bar = (state.bar + 1) % song.chords.length

      if (PARTS_ON.bells)
        playBells(song.bells[step], song.chords[state.bar], time)
      if (PARTS_ON.chords)
        playChords(song.hits[step], song.chords[state.bar], time)
      if (PARTS_ON.drums) playDrums(song, step, time)

      Tone.getDraw().schedule(() => highlightStep(step), time)
    },
    STEPS,
    '16n'
  ).start(0)
}

// КЛИР: полностью убирает секвенсор и запланированные события
function clearSequencer() {
  const transport = Tone.getTransport()
  transport.stop()
  transport.cancel() // удаляет всё, что было запланировано на транспорте
  Tone.getDraw().cancel(0) // и всю запланированную подсветку шагов и ламп, чтобы ничего не мигало после стопа
  if (sequence) {
    sequence.dispose()
    sequence = null
  }
  if (audio) {
    audio.synth1Bells.releaseAll() // гасим звучащие ноты, чтобы не наслаивались на новый старт
    audio.synth2Chords.releaseAll()
  }
  state.bar = -1
  state.arpIndex = 0
}

// ---------- 6. УПРАВЛЕНИЕ ЗВУКОМ ----------

const params = {
  bellsVolume: (v) =>
    (audio.bellsChannel.volume.value = BASE_VOLUME.bells + Tone.gainToDb(v)),
  chordsVolume: (v) =>
    (audio.chordsChannel.volume.value = BASE_VOLUME.chords + Tone.gainToDb(v)),
  chordsChorus: (v) => (audio.chordsChorus.wet.value = v),
  chordsDelay: (v) => (audio.chordsDelay.wet.value = v),
  drumsVolume: (v) =>
    (audio.drumsChannel.volume.value = BASE_VOLUME.drums + Tone.gainToDb(v)),
  drumsCrush: (v) => (audio.drumsCrusher.wet.value = v)
}

// Текущие значения всех ручек и ползунков (0..1).
// До старта звука они просто запоминаются, а при старте применяются все разом
const controlValues = {}

function setParam(name, value) {
  controlValues[name] = value
  if (audio) params[name](value)
}

// Смягчение волн: у пилы и квадрата оставляем только первые несколько гармоник (partials).
// Характер волны остаётся узнаваемым, но пропадает «скрип» на высоких частотах (без всяких фильтров).
// Колокольчики звучат выше аккордов, поэтому им нужно меньше гармоник (3), аккордам — 5
function softWave(type, partials = 5) {
  if (type === 'sawtooth' || type === 'square') return type + partials
  return type
}

function applyWave(target) {
  if (!audio) return
  const type = state.waves[target]
  if (target === 'bells')
    audio.synth1Bells.set({ oscillator: { type: softWave(type, 3) } })
  if (target === 'chords') {
    audio.synth2Chords.set({ oscillator: { type: softWave(type) } })
    audio.synth2Chords.volume.value = CHORDS_WAVE_BOOST[type]
  }
}

function applyMute(target) {
  if (!audio) return
  audio[target + 'Channel'].mute = state.mutes[target]
}

function setMood(mood) {
  state.mood = mood
  document.body.dataset.mood = mood // CSS смотрит сюда и перекрашивает небо
  document.querySelectorAll('[data-mood-option]').forEach((option) => {
    option.setAttribute('aria-checked', option.dataset.moodOption === mood)
  })
  // темп меняется сразу, без плавного rampTo (он давал «плывущий» ритм при переключении)
  if (audio) Tone.getTransport().bpm.value = BPM[mood]
  renderIsobars()
  updateForecast()
}

async function togglePlay() {
  const transport = Tone.getTransport()

  if (state.starting) return // уже запускаемся: игнорируем лишние клики

  if (!state.started) {
    state.starting = true
    setStartText('загрузка')
    // запас времени для планирования нот: если браузер на миг занят (например, рисует),
    // ноты всё равно прозвучат вовремя, без заиканий
    Tone.getContext().lookAhead = 0.15
    await Tone.start()
    audio = buildAudio()
    transport.bpm.value = BPM[state.mood]
    Object.keys(controlValues).forEach((name) =>
      params[name](controlValues[name])
    )
    Object.keys(state.mutes).forEach(applyMute)
    state.started = true
    state.starting = false
  }

  if (state.playing) {
    clearSequencer() // стоп = полная очистка
    highlightStep(-1)
  } else {
    buildSequencer() // старт = каждый раз новый чистый секвенсор
    transport.start('+0.1')
  }

  state.playing = !state.playing
  document.body.dataset.playing = state.playing // небо становится цветным / серым
  setStartText(state.playing ? 'стоп' : 'старт')
  updateForecast()
}

// ---------- 7. ИНТЕРФЕЙС ----------
// Язык элементов: ползунок-термометр = сила (громкость), ручка-барометр = эффект,
// геометрическая фигура = форма волны, квадрат в углу = вкл/выкл, лампы = ноты и удары

const clamp = (v) => Math.min(1, Math.max(0, v))
const formatValue = (v) => (v * 10).toFixed(1) // все шкалы от 0 до 10, как на приборах

// --- 7.1 Общая основа ручек и ползунков: подпись, значение, клавиатура, колесо, сброс ---

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

  // стрелки на клавиатуре (с Shift — крупный шаг), Home = 0, End = 10
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

  surface.addEventListener('dblclick', () => set(initial)) // двойной клик = вернуть как было

  set(initial)
  return { set, get: () => current }
}

// --- 7.2 Ручка-барометр ---

const KNOB_ANGLE = 135 // стрелка ходит от -135° до +135°

function polar(radius, angle) {
  const a = ((angle - 90) * Math.PI) / 180
  return [
    (50 + radius * Math.cos(a)).toFixed(2),
    (50 + radius * Math.sin(a)).toFixed(2)
  ]
}

function createKnob(el) {
  const count = 25 // сколько делений на шкале
  const majorEvery = 6 // каждое 6-е деление длинное
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
    // перекрашиваем деления, только если их число поменялось (меньше работы для браузера)
    const lit = Math.floor(v * (count - 1) + 0.001) + 1
    if (lit === litTicks) return
    tickEls.forEach((tick, i) =>
      tick.classList.toggle('Knob__tick--lit', i < lit)
    )
    litTicks = lit
  })

  // крутить: зажать и вести мышь вверх / вниз
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

// --- 7.3 Ползунок-термометр ---

const FADER_TOP = 8 // где на рисунке отметка 10
const FADER_BOTTOM = 148 // где на рисунке отметка 0
const FADER_HEIGHT = 176 // высота рисунка

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
    mercury.setAttribute('height', 158 - y) // «ртуть» от отметки до колбы
    thumb.setAttribute('y', y - 1.5)
  })

  // клик или перетаскивание ставит значение туда, куда указывает мышь
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

// --- 7.4 Форма волны: геометрические фигуры ---

const WAVE_SHAPES = {
  sine: '<circle cx="12" cy="12" r="8.5"/>', // синус: нет углов — круг
  triangle: '<polygon points="12,3.5 21,20 3,20"/>', // треугольник
  square: '<rect x="4" y="4" width="16" height="16"/>', // квадрат
  sawtooth: '<polygon points="3.5,20 20.5,3.5 20.5,20"/>' // пила: один «зубец»
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

// --- 7.5 Вкл / выкл ---

function setupMute(button) {
  const target = button.dataset.mute
  const card = button.closest('.Instrument')
  const name = card.querySelector('.Instrument__name').textContent

  function render() {
    const on = !state.mutes[target]
    button.setAttribute('aria-pressed', on)
    button.setAttribute('aria-label', `${name}: ${on ? 'звучит' : 'тихо'}`)
    card.classList.toggle('Instrument--muted', !on)
  }

  button.addEventListener('click', () => {
    state.mutes[target] = !state.mutes[target]
    applyMute(target)
    render()
  })
  render()
}

// --- 7.6 Лампы: вспыхивают на каждую ноту и удар ---

const LAMP_PART = {
  bells: 'bells',
  chords: 'chords',
  kick: 'drums',
  clap: 'drums',
  hat: 'drums'
}
const lampTimers = {}

function flashLamp(name) {
  if (state.mutes[LAMP_PART[name]]) return // выключенный прибор не мигает
  const lamp = document.querySelector(`[data-lamp="${name}"]`)
  if (!lamp) return
  lamp.classList.add('Lamp--on')
  clearTimeout(lampTimers[name])
  lampTimers[name] = setTimeout(() => lamp.classList.remove('Lamp--on'), 90)
}

// --- 7.7 Время: 16 шагов ---

function renderSteps() {
  const container = document.getElementById('steps')
  for (let i = 0; i < 16; i++) {
    const step = document.createElement('span')
    step.className = i % 4 === 0 ? 'Step Step--beat' : 'Step' // каждая 4-я — начало доли
    container.appendChild(step)
  }
}

function highlightStep(index) {
  document.querySelectorAll('.Step').forEach((el, i) => {
    el.classList.toggle('Step--now', i === index)
  })
}

// --- 7.8 Прогноз и кнопка старта ---

function setStartText(text) {
  document.getElementById('startText').textContent = text
}

function updateForecast() {
  document.getElementById('forecastMood').textContent = MOOD_LABELS[state.mood]
  document.getElementById('forecastTempo').textContent = state.playing
    ? `${BPM[state.mood]} уд/мин`
    : 'тишина'
}

// --- 7.9 Изобары: линии давления на небе ---
// пасмурно = циклон (низкое давление, «Н»), ясно = антициклон (высокое давление, «В»)

const PRESSURE = {
  minor: {
    letter: 'Н',
    cx: 690,
    cy: 250,
    center: 992,
    step: 4,
    showValues: false
  }, // в «пасмурно» без цифр
  major: {
    letter: 'В',
    cx: 330,
    cy: 160,
    center: 1036,
    step: -4,
    showValues: true
  }
}

function renderIsobars() {
  const p = PRESSURE[state.mood]
  let out = ''

  for (let k = 0; k < 9; k++) {
    const radius = 44 + k * 50
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

    // подписи давления на каждой второй линии (только те, что точно видны на небе)
    if (p.showValues && k % 2 === 1) {
      const t = -0.55
      const x = p.cx + Math.cos(t) * radius * 1.6 * wobble(t) + 6
      const y = p.cy + Math.sin(t) * radius * wobble(t) - 4
      const visible = x > 60 && x < 920 && y > 110 && y < 300
      if (visible)
        out += `<text class="Isobars__value" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${p.center + k * p.step}</text>`
    }
  }

  out += `<g class="Isobars__center"><circle cx="${p.cx}" cy="${p.cy}" r="17"/><text x="${p.cx}" y="${p.cy}">${p.letter}</text></g>`
  document.getElementById('isobars').innerHTML = out
}

// --- 7.10 Небо «дышит» от громкости музыки ---

let skyLevel = 0
let shownLevel = -1
let skyWeather = null
let skySuns = []
const reduceMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches

function animateSky() {
  let target = 0
  if (audio && state.playing) {
    let db = audio.masterMeter.getValue()
    if (Array.isArray(db)) db = Math.max(...db)
    target = clamp((db + 45) / 35) // -45 dB = тишина, -10 dB = громко
  }
  // быстро вверх, медленно вниз — как стрелка настоящего прибора
  skyLevel += (target - skyLevel) * (target > skyLevel ? 0.35 : 0.08)

  // обновляем картинку, только если уровень заметно изменился (экономим силы браузера)
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

// --- 7.11 Запуск интерфейса ---

document.addEventListener('DOMContentLoaded', () => {
  renderSteps()
  renderIsobars()
  updateForecast()

  document.querySelectorAll('.Fader').forEach(createFader)
  document.querySelectorAll('.Knob').forEach(createKnob)
  document.querySelectorAll('.WavePicker').forEach(createWavePicker)
  document.querySelectorAll('[data-mute]').forEach(setupMute)

  document.getElementById('startButton').addEventListener('click', togglePlay)

  document.querySelectorAll('[data-mood-option]').forEach((option) => {
    option.addEventListener('click', () => setMood(option.dataset.moodOption))
  })

  // пробел = старт / стоп (удобно во время выступления)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return
    if (e.target.closest('button, [role="slider"]')) return // не мешаем кнопкам и ручкам
    e.preventDefault()
    togglePlay()
  })

  skyWeather = document.querySelector('.Sky__weather')
  skySuns = document.querySelectorAll('.Cloud--d')
  requestAnimationFrame(animateSky)
})
