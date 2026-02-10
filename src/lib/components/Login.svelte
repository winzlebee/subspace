<script lang="ts">
  import { login, register } from "$lib/api";
  import { authToken, currentUser } from "$lib/stores";

  let username = $state("");
  let password = $state("");
  let isRegister = $state(false);
  let error = $state("");
  let loading = $state(false);

  async function handleSubmit() {
    error = "";
    loading = true;
    try {
      const fn = isRegister ? register : login;
      const res = await fn(username, password);
      authToken.set(res.token);
      currentUser.set(res.user);
    } catch (e: any) {
      error = e.message || "Something went wrong";
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center justify-center h-screen bg-base-300">
  <div class="card bg-base-100 shadow-2xl w-full max-w-md">
    <div class="card-body">
      <!-- Logo area -->
      <div class="text-center mb-4">
        <h1
          class="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
        >
          Subspace
        </h1>
        <p class="text-base-content/60 text-sm mt-1">
          {isRegister ? "Create your account" : "Welcome back"}
        </p>
      </div>

      {#if error}
        <div class="alert alert-error text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span>{error}</span>
        </div>
      {/if}

      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        class="space-y-4"
      >
        <fieldset class="fieldset">
          <label class="fieldset-label" for="username">Username</label>
          <input
            id="username"
            type="text"
            class="input input-bordered w-full"
            bind:value={username}
            placeholder="Enter username"
            required
          />
        </fieldset>

        <fieldset class="fieldset">
          <label class="fieldset-label" for="password">Password</label>
          <input
            id="password"
            type="password"
            class="input input-bordered w-full"
            bind:value={password}
            placeholder="Enter password"
            required
          />
        </fieldset>

        <button class="btn btn-primary w-full" type="submit" disabled={loading}>
          {#if loading}
            <span class="loading loading-spinner loading-sm"></span>
          {/if}
          {isRegister ? "Create Account" : "Sign In"}
        </button>
      </form>

      <div class="divider text-xs">OR</div>

      <button
        class="btn btn-ghost btn-sm"
        onclick={() => {
          isRegister = !isRegister;
          error = "";
        }}
      >
        {isRegister
          ? "Already have an account? Sign in"
          : "Need an account? Register"}
      </button>
    </div>
  </div>
</div>
