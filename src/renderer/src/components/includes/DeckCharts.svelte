<script>
  import { countColors, groupByCostAndElite } from '../../stores/cards.js';
  import { shortcuts } from '../../utils/shortcuts.js';

  export let deck = []
  export let chart_total = true

  const costs = groupByCostAndElite(deck)
  const maxcost = Object.values(costs).reduce((acc, i) => (acc >= i[0] && acc >= i[1]) ? acc : (i[0] > i[1] ? i[0] : i[1]), 0)
  const maxcost_total = Object.values(costs).reduce((acc, i) => acc >= i[0] + i[1] ? acc : i[0] + i[1], 0)
  const x_chart = Array.from({ length: 20 }, (_, i) => i+1).slice(Math.min(Math.min.apply(null, Object.keys(costs))-1, 1), Math.max(Math.max.apply(null, Object.keys(costs)), 8))

  const colors = countColors(deck)
  const maxcolor = Math.max.apply(null, Object.values(colors))
</script>

<div class="deck-charts-layout">
  <div class="col col-main">
    {#if !chart_total}
    <table use:shortcuts on:action:primary={()=> {chart_total = !chart_total}} style="--aspect-ratio: 4 / 1; max-width: 100%; font-size: 90%; font-weight: bold;" class="charts-css reverse column show-primary-axis show-data-axes data-spacing-5 multiple show-labels">
      <tbody>
        {#each x_chart as i}
        <tr>
          <th scope="row"> {i} </th>
          {#if costs[i]}
          <td style="--size: calc({costs[i][0]} / {maxcost}); --color: rgba(255 180 50 / 75%); color: #000"> {#if costs[i][0]}{costs[i][0]}{/if} </td>
          <td style="--size: calc({costs[i][1]} / {maxcost}); --color: rgba(180 180 180 / 75%); color: #000"> {#if costs[i][1]}{costs[i][1]}{/if} </td>
          {/if}
        </tr>
        {/each}
      </tbody>
    </table>
    {:else}
    <table use:shortcuts on:action:primary={()=> {chart_total = !chart_total}} style="--aspect-ratio: 4 / 1; max-width: 100%; font-size: 90%; font-weight: bold;" class="charts-css reverse column show-primary-axis show-data-axes data-spacing-5 show-labels">
      <tbody>
        {#each x_chart as i}
        <tr>
          <th scope="row"> {i} </th>
          {#if costs[i]}
          <td style="--size: calc({costs[i][0]+costs[i][1]} / {maxcost_total}); --color: rgba(117 64 191 / 75%); color: #fff"> {costs[i][0]+costs[i][1]} </td>
          {/if}
        </tr>
        {/each}
      </tbody>
    </table>
    {/if}
  </div>
  <div class="col col-side">
    <table style="--aspect-ratio: 2 / 1; max-width: 300px; width: 100%; font-size: 90%; font-weight: bold" class="charts-css reverse column show-primary-axis show-data-axes data-spacing-5 show-labels">
      <tbody>
        {#each Object.entries(colors) as [color, count] }
        <tr>
          <th scope="row"> <span class={`color color-${color}`}></span> </th>
          <td class={`bg-${color}`} style="--size: calc( {count} / {maxcolor} )"> {#if count}{count}{/if} </td>
        </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
