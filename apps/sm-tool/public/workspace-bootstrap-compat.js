(() => {
  if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") return;

  const picker = window.showDirectoryPicker.bind(window);
  window.showDirectoryPicker = async function compatibleWorkspacePicker(options) {
    const handle = await picker(options);

    try {
      await handle.getDirectoryHandle("Teams");
      const lower = await handle.getDirectoryHandle("teams");
      let lowerHasEntries = false;
      for await (const _entry of lower.entries()) {
        lowerHasEntries = true;
        break;
      }
      if (!lowerHasEntries) {
        await handle.removeEntry("teams", { recursive: true });
      }
    } catch {
      // Fresh workspaces use lowercase teams/. Existing legacy workspaces may use Teams/.
    }

    return handle;
  };
})();
