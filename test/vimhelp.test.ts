import {expect} from "chai";
import proxyquire from "proxyquire";
import * as tempModule from "temp";
import {execVim} from "../src/exec_vim";
import {VimHelp, RTPProvider} from "../src/vimhelp";
import {PluginManager} from "../src/plugin_manager"
import {NeovimHelp} from "../src/neovim_help"

const temp = tempModule.track();

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
  let manager: PluginManager
  let nvimHelp: NeovimHelp

  it("Install neovim help", async () => {
    manager = new PluginManager(temp.mkdirSync("vimhelp-test"))
    nvimHelp = new NeovimHelp(manager)
    await nvimHelp.update()
    expect(nvimHelp).to.have.property("runtime").that.to.include("vimhelp-test")
  }).timeout(10 * 1000)

  it("Update neovim help", async () => {
    await nvimHelp.update()
    expect(nvimHelp).to.have.property("runtime").that.to.include("vimhelp-test")
  })

  describe("VimHelp", async () => {
    let vimhelp: VimHelp;

    const search_await = async (word: string, callback: (result: string) => void) => {
      for (const useNvim of [true, false]) {
        vimhelp.useNvim = useNvim
        const vimResult = await vimhelp.search(word);
        callback(vimResult);
      }
    };

    const search_catch = async (word: string, expectError: RegExp) => {
      for (const useNvim of [true, false]) {
        vimhelp.useNvim = useNvim
        try {
          await vimhelp.search(word);
        } catch (error) {
          expect(error).to.have.property("errorText")
            .that.to.match(expectError);
          console.log(expectError)
        }
      }
      // expect.fail()
    };

    beforeEach(() => {
      vimhelp = new VimHelpProxied();
      vimhelp.setNvimHelpRtp(nvimHelp.runtime)
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
        vimhelp.useNvim = false
        expect(vimhelp.search("help")).to.be.instanceof(Promise);
        vimhelp.useNvim = true
        expect(vimhelp.search("help")).to.be.instanceof(Promise);
      });

      describe("the result", () => {
        // XXX: These test may fail when Vim's help will be updated.
        it("is a text from Vim's help", async () => {
          await search_await("help", result => expect(result).to.include("*help*"));
        });

        it("keeps the whitespaces of head", async () => {
          await search_await("G", result => expect(result).to.match(/^\s/));
        });

        it("doesn't have the blank chars in tail", async () => {
          await search_await("G", result => expect(result).to.not.match(/\n$/));
        });

        it("contains a range of before of a next tag from a tag", async () => {
          await search_await("CTRL-J", result => {
            const lines = result.split("\n");
            expect(lines).to.have.lengthOf(5);
            expect(lines[0]).to.include("*j*");
          });
        });

        it("can treat a tag at the head of file", async () => {
          await search_await("helphelp.txt", result => expect(result).to.include("*helphelp.txt*"));
        });

        it("does not contain separator", async () => {
          await search_await("o_CTRL-V", result => expect(result).to.not.include("==="));
        });

        it("can separate section when the line ends with >", async () => {
          await search_await("E32", result => {
            expect(result).to.include("E32");
            expect(result).to.not.include("E141");
          });
        });

        it("can handle a tag that is placed to head of line", async () => {
          await search_await("[:alpha:]", result => {
            const lines = result.split("\n");
            expect(lines).to.have.lengthOf(1);
            expect(result).to.include("[:alpha:]");
            expect(result).to.not.include("[:blank:]");
          });
        });
      });

      it("removes extra commands", async () => {
        await search_await("help\nenew\nput ='abc'\np\nqall!", result => expect(result).to.include("*help*"));
      });

      it("can not execute extra commands by |", async () => {
        await search_catch("help|enew", /^E149:.*helpbarenew/);
      });

      context("when the help does not exist", () => {
        it("throws error", async () => {
          await search_catch("never-never-exist-help", /^E149:/);
        });
      });

      context("when rtp provider is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.setRTPProvider(() => ["/path/to/plugin"]);
        });
        it("is set rtp from provider", async () => {
          await search_await("word", result => expect(result).to.include("set runtimepath+=/path/to/plugin"));
        });
      });

      context("when helplang is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.helplang = ["ja", "en"];
        });
        it("sets 'helplang' options", async () => {
          await search_await("word", result => expect(result).to.include("set helplang=ja,en"));
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
