<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn } from "$lib/stores";
  import Login from "$lib/components/Login.svelte";
  import AppShell from "$lib/components/AppShell.svelte";

  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });
</script>

{#if !mounted}
  <div class="flex items-center justify-center h-screen">
    <span class="loading loading-ring loading-lg text-primary"></span>
  </div>
{:else if $isLoggedIn}
  <AppShell />
{:else}
  <Login />
{/if}
