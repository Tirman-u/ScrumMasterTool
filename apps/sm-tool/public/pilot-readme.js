(() => {
  const BUTTON_ID = "pilot-readme-nav-button";
  const VIEW_ID = "pilot-readme-view";
  const STYLE_ID = "pilot-readme-style";

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${VIEW_ID} {
        position: fixed;
        z-index: 80;
        overflow: auto;
        background: #f8fafc;
        color: #0f172a;
        padding: 28px 34px 48px;
        font-family: inherit;
      }
      #${VIEW_ID}[hidden] { display: none !important; }
      .pilot-readme-wrap { max-width: 980px; margin: 0 auto; }
      .pilot-readme-hero {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        padding: 28px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(15,23,42,.04);
      }
      .pilot-readme-eyebrow {
        margin: 0 0 6px;
        color: #4f46e5;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .pilot-readme-hero h1 { margin: 0; font-size: 30px; line-height: 1.12; letter-spacing: -.025em; }
      .pilot-readme-hero p { max-width: 680px; margin: 10px 0 0; color: #64748b; line-height: 1.55; }
      .pilot-readme-close {
        flex: 0 0 auto;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #334155;
        border-radius: 8px;
        padding: 9px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .pilot-readme-requirements {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        margin: 14px 0 24px;
      }
      .pilot-readme-requirements div {
        padding: 12px 14px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }
      .pilot-readme-requirements span { display: block; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .pilot-readme-requirements strong { display: block; margin-top: 3px; font-size: 13px; }
      .pilot-readme-steps { display: grid; gap: 12px; }
      .pilot-readme-step {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 14px;
        padding: 20px 22px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
      }
      .pilot-readme-number {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: #eef2ff;
        color: #4f46e5;
        font-weight: 800;
      }
      .pilot-readme-step h2 { margin: 3px 0 8px; font-size: 17px; }
      .pilot-readme-step p { margin: 6px 0; color: #475569; line-height: 1.55; }
      .pilot-readme-step ol, .pilot-readme-step ul { margin: 8px 0 8px 20px; padding: 0; color: #475569; line-height: 1.65; }
      .pilot-readme-code {
        margin: 10px 0;
        padding: 11px 13px;
        overflow-x: auto;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 8px;
        font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: pre-wrap;
      }
      .pilot-readme-note {
        margin-top: 10px;
        padding: 10px 12px;
        border-left: 3px solid #4f46e5;
        background: #eef2ff;
        color: #3730a3;
        border-radius: 0 7px 7px 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .pilot-readme-warning {
        border-left-color: #d97706;
        background: #fffbeb;
        color: #92400e;
      }
      .pilot-readme-success {
        border-left-color: #16a34a;
        background: #f0fdf4;
        color: #166534;
      }
      .pilot-readme-footer {
        margin-top: 18px;
        padding: 18px 20px;
        color: #64748b;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.55;
      }
      #${BUTTON_ID} svg { flex: 0 0 auto; }
      @media (max-width: 900px) {
        #${VIEW_ID} { padding: 18px 14px 36px; }
        .pilot-readme-hero { padding: 20px; }
        .pilot-readme-hero h1 { font-size: 24px; }
        .pilot-readme-requirements { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 560px) {
        .pilot-readme-hero { display: block; }
        .pilot-readme-close { margin-top: 14px; }
        .pilot-readme-requirements { grid-template-columns: 1fr; }
        .pilot-readme-step { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function createView() {
    let view = document.getElementById(VIEW_ID);
    if (view) return view;

    view = document.createElement("section");
    view.id = VIEW_ID;
    view.hidden = true;
    view.setAttribute("aria-label", "Pilot getting started guide");
    view.innerHTML = `
      <div class="pilot-readme-wrap">
        <header class="pilot-readme-hero">
          <div>
            <div class="pilot-readme-eyebrow">Pilot README</div>
            <h1>Connect your Jira data</h1>
            <p>Follow these steps once to create a local workspace and load Jira data into Scrum Master Tool. After setup, refreshing Jira is much faster.</p>
          </div>
          <button type="button" class="pilot-readme-close">Back to app</button>
        </header>

        <div class="pilot-readme-requirements">
          <div><span>Browser</span><strong>Chrome / Edge</strong></div>
          <div><span>Jira access</span><strong>VPN / internal network</strong></div>
          <div><span>Runtime</span><strong>Node.js 18+</strong></div>
          <div><span>Jira helpers</span><strong>macOS + Windows</strong></div>
        </div>

        <div class="pilot-readme-steps">
          <article class="pilot-readme-step">
            <div class="pilot-readme-number">1</div>
            <div>
              <h2>Create a Jira Personal Access Token</h2>
              <ol>
                <li>Open Jira and sign in.</li>
                <li>Open your profile or account settings.</li>
                <li>Find <strong>Personal Access Tokens</strong> or <strong>Manage personal access tokens</strong>. The exact wording can vary by Jira installation.</li>
                <li>Select <strong>Create token</strong>.</li>
                <li>Name it, for example <strong>Scrum Master Tool</strong>, and choose an expiry date if required.</li>
                <li>Create the token and copy it immediately.</li>
              </ol>
              <div class="pilot-readme-note">Keep the token private. Scrum Master Tool asks for it in Terminal during Jira refresh; do not share it with other users.</div>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">2</div>
            <div>
              <h2>Connect to VPN / internal network</h2>
              <p>If Jira is only available inside your company network, connect to VPN first.</p>
              <p><strong>Quick check:</strong> open Jira in your browser. If Jira is reachable, continue.</p>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">3</div>
            <div>
              <h2>Sign in to Scrum Master Tool</h2>
              <p>Open <strong>pilot.scrummastertool.com</strong> and enter the 5-digit pilot PIN provided to you.</p>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">4</div>
            <div>
              <h2>Create and select a workspace</h2>
              <ol>
                <li>Create an empty folder on your computer, for example <strong>Documents/ScrumMasterTool</strong>.</li>
                <li>Open <strong>Workspace Setup</strong> in the app.</li>
                <li>Choose the folder and allow the browser to read and write it.</li>
                <li>Add your team.</li>
                <li>Add and save the Jira JQL for the team.</li>
              </ol>
              <div class="pilot-readme-code">project = YOUR_PROJECT_KEY</div>
              <div class="pilot-readme-note">Use your team's real Jira project/filter JQL. The JQL must be saved before running the Jira refresh helper.</div>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">5</div>
            <div>
              <h2>Check the generated helper files</h2>
              <p>The web app automatically creates the Jira helper in your workspace:</p>
              <div class="pilot-readme-code">ScrumMasterTool/
├── renew-team.command
├── renew-team.ps1
├── sm-tool/
│   └── jira-pull.mjs
└── teams/
    └── your-team/</div>
              <p>Do not edit these helper files manually.</p>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">6</div>
            <div>
              <h2>Refresh Jira data — macOS</h2>
              <ol>
                <li>Open <strong>Terminal</strong>.</li>
                <li>Type <strong>zsh</strong> followed by one space.</li>
                <li>Drag <strong>renew-team.command</strong> from Finder into the Terminal window.</li>
                <li>Press <strong>Enter</strong>.</li>
              </ol>
              <div class="pilot-readme-code">zsh "/Users/yourname/Documents/ScrumMasterTool/renew-team.command"</div>
              <p>Select the team number when the helper asks:</p>
              <div class="pilot-readme-code">Select team to refresh:
1) TEAM A
2) TEAM B
Team number(s):</div>
              <p>If asked for the Jira URL, enter your Jira base URL, for example:</p>
              <div class="pilot-readme-code">https://jira.company.net</div>
              <p>When prompted for <strong>Jira token:</strong>, paste the Personal Access Token from step 1 and press Enter.</p>
              <div class="pilot-readme-note">Terminal may show nothing while you paste or type the token. This is normal — token input is hidden.</div>
              <p>The helper loads Jira issues and changelog history. Depending on the amount of data, this can take a few minutes.</p>
              <div class="pilot-readme-success pilot-readme-note">Success message: <strong>Jira refresh complete. Return to the web app and refresh workspace data.</strong></div>
              <h2>Refresh Jira data — Windows PowerShell</h2>
              <ol>
                <li>Open <strong>PowerShell</strong> and go to the workspace folder.</li>
                <li>Set the Jira URL and, if needed, the repository path.</li>
                <li>Run <strong>renew-team.ps1</strong>.</li>
              </ol>
              <div class="pilot-readme-code">cd "C:\\Users\\yourname\\Documents\\ScrumMasterTool"
$env:JIRA_URL = "https://jira.example.invalid"
$env:SM_TOOL_REPO_DIR = "C:\\Users\\yourname\\Code\\ScrumMasterTool"
.\\renew-team.ps1</div>
              <p>When prompted for <strong>Jira token:</strong>, paste the Personal Access Token from step 1. The token is entered interactively and is not written to the workspace or helper files.</p>
              <div class="pilot-readme-note">If PowerShell blocks the local script, use <strong>ExecutionPolicy Bypass</strong> for this invocation only. Keep the token private.</div>
            </div>
          </article>

          <article class="pilot-readme-step">
            <div class="pilot-readme-number">7</div>
            <div>
              <h2>Load the refreshed data in the app</h2>
              <ol>
                <li>Return to <strong>pilot.scrummastertool.com</strong>.</li>
                <li>Make sure the same workspace is selected.</li>
                <li>Open the dashboard.</li>
                <li>Select <strong>Recalculate</strong>.</li>
              </ol>
              <p>After recalculation, the dashboard will show the metrics supported by your Jira data, such as Throughput, Cycle Time, SLE, Aging WIP, Bug Ratio, Velocity, Time in Status, Bottleneck and Flow Efficiency when the required source data is available.</p>
            </div>
          </article>
        </div>

        <div class="pilot-readme-footer">
          <strong>Next refresh:</strong> you do not need to recreate the workspace or team. Connect to VPN, run the platform-specific helper — <strong>renew-team.command</strong> on macOS or <strong>renew-team.ps1</strong> in PowerShell on Windows — choose the team(s), enter your Jira token, return to the app and select <strong>Recalculate</strong>.
        </div>
      </div>
    `;
    document.body.appendChild(view);
    view.querySelector(".pilot-readme-close")?.addEventListener("click", hideView);
    return view;
  }

  function positionView() {
    const view = document.getElementById(VIEW_ID);
    if (!view || view.hidden) return;
    const main = document.querySelector(".main-area");
    if (!main) {
      view.style.inset = "0";
      return;
    }
    const rect = main.getBoundingClientRect();
    view.style.top = `${Math.max(0, rect.top)}px`;
    view.style.left = `${Math.max(0, rect.left)}px`;
    view.style.right = "0";
    view.style.bottom = "0";
  }

  function showView() {
    const view = createView();
    view.hidden = false;
    document.getElementById(BUTTON_ID)?.classList.add("active");
    positionView();
    view.scrollTop = 0;
  }

  function hideView() {
    const view = document.getElementById(VIEW_ID);
    if (view) view.hidden = true;
    document.getElementById(BUTTON_ID)?.classList.remove("active");
  }

  function createNavButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = "nav-link";
    button.innerHTML = `
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
      README
    `;
    button.addEventListener("click", () => {
      showView();
      document.querySelector(".left-nav")?.classList.remove("open");
    });
    return button;
  }

  function installNavButton() {
    const nav = document.querySelector("#primary-navigation .nav-links");
    if (!nav || document.getElementById(BUTTON_ID)) return;

    const button = createNavButton();
    const masterAdmin = Array.from(nav.querySelectorAll("button")).find((item) => item.textContent?.includes("Master Admin"));
    if (masterAdmin) nav.insertBefore(button, masterAdmin);
    else nav.appendChild(button);
  }

  installStyles();
  window.addEventListener("resize", positionView);
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const navButton = target.closest("#primary-navigation .nav-links button");
    if (navButton && navButton.id !== BUTTON_ID) hideView();
  }, true);

  // The navigation only exists after pilot login. A low-frequency check avoids
  // observing the React root and keeps this pilot-only helper isolated from app rendering.
  installNavButton();
  window.setInterval(installNavButton, 2000);
})();
