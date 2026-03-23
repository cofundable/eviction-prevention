<script lang="ts">
  let name = $state("");
  let email = $state("");
  let message = $state("");
  let intent = $state("collaborate");
  let honeypot = $state(""); // spam trap
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

  const INTENTS = [
    { value: "collaborate", label: "Collaborate on this project" },
    { value: "data-issue", label: "Report a data issue" },
    { value: "data-access", label: "Request data access" },
    { value: "other", label: "Other" },
  ];

  async function handleSubmit(e: Event) {
    e.preventDefault();
    console.log("[ContactForm] submit fired, honeypot:", honeypot);
    if (honeypot) return; // silently drop spam
    status = "submitting";
    errorMsg = "";

    // API URL: https://api.baserow.io/api/database/rows/table/898355/
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, intent, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status = "success";
      name = "";
      email = "";
      message = "";
      intent = "collaborate";
    } catch (err) {
      status = "error";
      errorMsg = "Something went wrong. Please try again or email us directly.";
      console.error(err);
    }
  }
</script>

<form class="contact-form" onsubmit={handleSubmit} novalidate>
  <!-- Honeypot -->
  <input
    type="text"
    name="_trap"
    bind:value={honeypot}
    autocomplete="off"
    tabindex="-1"
    aria-hidden="true"
    class="honeypot"
  />

  <div class="field">
    <label for="cf-name">Name</label>
    <input id="cf-name" type="text" bind:value={name} required autocomplete="name" />
  </div>

  <div class="field">
    <label for="cf-email">Email</label>
    <input id="cf-email" type="email" bind:value={email} required autocomplete="email" />
  </div>

  <div class="field">
    <label for="cf-intent">I want to…</label>
    <select id="cf-intent" bind:value={intent}>
      {#each INTENTS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="cf-message">Message</label>
    <textarea id="cf-message" bind:value={message} rows="5" required></textarea>
  </div>

  {#if status === "success"}
    <div class="toast toast--success" role="status">
      Thanks! We'll be in touch.
    </div>
  {:else if status === "error"}
    <div class="toast toast--error" role="alert">
      {errorMsg}
    </div>
  {/if}

  <button type="submit" class="submit-btn" disabled={status === "submitting"}>
    {status === "submitting" ? "Sending…" : "Send message"}
  </button>
</form>

<style>
  .contact-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 540px;
  }

  .honeypot {
    position: absolute;
    left: -9999px;
    opacity: 0;
    pointer-events: none;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-heading);
  }

  input,
  select,
  textarea {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    color: var(--color-text-primary);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-sm);
    padding: var(--space-3) var(--space-4);
    width: 100%;
    transition: border-color var(--transition-fast);
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--color-amber-500);
    box-shadow: 0 0 0 3px rgba(212, 168, 67, 0.15);
  }

  textarea {
    resize: vertical;
    min-height: 120px;
  }

  .submit-btn {
    align-self: flex-start;
    background: var(--color-amber-600);
    color: white;
    border: none;
    border-radius: var(--border-radius-sm);
    padding: var(--space-3) var(--space-8);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--color-amber-400);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toast {
    padding: var(--space-4);
    border-radius: var(--border-radius-sm);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
  }

  .toast--success {
    background: #f0fdf4;
    border: 1px solid #86efac;
    color: #166534;
  }

  .toast--error {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    color: #991b1b;
  }
</style>
