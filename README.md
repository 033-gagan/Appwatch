# Appwatch

AppWatch is a desktop application built using Electron that helps users track how much time they spend on different applications. The main idea behind this project is to improve productivity by making users aware of their app usage.

It runs in the background and monitors active applications, showing the time spent on each one in a simple interface. This can be useful for students and professionals who want to reduce distractions and manage their time better.

The project is built using Electron, Node.js, and JavaScript, and can be packaged as a desktop executable.

Overall, AppWatch is a lightweight and easy-to-use tool for tracking digital habits and improving focus.


# AppWatch

> A lightweight Windows desktop app to manually track how much time you spend on any application with a live floating timer, daily usage limits, and analytics charts.

![Electron](https://img.shields.io/badge/Electron-28.0-47b8ff?style=flat-square&logo=electron)
![Platform](https://img.shields.io/badge/Platform-Windows-blue?style=flat-square&logo=windows)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-e8ff47?style=flat-square)

---

## Features

- **Manual app tracking** Add any app by name, start/stop the timer whenever you want
- **Floating widget** A draggable always-on-top timer that stays visible over all your windows
- **Daily limits** Set a daily time limit per app and get a Windows notification when you hit it
- **Analytics** Bar chart, donut chart, and session history to visualize your usage
- **Offline & private** No account, no internet, no background tracking. Data stays on your PC
- **System tray** Runs quietly in the background, accessible from the taskbar tray
- **Auto-launch** Optional setting to start AppWatch automatically when Windows boots

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (LTS recommended)
- npm (comes with Node.js)
- Windows 10 or 11

### Installation (Build from source)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/appwatch.git

# 2. Navigate into the project folder
cd appwatch

# 3. Install dependencies
npm install

# 4. Build the Windows installer
npm run build
```

Then open the `dist/` folder and run:
```
AppWatch Setup 1.0.0.exe
```

This installs AppWatch like any normal Windows app with Start Menu and Desktop shortcuts.

### Run without installing (Portable)

```bash
# Builds a portable folder instead of an installer
npm run build:dir
```

Opens `dist/win-unpacked/` copy this entire folder anywhere and run `AppWatch.exe` directly.

### Run in development mode

```bash
npm start
```

---

## How to Use

1. **Add an app** Click `+ Add App` on the Dashboard, enter the name (e.g. "YouTube"), pick an icon and category
2. **Start tracking** Hit Start on any app card when you open that app
3. **Stop tracking** Hit Stop when you're done
4. **Floating widget** Click ` Float: OFF` on the dashboard to enable the always-on-top timer widget. Drag it anywhere on screen.
5. **Set daily limits** Go to the **Limits** tab, set minutes per day, toggle it ON. You'll get a desktop notification when exceeded.
6. **View analytics** Go to the **Analytics** tab to see usage charts and session history
7. **Auto-start with Windows** Go to **Settings** enable "Launch at Windows startup"

---

## Floating Widget

The floating widget stays on top of all your windows so you always see the live timer.

- Shows the **app icon + name + live ticking timer**
- **Drag** it anywhere on screen
- **Hover** over it to reveal controls:
- `` Open main AppWatch window
- `` Stop tracking
- `` Hide the widget
- Glows yellow when actively tracking, turns grey when stopped

---

## Project Structure

```
appwatch/
src/
main.js Electron main process (windows, tray, IPC, data)
index.html Main app UI (dashboard, charts, limits, settings)
float.html Floating overlay widget
assets/
icon.png App icon (PNG)
icon.ico App icon (ICO for Windows)
dist/ Built installer output (generated, not committed)
package.json
README.md
```

---

## Data Storage

All your data is saved locally at:

```
C:\Users\YourName\AppData\Roaming\appwatch\appwatch-data.json
```

- Data **persists** across app updates and restarts
- Timers **auto-reset** at midnight each day
- Session history is kept for the last 200 sessions
- Uninstalling the app does **not** delete your data file

To back up your data, just copy that JSON file somewhere safe.

---

## Built With

| Technology | Purpose |
|---|---|
| [Electron](https://electronjs.org/) | Desktop app framework |
| [electron-builder](https://www.electron.build/) | Windows installer packaging |
| HTML / CSS / JavaScript | UI and app logic |
| Space Mono + DM Sans | Typography (Google Fonts) |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Run in development mode |
| `npm run build` | Build Windows installer (.exe) |
| `npm run build:dir` | Build portable folder (no installer) |

---

## Planned Features

- [ ] Auto-detect active window (no manual start needed)
- [ ] Weekly usage reports
- [ ] Export data as CSV
- [ ] Windows startup launch on install by default
- [ ] App categories summary view
- [ ] Dark / Light theme toggle

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License see the [LICENSE](LICENSE) file for details.

---

## FAQ

**Q: Does AppWatch track my apps automatically?** 
A: No it only tracks when you manually press Start. This is by design so you stay in control.

**Q: Will my data be lost if I reinstall?** 
A: No. Your data lives in `%APPDATA%\appwatch\` and is not touched by the installer or uninstaller.

**Q: Does it work on Mac or Linux?** 
A: The code is Electron-based and could work cross-platform, but the current build config targets Windows only.

**Q: Does it need internet?** 
A: No. AppWatch works fully offline. No accounts, no telemetry, no data sent anywhere.
