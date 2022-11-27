import type { parseBoard } from "./parse-board";

export const doMove = async (
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
