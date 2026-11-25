declare module "json-kifu-format" {
  import * as Shogi from "shogi.js";

  export namespace Formats {
    export type Color = 0 | 1; // 0: Sente (Black), 1: Gote (White)
    export type Kind =
      | "FU"
      | "KY"
      | "KE"
      | "GI"
      | "KI"
      | "KA"
      | "HI"
      | "OU"
      | "TO"
      | "NY"
      | "NK"
      | "NG"
      | "UM"
      | "RY";

    export interface Place {
      x: number; // 1-9
      y: number; // 1-9
    }

    export interface MoveMove {
      color: Color;
      from?: Place;
      to: Place;
      piece: Kind;
      same?: boolean;
      promote?: boolean;
      capture?: Kind;
      relative?: string;
    }

    export interface MoveFormat {
      comments?: string[];
      move?: MoveMove;
      time?: {
        now?: { m: number; s: number };
        total?: { h: number; m: number; s: number };
      };
      special?: string;
      forks?: MoveFormat[][];
    }

    export interface JSONKifuFormat {
      header: Record<string, string>;
      initial?: {
        preset: string;
        data?: unknown;
      };
      moves: MoveFormat[];
    }
  }

  export interface ForkPointer {
    te: number;
    forkIndex: number;
  }

  export class JKFPlayer {
    public shogi: Shogi.Shogi;
    public kifu: Formats.JSONKifuFormat;
    public tesuu: number;
    public forks: Array<{ te: number; moves: Formats.MoveFormat[] }>;
    public forkPointers: ForkPointer[];

    constructor(kifu: Formats.JSONKifuFormat);
    public static parse(kifuString: string, ext?: string): JKFPlayer;
    public static parseKIF(kifuString: string): JKFPlayer;
    public static parseCSA(kifuString: string): JKFPlayer;
    public static parseKI2(kifuString: string): JKFPlayer;

    public forward(): boolean;
    public backward(): boolean;
    public goto(tesuu: number, forkPointers?: ForkPointer[]): void;
    public go(tesuu: number): void;
    public forkAndForward(forkIndex: number): boolean;
    public inputMove(move: {
      from?: { x: number; y: number };
      to: { x: number; y: number };
      piece?: string;
      promote?: boolean;
    }): boolean;
    public getMaxTesuu(): number;
    public getForkPointers(): ForkPointer[];
    public getState(): unknown;
    public getBoard(): unknown;
    public getComments(tesuu?: number): string[];
    public getMove(tesuu?: number): Formats.MoveMove | undefined;
    public getMoveFormat(tesuu?: number): Formats.MoveFormat;
    public getReadableKifu(tesuu?: number): string;
    public getReadableForkKifu(tesuu?: number): string[];
    public getNextFork(tesuu?: number): Formats.MoveFormat[][];
    public getReadableKifuState(): Array<{
      kifu: string;
      forks: string[];
      comments: string[];
      moveFormat: Formats.MoveFormat;
    }>;
    public canMove(from: { x: number; y: number }, to: { x: number; y: number }): boolean;
  }

  export namespace Parsers {
    export function parseKIF(kifu: string): Formats.JSONKifuFormat;
    export function parseCSA(kifu: string): Formats.JSONKifuFormat;
    export function parseKI2(kifu: string): Formats.JSONKifuFormat;
  }

  export { Shogi };
}
