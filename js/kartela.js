const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // FORZAMOS escritorio
  await page.setViewport({
    width: 1400,
    height: 900,
    deviceScaleFactor: 2
  });

  await page.goto("https://larraunpilota.eus/asteko-kartela", {
    waitUntil: "networkidle0"
  });

  await page.screenshot({
    path: "preview-escritorio.jpg",
    clip: {
      x: 0,
      y: 0,
      width: 1200,
      height: 630
    }
  });

  await browser.close();
})();
