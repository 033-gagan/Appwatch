function createAutoLaunchService({ app }) {
  function setAutoLaunch(enable) {
    app.setLoginItemSettings({ openAtLogin: enable, name: 'AppWatch' });
  }

  function getAutoLaunch() {
    return app.getLoginItemSettings().openAtLogin;
  }

  return {
    getAutoLaunch,
    setAutoLaunch
  };
}

module.exports = { createAutoLaunchService };
