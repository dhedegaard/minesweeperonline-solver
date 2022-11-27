import type { ElementHandle } from "puppeteer";

export const parseBoard = async (game: ElementHandle) =>
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
            case "square open6":
              return { type: "open", count: 6 } as const;
            case "square open7":
              return { type: "open", count: 7 } as const;
            case "square open8":
              return { type: "open", count: 8 } as const;
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
