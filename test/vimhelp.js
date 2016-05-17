const {expect} = require("chai");
const {VimHelp} = require("../lib/vimhelp");

describe("vimhelp", () => {
  describe("VimHelp", () => {
    let vimhelp;
    beforeEach(() => {
      vimhelp = new VimHelp();
    });
    describe(".search()", () => {
      it("returns Promise object", () => {
        expect(vimhelp.search("help")).to.be.instanceof(Promise);
      });
      it("searches help from Vim's document", (done) => {
        vimhelp.search("help").then((helpText) => {
          expect(helpText).to.include("*help*");
          done();
        }).catch(done);
      });
      context("when the help does not exist", () => {
        it("throws error", (done) => {
          vimhelp.search("never-never-exist-help").then((helpText) => {
            done(helpText);
          }).catch((error) => {
            expect(error.errorText).to.match(/^E149:/);
            done();
          }).catch(done);
        });
      });
    });
  });
});
