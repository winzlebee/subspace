<script lang="ts">
  import { login, register, uploadFile } from "$lib/api";
  import { authToken, currentUser } from "$lib/stores";
  import { APP_NAME } from "$lib/config";

  let username = $state("");
  let password = $state("");
  let isRegister = $state(false);
  let error = $state("");
  let loading = $state(false);
  let feetPhoto: File | null = $state(null);

  async function handleSubmit() {
    error = "";
    loading = true;
    try {
      let avatar_url: string | undefined;
      if (isRegister) {
        if (!feetPhoto) {
          throw new Error(
            "You must upload a photo of your feet to register! 🦶📸",
          );
        }
        const uploadRes = await uploadFile(feetPhoto);
        avatar_url = uploadRes.url;
        const res = await register(username, password, avatar_url);
        authToken.set(res.token);
        currentUser.set(res.user);
      } else {
        const res = await login(username, password);
        authToken.set(res.token);
        currentUser.set(res.user);
      }
    } catch (e: any) {
      error = e.message || "Something went wrong";
    } finally {
      loading = false;
    }
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      feetPhoto = input.files[0];
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
          {APP_NAME}
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

        {#if isRegister}
          <div class="form-control w-full">
            <label class="label" for="feet-photo">
              <span class="label-text font-bold text-lg"
                >Proof of Feet 🦶📸</span
              >
              <span class="label-text-alt text-error text-xs">Required</span>
            </label>
            <div
              class="border-2 border-dashed border-primary/50 rounded-lg p-4 text-center hover:bg-base-200 transition-colors cursor-pointer relative"
            >
              <input
                id="feet-photo"
                type="file"
                accept="image/*"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onchange={handleFileChange}
                required
              />
              {#if feetPhoto}
                <div
                  class="flex items-center justify-center gap-2 text-success font-medium"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {feetPhoto.name}
                </div>
              {:else}
                <div
                  class="flex flex-col items-center gap-2 text-base-content/70"
                >
                  <span class="text-3xl">🦶</span>
                  <span class="text-sm font-medium"
                    >Upload a clear photo of your feet</span
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}

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
