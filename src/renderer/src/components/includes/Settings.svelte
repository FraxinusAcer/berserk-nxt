<script>
    import { fade } from 'svelte/transition';
    import { settingsStore, toggleSettings } from '../../stores/interface.js';
    import { shortcuts } from '../../utils/shortcuts.js';
    import { option_set, settings } from '../../stores/user_data.js'

    let options = option_set['other_options']
    let click = false

    function updateSettings(key, value) {
        options.update((options) => {
            return {...options, [key]: value}
        })
        settings.update(($settings) => {
          return { ...$settings, other_options: $options }
        })
    }
</script>

{#if $settingsStore.isOpen}
<dialog open class="main-popup" transition:fade={{ duration: 100 }}
    use:shortcuts={{keyboard: true}}
    on:action:primary={() => { if(click){ click=false } else { toggleSettings() } }}
    on:action:preview={toggleSettings}
    on:action:close|stopImmediatePropagation={toggleSettings}
  >
  <article id="settings" role="none" on:click|stopPropagation={() => {}}>
      <div style="min-width: 800px">
        <button class="a deck-delete close-popup" on:click={toggleSettings}>&cross;</button>
        <h3>Настройки</h3>
        <fieldset>
          <label>
            <input type="checkbox" checked={$options['screenshot_size'] > 1} on:input={() => { updateSettings('screenshot_size', event.target['checked'] ? 2 : 1) } } />
            2x масштаб скриншота
          </label>
          <label>
            <input type="checkbox" checked={$options['screenshot_quality'] > 98} on:input={() => { updateSettings('screenshot_quality', event.target['checked'] ? 100 : 95) } } />
            Улучшенное качество скриншота
          </label>
          <label>
            <input type="checkbox" checked={$options['collection_all_filters']} on:input={() => { updateSettings('collection_all_filters', event.target['checked']) } } />
            Все фильтры в коллекции
          </label>
        </fieldset>
      </div>
  </article>
</dialog>
{/if}
