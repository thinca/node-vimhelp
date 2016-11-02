const {expect} = require("chai");
const proxyquire = require("proxyquire");
const execVim = require("../lib/exec_vim");
let execVimStub = execVim;
const VimHelp = proxyquire("../lib/vimhelp", {"./exec_vim": (...args) => execVimStub(...args)});

process.on("unhandledRejection", (reason) => {
  console.log(reason);
});

const makeReject = Promise.reject.bind(Promise);

describe("vimhelp", () => {
  describe("VimHelp", () => {
    let vimhelp;
    beforeEach(() => {
      vimhelp = new VimHelp();
    });
    describe(".search()", () => {
      const hijackExecVim = () => {
        before(() => {
          execVimStub = (vimBin, commands) => commands;
        });
        after(() => {
          execVimStub = execVim;
        });
      };

      it("returns Promise object", () => {
        expect(vimhelp.search("help")).to.be.instanceof(Promise);
      });

      describe("the result", () => {
        // XXX: These test may fail when Vim's help will be updated.
        it("is a text from Vim's help", () => {
          return vimhelp.search("help").then((helpText) => {
            expect(helpText).to.include("*help*");
          });
        });

        it("keeps the whitespaces of head", () => {
          return vimhelp.search("G").then((helpText) => {
            expect(helpText).to.match(/^\s/);
          });
        });

        it("doesn't have the blank chars in tail", () => {
          return vimhelp.search("G").then((helpText) => {
            expect(helpText).to.not.match(/\n$/);
          });
        });

        it("contains a range of before of a next tag from a tag", () => {
          return vimhelp.search("CTRL-J").then((helpText) => {
            const lines = helpText.split("\n");
            expect(lines).to.have.lengthOf(5);
            expect(lines[0]).to.include("*j*");
          });
        });

        it("can treat a tag at the head of file", () => {
          return vimhelp.search("helphelp.txt").then((helpText) => {
            expect(helpText).to.include("*helphelp.txt*");
          });
        });

        it("does not contain separator", () => {
          return vimhelp.search("o_CTRL-V").then((helpText) => {
            expect(helpText).to.not.include("===");
          });
        });

        it("can separate section when the line ends with >", () => {
          return vimhelp.search("E32").then((helpText) => {
            expect(helpText).to.include("E32");
            expect(helpText).to.not.include("E141");
          });
        });

        it("can handle a tag that is placed to head of line", () => {
          return vimhelp.search("[:alpha:]").then((helpText) => {
            const lines = helpText.split("\n");
            expect(lines).to.have.lengthOf(1);
            expect(helpText).to.include("[:alpha:]");
            expect(helpText).to.not.include("[:blank:]");
          });
        });
      });

      it("removes extra commands", () => {
        return vimhelp.search("help\nenew\nput ='abc'\np\nqall!").then((helpText) => {
          expect(helpText).to.include("*help*");
        });
      });

      it("can not execute extra commands by |", () => {
        return vimhelp.search("help|enew").then(makeReject, (error) => {
          expect(error).to.have.property("errorText")
            .that.to.match(/^E149:.*helpbarenew/);
        });
      });

      context("when the help does not exist", () => {
        it("throws error", () => {
          return vimhelp.search("never-never-exist-help").then(makeReject, (error) => {
            expect(error.errorText).to.match(/^E149:/);
          });
        });
      });

      context("when rtp provider is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.setRTPProvider(() => ["/path/to/plugin"]);
        });
        it("is set rtp from provider", () => {
          const commands = vimhelp.search("word");
          expect(commands).to.include("set runtimepath+=/path/to/plugin");
        });
      });

      context("when helplang is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.helplang = ["ja", "en"];
        });
        it("sets 'helplang' options", () => {
          const commands = vimhelp.search("word");
          expect(commands).to.include("set helplang=ja,en");
        });
      });
    });

    describe(".setRTPProvider()", () => {
      let provider;
      beforeEach(() => {
        provider = () => ["/path/to/plugin"];
      });
      it("sets a rtp provider", () => {
        vimhelp.setRTPProvider(provider);
        expect(vimhelp.rtpProvider).to.eql(provider);
      });
    });
  });
});
