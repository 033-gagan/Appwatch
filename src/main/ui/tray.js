function createTrayManager({ Tray, Menu, nativeImage, runtime, actions }) {
  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: 'Open AppWatch', click: () => actions.showMainWindow() },
      { label: 'Toggle Float Widget', click: () => actions.toggleFloat() },
      { type: 'separator' },
      { label: 'Quit', click: () => actions.quit() }
    ]);
  }

  function createTray() {
    const img = nativeImage.createEmpty();
    runtime.tray = new Tray(img);
    runtime.tray.setToolTip('AppWatch');
    runtime.tray.setContextMenu(buildMenu());
    runtime.tray.on('click', () => actions.showMainWindow());
    return runtime.tray;
  }

  function refreshTrayMenu() {
    if (runtime.tray) runtime.tray.setContextMenu(buildMenu());
  }

  return {
    createTray,
    refreshTrayMenu
  };
}

module.exports = { createTrayManager };
