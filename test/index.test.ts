import {expect} from "chai";

import * as index from "../src";

describe("vimhelp", () => {
  describe("index", () => {
    it("has VimHelp class", () => {
      expect(index).to.have.property("VimHelp").and.a("function");
    });
    it("has PluginManager class", () => {
      expect(index).to.have.property("PluginManager").and.a("function");
    });
    it("has ExecError class", () => {
      expect(index).to.have.property("ExecError").and.a("function");
    });
  });
});
