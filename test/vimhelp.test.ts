import {vi, describe, it, beforeEach, expect, afterEach} from "vitest";
import {execVim as execVimStub} from "../src/exec_vim";
import {VimHelp, RTPProvider} from "../src/vimhelp";

process.on("unhandledRejection", (reason) => {
  console.log(reason);
});

describe("vimhelp", () => {
  describe("VimHelp", () => {
    let vimhelp: VimHelp;

    beforeEach(() => {
      vimhelp = new VimHelp();
    });

    describe("vim command not exist", () => {
      beforeEach(() => {
        vi.spyOn(vimhelp, "_execVim").mockImplementationOnce(async (commands) =>
          await execVimStub("vim-not-exist", commands)
        );
      });
      afterEach(() => {
        vi.clearAllMocks();
      });
      it("throws error", async () => {
        try {
          await vimhelp.search("help");
        } catch (error) {
          expect(error).toHaveProperty("exitCode");
          expect(error.exitCode).toBeUndefined();
          return;
        }
        expect.fail();
      });
    });
    describe(".search()", () => {
      function hijackExecVim() {
        beforeEach(() => {
          vi.spyOn(vimhelp, "_execVim").mockImplementation(
            async (commands) => commands.join("\n")
          );
        });
        afterEach(() => {
          vi.clearAllMocks();
        });
      }

      it("returns Promise object", () => {
        expect(vimhelp.search("help")).toBeInstanceOf(Promise);
      });

      describe("the result", () => {
        // XXX: These test may fail when Vim's help will be updated.
        it("is a text from Vim's help", async () => {
          const helpText = await vimhelp.search("help");
          expect(helpText).toContain("*help*");
        });

        it("keeps the whitespaces of head", async () => {
          const helpText = await vimhelp.search("G");
          expect(helpText).toMatch(/^\s/);
        });

        it("doesn't have the blank chars in tail", async () => {
          const helpText = await vimhelp.search("G");
          expect(helpText).not.toMatch(/\n$/);
        });

        it("contains a range of before of a next tag from a tag", async () => {
          const helpText = await vimhelp.search("CTRL-J");
          const lines = helpText.split("\n");
          expect(lines).toHaveLength(5);
          expect(lines[0]).toContain("*j*");
        });

        it("can treat a tag at the head of file", async () => {
          const helpText = await vimhelp.search("helphelp.txt");
          expect(helpText).toContain("*helphelp.txt*");
        });

        it("does not contain separator", async () => {
          const helpText = await vimhelp.search("o_CTRL-V");
          expect(helpText).not.toContain("===");
        });

        it("can separate section when the line ends with >", async () => {
          const helpText = await vimhelp.search("E32");
          expect(helpText).toContain("E32");
          expect(helpText).not.toContain("E141");
        });

        it("can handle a tag that is placed to head of line", async () => {
          const helpText = await vimhelp.search("[:alpha:]");
          const lines = helpText.split("\n");
          expect(lines).toHaveLength(1);
          expect(helpText).toContain("[:alpha:]");
          expect(helpText).not.toContain("[:blank:]");
        });
      });

      it("removes extra commands", async () => {
        const helpText = await vimhelp.search("help\nenew\nput ='abc'\np\nqall!");
        expect(helpText).toContain("*help*");
      });

      it("can not execute extra commands by |", async () => {
        try {
          await vimhelp.search("help|enew");
        } catch (error) {
          expect(error).toHaveProperty("errorText");
          expect(error.errorText).toMatch(/^E149:.*helpbarenew/);
          return;
        }
        expect.fail();
      });

      describe("when the help does not exist", () => {
        it("throws error", async () => {
          try {
            await vimhelp.search("never-never-exist-help");
          } catch (error) {
            expect(error).toHaveProperty("errorText");
            expect(error.errorText).toMatch(/^E149:/);
            return;
          }
          expect.fail();
        });
      });

      describe("when rtp provider is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.setRTPProvider(() => ["/path/to/plugin"]);
        });
        it("is set rtp from provider", async () => {
          const commands = await vimhelp.search("word");
          expect(commands).toContain("set runtimepath+=/path/to/plugin");
        });
      });

      describe("when helplang is set", () => {
        hijackExecVim();
        beforeEach(() => {
          vimhelp.helplang = ["ja", "en"];
        });
        it("sets 'helplang' options", async () => {
          const commands = await vimhelp.search("word");
          expect(commands).toContain("set helplang=ja,en");
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
        expect(vimhelp.rtpProvider).toEqual(provider);
      });
    });
  });
});
