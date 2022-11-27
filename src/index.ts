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
              return { type: "flag" } as const;
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
    console.log(
      "First turn, clicking random element!",
      randomSquare.x,
      randomSquare.y
    );
    await randomSquare.handle.click();
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
        (e.state.type === "blank" || e.state.type === "flag")
    );
    // There's the same number of adjacent non-open squares as the number, which
    // means everything around the current position is a bomb. Mark positions
    // not already marked as a bomb.
    if (state.count === adjacentBlankSquares.length) {
      for (const adjacent of adjacentBlankSquares.filter(
        (e) => e.state.type === "blank"
      )) {
        await adjacent.handle.click({
          button: "right",
          delay: 100,
          offset: { x: 2, y: 2 },
        });
        console.log(
          "  Flagged position: ",
          adjacent.x,
          adjacent.y,
          adjacent.state
        );
        hasChanged = true;
      }
    }
    if (state.count > adjacentBlankSquares.length) {
      throw new Error(
        "BUG, the number of adjacent bombs is greater than the number of blank fields."
      );
    }
  }

  // Look for open fields with numbers, where there's the same number of
  // flagged bombs, and click on any excess adjacent blank squares.
  for (const { state, x, y } of board) {
    if (state.type !== "open" || state.count < 1) {
      continue;
    }
    const adjacentSquares = board.filter(
      (e) =>
        e.x >= x - 1 &&
        e.x <= x + 1 &&
        e.y >= y - 1 &&
        e.y <= y + 1 &&
        !(e.x === x && e.y === y)
    );

    // Determine if the number of blank squares match the number - any flagged
    // squares. If so, click the adjacent blank squares.
    if (
      state.count -
        adjacentSquares.filter((e) => e.state.type === "flag").length ===
      adjacentSquares.filter((e) => e.state.type === "blank").length
    ) {
      for (const adjacentBlank of adjacentSquares.filter(
        (e) => e.state.type === "blank"
      )) {
        hasChanged = true;
        await adjacentBlank.handle.click();
        console.log(
          "  Clicked square due to match in number and flags:",
          adjacentBlank.x,
          adjacentBlank.y,
          adjacentBlank.state
        );
      }
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
