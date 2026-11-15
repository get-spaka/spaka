// A bare Electron app for the probe (../probe.ts): no window of its own and
// none of the switches the app's checks set (env.background in
// apps/desktop/src/main/index.ts), so a hidden window behaves as the maker's
// window does when it is minimized or covered.
const { app } = require("electron");

app.on("window-all-closed", () => {});
app.whenReady().then(() => {});
