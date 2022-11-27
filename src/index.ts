import { writeFile } from "fs/promises";
import puppeteer, { ElementHandle, Page } from "puppeteer";

const START_URL = "https://minesweeperonline.com/";

const startNewGame = async (page: Page) => {
  await page.goto(START_URL, {
    waitUntil: "networkidle2",
  });
  const game = await page.waitForSelector("#game", {
    timeout: 5_000,
  });
  if (game == null) {
    throw new Error("Could not find game on page");
  }
  return game;
};

const parseBoard = async (game: ElementHandle) =>
  await game.$$(".square").then((squares) =>
    Promise.all(
      squares.map(async (square) => {
        const data = await square.evaluate((e) => ({
          className: e.className as string,
          id: e.id as string,
        }));
        const [x, y] = data.id.split("_").map((s) => parseInt(s));
        if (x == null || isNaN(x) || y == null || isNaN(y)) {
          throw new Error(
            `Could not parse x and y from ${data.id} -- x: ${x}, y: ${y}`
          );
        }
        const state = (() => {
          switch (data.className) {
            case "square blank":
              return { type: "blank" } as const;
            case "square open0":
              return { type: "open", count: 0 } as const;
            case "square open1":
              return { type: "open", count: 1 } as const;
            case "square open2":
              return { type: "open", count: 2 } as const;
            case "square open3":
              return { type: "open", count: 3 } as const;
            case "square open4":
              return { type: "open", count: 4 } as const;
            case "square open5":
              return { type: "open", count: 5 } as const;
            case "square bombdeath":
              throw new Error("You died!");
            default:
              throw new TypeError(`Unknown class name: ${data.className}`);
          }
        })();
        return { x, y, state, handle: square };
      })
    )
  );

const main = async () => {
  const browser = await puppeteer.launch({
    headless: process.env["NODE_ENV"] !== "production",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let page: Page | undefined;
  try {
    page = await browser.newPage();
    const game = await startNewGame(page);
    console.log("started new game");

    // Loop until we've solved the thing or failed the game.
    for (let turn = 1; ; turn++) {
      // Parse the board to determine the current state.
      console.log("starting loop", turn);
      const board = await parseBoard(game);

      // If it's the first turn, just click a random element.
      if (turn === 1) {
        const randomSquare = board[Math.floor(Math.random() * board.length)]!;
        await randomSquare.handle.click();
        console.log(
          "First turn, clicked random element!",
          randomSquare.x,
          randomSquare.y
        );
        continue;
      }

      // Iterate on all the elemnts and decide on whether to mark a bomb or click a field.
      throw new Error("TODO: do something here :)");
    }
  } catch (error) {
    console.error(error);
    if (page != null) {
      console.log("writing hest!");
      await writeFile("./hest.png", await page.screenshot());
    }
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
