import { writeFile } from "fs/promises";
import puppeteer, { ElementHandle, Page } from "puppeteer";

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
            case "square bombflagged":
              return { type: "bomb" } as const;
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

const doMove = async (
  board: ReturnType<typeof parseBoard> extends PromiseLike<infer U> ? U : never,
  turn: number
) => {
  // If it's the first turn, just click a random element.
  if (turn === 1) {
    const randomSquare = board[Math.floor(Math.random() * board.length)]!;
    await randomSquare.handle.click();
    console.log(
      "First turn, clicked random element!",
      randomSquare.x,
      randomSquare.y
    );
    return;
  }

  let hasChanged = false;

  // Look for squares with numbers and the same number of open or flagged squares.
  for (const { state, x, y } of board) {
    if (state.type !== "open" || state.count < 1) {
      continue;
    }

    const adjacentBlankSquares = board.filter(
      (e) =>
        e.x >= x - 1 &&
        e.x <= x + 1 &&
        e.y >= y - 1 &&
        e.y <= y + 1 &&
        !(e.x === x && e.y === y) &&
        (e.state.type === "blank" || e.state.type === "bomb")
    );
    // There's the same number of adjacent non-open squares as the number, which
    // means everything around the current position is a bomb. Mark positions
    // not already marked as a bomb.
    if (state.count === adjacentBlankSquares.length) {
      for (const adjacent of adjacentBlankSquares.filter(
        (e) => e.state.type === "blank"
      )) {
        await adjacent.handle.click({ button: "right" });
        hasChanged = true;
      }
    }
    if (state.count > adjacentBlankSquares.length) {
      throw new Error(
        "BUG, the number of adjacent bombs is greater than the number of blank fields."
      );
    }
  }

  // TODO: Implement various other strategies for determining safe actions to
  // do without resorting to random moves.

  // If something changed, just click all the open squares with numbers on it,
  // to see if we can trigger a valid move.
  if (hasChanged) {
    console.log(
      "Something changed, clicking all open squares with numbers on it"
    );
    for (const e of board.filter(
      (e) => e.state.type === "open" && e.state.count > 0
    )) {
      await e.handle.click();
    }
  }

  // All hope is lost, just click something random.
  if (!hasChanged) {
    const randomSquare = board[Math.floor(Math.random() * board.length)]!;
    console.warn(
      "No safe moves, clicking random square:",
      randomSquare.x,
      randomSquare.y
    );
    await randomSquare.handle.click();
  }
};

const main = async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  let page: Page | undefined;

  const writeFailureScreenshot = async () => {
    if (page != null) {
      console.log("Fail, writing screenshot as fail.png!");
      await writeFile("./fail.png", await page.screenshot());
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
