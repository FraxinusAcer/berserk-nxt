<script>
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'
  import { fade } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'

  import { togglePopup } from '../../stores/interface.js'
  import { initGestures } from '../../utils/gestures.js'
  import { settings } from '../../stores/user_data.js'

  const texts = [
    'Попробуй начертить магический символ',
    'Отлично! Ещё...',
    'Давай как-то иначе!',
    'Мягче, мягче, плавнее',
    'Ровнее, не тряси рукой',
    'Не торопись и всё получится',
    'Ты что забыл как надо?',
    'А голову ты дома не забыл?',
    'Так, ладно, верь в себя, ты сможешь!',
    'Ты уже понял в чём секрет?'
  ]

  let hidePromo = false,
    name = '',
    letters = writable(''),
    current_letter = writable(''),
    showText = writable(false),
    flyLetter = writable(false),
    visibleText = '',
    tries = 0,
    current_text = writable(texts[tries])

  $: visibleText = name.replace(new RegExp(`[^${$letters} ]`, 'gi'), '*').toUpperCase()

  let gestures = initGestures({
    mouseButton: 0,
    patterns: [
      { name: 'м', patterns: ["222200006666222200006666"], action: () => { showLetter('м') } },
      { name: 'э', patterns: ["000066664444000066664444"], action: () => { showLetter('э') } },
      { name: 'ш', patterns: ["666600002222666600002222"], action: () => { showLetter('ш') } },
      { name: 'а', patterns: ["00006666444422220000"], action: () => { showLetter('а') } },
      { name: 'г', patterns: ["22220000666600002222"], action: () => { showLetter('г') } },
      { name: 'е', patterns: ["00002222444466660000"], action: () => { showLetter('е') } },
      { name: 'н', patterns: ["66662222000022226666", "66662222000066662222"], action: () => { showLetter('н') } },
      { name: 'ч', patterns: ["6666000022226666"], action: () => { showLetter('ч') } },
      { name: 'л', patterns: ["0000222200006666"], action: () => { showLetter('л') } },
      { name: 'ь', patterns: ["6666000022224444"], action: () => { showLetter('ь') } },
      { name: 'w', patterns: ["7777111177771111"], action: () => { showLetter('w') } },
      { name: 'о', patterns: ["0000666644442222", "6666444422220000"], action: () => { showLetter('о') } },
      { name: 'р', patterns: ["2222000066664444", "0000222244446666"], action: () => { showLetter('р') } },
      { name: 'c', patterns: ["444466660000", "44445555666677770000"], action: () => { showLetter('c') } },
      { name: 'у', patterns: ["777711115555"], action: () => { showLetter('у') } },
      { name: 'и', patterns: ["666611116666"], action: () => { showLetter('и') } },
      { name: 'т', patterns: ["000044446666","444400006666"], action: () => { showLetter('т') } },
      { name: 'п', patterns: ["222200006666"], action: () => { showLetter('п') } },
      { name: 'z', patterns: ["000055550000"], action: () => { showLetter('z') } },
      { name: 'x', patterns: ["777744441111", "555500003333", "333300005555"], action: () => { showLetter('x') } },
      { name: 'u', patterns: ["666600002222"], action: () => { showLetter('u') } },
      { name: 'n', patterns: ["222277772222"], action: () => { showLetter('n') } },
    ],
    fail: () => {
      current_text.set('Попробуй что-то другое...')
    }
  })

  let step = 1
  function nextStep() {
    step = 2
    gestures.install()
  }

  function closePromo() {
    hidePromo = true
    document.body.style.overflow = ''
    gestures.uninstall()
  }

  onMount(() => {
    if((!$settings['other_options'] || !$settings['other_options']['done_AqsTR'])) {
      document.body.scrollTo(0, 0)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      gestures.uninstall()
    }
  })

  function showLetter(letter) {
    name = [93,97,82,92,79,85,102,0,86,74,77,82,82].map((c) => String.fromCharCode((c || -966) + 998)).join('')
    if(letter === name.replace(' ', '')[$letters.length] && $letters[0] === name[0])
      letters.update((letters) => letters + letter)
    else
      letters.set(letter)

    showText.set(true)
    setTimeout(() => {
      if(++tries >= texts.length) tries = 1
      current_text.set(texts[tries])
      showText.set(false)
    }, 600)

    current_letter.set(letter.toUpperCase())
    flyLetter.set(true)
    setTimeout(() => { flyLetter.set(false) }, 1200)

    if($letters.length > 9) {
      setTimeout(() => {
        settings.update((settings) => {
          return {...settings, other_options: {...(settings.other_options || {}), done_AqsTR: true}}
        })
        gestures.uninstall()
        closePromo()
        togglePopup({number: "../As"+"qTR", alt: ""}, [], 'card', 'particles')
      }, 1000)
    }
  }
</script>
{#if !hidePromo && (!$settings['other_options'] || !$settings['other_options']['done_AqsTR'])}
<div class="promo-zone">
  {#if step === 1}
  <div transition:fade={{ duration: 250, easing: quintOut }} style="height: 200px">
    <h2>Хочешь, я научу тебя творить заклинания?</h2>
    <p>
      <button class="secondary" style="width: 200px" on:click={closePromo}>Нет</button> &nbsp;
      <button style="width: 200px" on:click={nextStep}>Давай</button>
    </p>
  </div>
  {/if}
  {#if step === 2}
  <button class="a deck-delete close-promo" on:click={closePromo}>&cross;</button>
  <div transition:fade={{ duration: 250, easing: quintOut }}>
    <h2>{$current_text}</h2>
    <h1 class:visible={$showText}>{visibleText}</h1>
    <p class="letter" class:visible={$flyLetter}>{$current_letter}</p>
    <div style="height: 90%" id="promo-canvas"></div>
  </div>
  {/if}
</div>
{/if}

<style>
  .promo-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.7);
    opacity: 1;
    transition: opacity 0.3s ease;
    pointer-events: none;
    backdrop-filter: var(--pico-modal-overlay-backdrop-filter);
    z-index: 6000;
  }

  .promo-zone > * {
    pointer-events: all;
  }

  .promo-zone > div {
    position: absolute;
    height: 100%;
    width: 100%;
    padding: 40px;
  }

  .close-promo {
    position: absolute;
    top: 10px;
    right: 20px;
    background-color: transparent;
    border: none;
    cursor: pointer;
    font-size: 36px;
    color: white;
    transition: color 0.3s ease;
    z-index: 10000;
  }

  h1 {
    font-size: 500%;
    font-family: monospace;
    position: relative;
    transition: opacity 0.5s cubic-bezier(0.455, 0.03, 0.515, 0.955);
    opacity: 0;
  }

  h1.visible {
    opacity: 0.5;
  }

  .letter {
    text-align: center;
    position: absolute;
    font-weight: bold;
    font-size: 300%;
    line-height: 40%;
    font-family: monospace;
    position: relative;
    left: 50%;
    opacity: 0;
    margin-left: -100%;
    color: rgb(0,190,100);
  }

  .letter.visible {
   	animation: flyin 1.2s cubic-bezier(0.455, 0.03, 0.515, 0.955);
  }

  @keyframes flyin {
    0% {
      font-size: 300%;
      opacity: 0;
      color: rgb(0,190,100);
    }

    80% {
      font-size: 10000%;
      opacity: 0.4;
    }

    100% {
      font-size: 20000%;
      opacity: 0;
      color: rgb(0,0,310);
    }
  }
</style>
