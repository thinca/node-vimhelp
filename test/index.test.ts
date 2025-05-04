import {describe, it, expect} from "vitest";

import * as index from "../src";

describe("vimhelp", () => {
  describe("index", () => {
    it("has VimHelp class", () => {
      expect(index).toHaveProperty("VimHelp");
      expect(typeof index.VimHelp).toBe("function");
    });
    it("has PluginManager class", () => {
      expect(index).toHaveProperty("PluginManager");
      expect(typeof index.VimHelp).toBe("function");
    });
    it("has ExecError class", () => {
      expect(index).toHaveProperty("ExecError");
      expect(typeof index.VimHelp).toBe("function");
    });
  });
});
