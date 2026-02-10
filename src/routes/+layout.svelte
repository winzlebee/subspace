<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { theme } from "$lib/stores";
  import TitleBar from "$lib/components/TitleBar.svelte";

  let { children } = $props();

  onMount(() => {
    document.documentElement.setAttribute("data-theme", $theme);
  });
</script>

<div class="h-screen w-screen overflow-hidden bg-base-200 flex flex-col">
  <TitleBar />
  <div class="flex-1 overflow-hidden">
    {@render children()}
  </div>
</div>
