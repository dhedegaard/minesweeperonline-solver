import { mkdir, rm, writeFile } from "fs/promises";
import puppeteer, { Page } from "puppeteer";
import { doMove } from "./do-move";
import { parseBoard } from "./parse-board";

const START_URL = "https://minesweeperonline.com/";

const startNewGame = async (page: Page) => {
  await page.goto(START_URL);
  const game = await page.waitForSelector("#game", {
    timeout: 5_000,
  });
  if (game == null) {
    throw new Error("Could not find game on page");
  }
  return game;
};

const main = async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  let page: Page | undefined;

  await rm("output", { recursive: true });
  await mkdir("output", { recursive: true });

  const writeFailureScreenshot = async () => {
    if (page != null) {
      console.log("Fail, writing screenshot as fail.png!");
      await writeFile("output/fail.png", await page.screenshot());
    }
  };

  process.on("SIGINT", () => {
    console.log("SIGINT, writing screenshot as fail.png!");
    writeFailureScreenshot().then(() => process.exit(1));
  });
  process.on("SIGNTERM", () => {
    console.log("SIGTERM, writing screenshot as fail.png!");
    writeFailureScreenshot().then(() => process.exit(1));
  });

  try {
    page = await browser.newPage();
    const game = await startNewGame(page);
    console.log("started new game");

    // Loop until we've solved the thing or failed the game.
    for (let turn = 1; ; turn++) {
      // Parse the board to determine the current state.
      console.log("starting loop", turn);

      // Write the board as png, except before the first turn.
      if (turn > 1) {
        const turnPng = `output/turn${turn.toString().padStart(3, "0")}.png`;
        writeFile(turnPng, await page.screenshot()).then(() =>
          console.log("  wrote", turnPng, "before parse")
        );
      }

      const board = await parseBoard(game);
      console.log("  parsed board!");
      await doMove(board, turn);
    }
  } catch (error) {
    console.error(error);
    await writeFailureScreenshot();
    throw error;
  } finally {
    console.log("closing");
    browser.close();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
