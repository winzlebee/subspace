<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn } from "$lib/stores";
  import Login from "$lib/components/Login.svelte";
  import AppShell from "$lib/components/AppShell.svelte";
  import Setup from "$lib/components/Setup.svelte";

  let mounted = $state(false);
  let needsSetup = $state(false);

  onMount(() => {
    // Check if server URL is configured
    const stored = localStorage.getItem("subspace_server_url");
    if (!stored) {
      needsSetup = true;
    }
    mounted = true;
  });
</script>

{#if !mounted}
  <div class="flex items-center justify-center h-screen">
    <span class="loading loading-ring loading-lg text-primary"></span>
  </div>
{:else if needsSetup}
  <Setup onComplete={() => (needsSetup = false)} />
{:else if $isLoggedIn}
  <AppShell />
{:else}
  <Login onChangeServer={() => (needsSetup = true)} />
{/if}
