<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { theme } from "$lib/stores";
  import { APP_NAME } from "$lib/config";
  import TitleBar from "$lib/components/TitleBar.svelte";

  let { children } = $props();

  onMount(() => {
    document.title = APP_NAME;
    document.documentElement.setAttribute("data-theme", $theme);
    
    // Set viewport height for mobile browsers
    const setViewportHeight = () => {
      // Use window.innerHeight for accurate mobile viewport
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    
    return () => {
      window.removeEventListener('resize', setViewportHeight);
      window.removeEventListener('orientationchange', setViewportHeight);
    };
  });
</script>

<div class="w-screen overflow-hidden bg-base-200 flex flex-col" style="height: var(--app-height);">
  <TitleBar />
  <div class="flex-1 overflow-hidden">
    {@render children()}
  </div>
</div>
