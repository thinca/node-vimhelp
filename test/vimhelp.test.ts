import {expect} from "chai";
import proxyquire from "proxyquire";
import {execVim} from "../src/exec_vim";
import {VimHelp, RTPProvider} from "../src/vimhelp";

let execVimStub = execVim;
const VimHelpProxied = proxyquire("../src/vimhelp", {
  "./exec_vim": {
    execVim: (vimBin: string, commands: string[]) => execVimStub(vimBin, commands),
  }
}).VimHelp as typeof VimHelp;

process.on("unhandledRejection", (reason) => {
  console.log(reason);
});

describe("vimhelp", () => {
  describe("VimHelp", () => {
    let vimhelp: VimHelp;

    beforeEach(() => {
      vimhelp = new VimHelpProxied();
    });
    describe(".search()", () => {
      function hijackExecVim() {
        before(() => {
          execVimStub = async (_vimBin, commands) => commands.join("\n");
        });
        after(() => {
          execVimStub = execVim;
        });
      }

      it("returns Promise object", () => {
        expect(vimhelp.search("help")).to.be.instanceof(Promise);
      });

      describe("the result", () => {
        // XXX: These test may fail when Vim's help will be updated.
        it("is a text from Vim's help", async () => {
          const helpText = await vimhelp.search("help");
          expect(helpText).to.include("*help*");
        });

        it("keeps the whitespaces of head", async () => {
          const helpText = await vimhelp.search("G");
          expect(helpText).to.match(/^\s/);
        });

        it("doesn't have the blank chars in tail", async () => {
          const helpText = await vimhelp.search("G");
          expect(helpText).to.not.match(/\n$/);
        });

        it("contains a range of before of a next tag from a tag", async () => {
          const helpText = await vimhelp.search("CTRL-J");
          const lines = helpText.split("\n");
          expect(lines).to.have.lengthOf(5);
          expect(lines[0]).to.include("*j*");
        });

        it("can treat a tag at the head of file", async () => {
          const helpText = await vimhelp.search("helphelp.txt");
          expect(helpText).to.include("*helphelp.txt*");
        });

        it("does not contain separator", async () => {
          const helpText = await vimhelp.search("o_CTRL-V");
          expect(helpText).to.not.include("===");
        });

        it("can separate section when the line ends with >", async () => {
          const helpText = await vimhelp.search("E32");
          expect(helpText).to.include("E32");
          expect(helpText).to.not.include("E141");
        });

        it("can handle a tag that is placed to head of line", async () => {
          const helpText = await vimhelp.search("[:alpha:]");
          const lines = helpText.split("\n");
          expect(lines).to.have.lengthOf(1);
          expect(helpText).to.include("[:alpha:]");
          expect(helpText).to.not.include("[:blank:]");
        });
      });

      it("removes extra commands", async () => {
        const helpText = await vimhelp.search("help\nenew\nput ='abc'\np\nqall!");
        expect(helpText).to.include("*help*");
      });

      it("can not execute extra commands by |", async () => {
        try {
          await vimhelp.search("help|enew");
        } catch (error) {
          expect(error).to.have.property("errorText")
            .that.to.match(/^E149:.*helpbarenew/);
          return;
        }
        expect.fail();
      });

      context("when the help does not exist", () => {
        it("throws error", async () => {
          try {
            await vimhelp.search("never-never-exist-help");
          } catch (error) {
            expect(error).to.have.property("errorText")
              .that.to.match(/^E149:/);
            return;
          }
          expect.fail();
        });
      });

      context("when rtp provider is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.setRTPProvider(() => ["/path/to/plugin"]);
        });
        it("is set rtp from provider", async () => {
          const commands = await vimhelp.search("word");
          expect(commands).to.include("set runtimepath+=/path/to/plugin");
        });
      });

      context("when helplang is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.helplang = ["ja", "en"];
        });
        it("sets 'helplang' options", async () => {
          const commands = await vimhelp.search("word");
          expect(commands).to.include("set helplang=ja,en");
        });
      });
    });

    describe(".setRTPProvider()", () => {
      let provider: RTPProvider;
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
