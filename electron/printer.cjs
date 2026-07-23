let escpos, USB;
try {
  escpos = require("escpos");
  USB = require("escpos-usb");
} catch (e) {
  console.error("ESC/POS modules not available:", e.message);
}

let currentPrinter = null;
let connected = false;

function findAndConnect() {
  if (!escpos || !USB) return { ok: false, error: "ESC/POS library not installed" };
  try {
    const device = new USB();
    currentPrinter = new escpos.Printer(device);
    connected = true;
    return { ok: true };
  } catch (e) {
    connected = false;
    return { ok: false, error: e.message || "No USB printer found" };
  }
}

function connectTcp(host, port) {
  if (!escpos) return { ok: false, error: "ESC/POS library not installed" };
  try {
    const device = new escpos.Network(host, port || 9100);
    currentPrinter = new escpos.Printer(device);
    connected = true;
    return { ok: true };
  } catch (e) {
    connected = false;
    return { ok: false, error: e.message };
  }
}

function disconnect() {
  try {
    if (currentPrinter && typeof currentPrinter.close === "function") {
      currentPrinter.close();
    }
  } catch (e) { /* ignore */ }
  currentPrinter = null;
  connected = false;
}

function isConnected() {
  return connected && currentPrinter !== null;
}

function parseAndPrint(text, paperWidthMm) {
  return new Promise((resolve, reject) => {
    if (!currentPrinter) return reject(new Error("No printer connected"));

    const p = currentPrinter;
    const lines = text.split("\n");

    for (const line of lines) {
      let align = "LT";
      if (line.startsWith("[C]")) align = "CT";
      else if (line.startsWith("[R]")) align = "RT";
      p.align(align);

      let content = line.replace(/^\[[CLR]\]/, "");

      const boldOn = /<b>/.test(content);
      const fontBig = /<font size='big'>/.test(content);
      const fontTall = /<font size='tall'>/.test(content);
      const fontSmall = /<font size='small'>/.test(content);

      content = content
        .replace(/<\/?b>/g, "")
        .replace(/<\/?font[^>]*>/g, "");

      if (boldOn) p.bold();
      if (fontBig) p.size(2, 2);
      else if (fontTall) p.size(1, 2);
      else if (fontSmall) p.size(0.5, 0.5);

      p.text(content);

      if (boldOn) p.bold(false);
      if (fontBig || fontTall || fontSmall) p.size(1, 1);
    }

    p.cut();
    p.flush((err) => {
      if (err) reject(err);
      else resolve({ ok: true });
    });
  });
}

module.exports = {
  findAndConnect,
  connectTcp,
  disconnect,
  isConnected,
  parseAndPrint,
};
