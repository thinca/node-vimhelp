import {describe, it, expect, beforeAll, beforeEach} from "vitest";
import * as fs from "fs";
import {join as pathJoin} from "path";
import {execFileSync} from "child_process";
import * as tempModule from "temp";
import {PluginManager, UpdateInfo} from "../src/plugin_manager";

const temp = tempModule.track();

process.on("unhandledRejection", (reason) => {
  console.log(reason);
});

describe("vimhelp", () => {
  describe("PluginManager", () => {
    const createDummyPlugin = () => {
      const repoDir = temp.mkdirSync("vimhelp-test-dummy-plugin-repo");
      execFileSync("git", ["init", "--bare", repoDir], {stdio: "ignore"});
      const workDir = temp.mkdirSync("vimhelp-test-dummy-plugin-work");
      execFileSync("git", ["clone", repoDir, workDir], {stdio: "ignore"});
      fs.mkdirSync(pathJoin(workDir, "doc"));
      fs.writeFileSync(pathJoin(workDir, "doc", "hello.txt"), "*hello*");
      execFileSync("git", ["add", "."], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["config", "user.email", "thinca+travis@gmail.com"], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["config", "user.name", "thinca"], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["commit", "--message", "hello"], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["push"], {cwd: workDir, stdio: "ignore"});
      return {repoDir, workDir};
    };

    const {repoDir: plugin} = createDummyPlugin();

    async function contextUpdateExists(manager: PluginManager): Promise<string> {
      const {repoDir, workDir} = createDummyPlugin();
      await manager.install(repoDir);
      execFileSync("git", ["commit", "--message", "update", "--allow-empty"], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["push"], {cwd: workDir, stdio: "ignore"});
      return repoDir;
    }

    const newManager = () => {
      return new PluginManager(temp.mkdirSync("vimhelp-test"));
    };

    let preManager: PluginManager;
    beforeAll(() => {
      preManager = newManager();
      return preManager.install(plugin);
    });

    function unlinkTags(pluginPath: string): string {
      const tags = pathJoin(pluginPath, "doc", "tags");
      if (fs.existsSync(tags)) {
        fs.unlinkSync(tags);
      }
      return tags;
    }

    describe(".plugins", () => {
      it("returns array of plugin informations", () => {
        const pre = preManager;
        const plugins = pre.plugins;
        expect(plugins).to.have.length(1);
        const plugin = plugins[0];
        expect(plugin).to.include.keys(["pluginName", "dirName", "runtimepath", "repository"]);
      });
    });

    describe(".dirNames", () => {
      it("returns array of dir names", () => {
        const pre = preManager;
        expect(pre.dirNames).to.have.length(1)
          .and.to.have.nested.property("[0]").that.to.match(/__vimhelp-test-dummy-plugin-repo/);
      });
    });

    describe(".pluginNames", () => {
      it("returns array of plugin names", () => {
        const pre = preManager;
        expect(pre.pluginNames).to.eql([plugin]);
      });
    });

    describe(".runtimepaths", () => {
      it("returns array of runtimepath", () => {
        const pre = preManager;
        const pat = pathJoin(pre.basePath, ".*__vimhelp-test-dummy-plugin-repo");
        expect(pre.runtimepaths).to.have.length(1)
          .and.to.have.nested.property("[0]").that.to.match(new RegExp(pat));
      });
    });

    describe(".rtpProvider", () => {
      it("returns the rtp provider", () => {
        const pre = preManager;
        const rtp = pre.rtpProvider;
        const pat = pathJoin(pre.basePath, ".*__vimhelp-test-dummy-plugin-repo");
        expect(rtp()).to.have.length(1)
          .and.to.have.nested.property("[0]").that.to.match(new RegExp(pat));
      });
    });

    describe(".install()", () => {
      describe("with exist plugin", () => {
        let manager: PluginManager, promise: Promise<string>;
        beforeAll(() => {
          manager = newManager();
          promise = manager.install(plugin);
        });
        it("installs a plugin", async () => {
          const path = manager.nameToPath(plugin);
          await promise;
          expect(fs.existsSync(path)).toBe(true);
          const tags = pathJoin(path, "doc", "tags");
          expect(fs.existsSync(tags)).toBe(true);
        });
        it("returns version hash", async () => {
          const version = await promise;
          expect(version).to.match(/^[0-9a-f]{40}$/);
        });
        describe("with already installed", () => {
          it("is fail", async () => {
            await promise;
            try {
              await manager.install(plugin);
            } catch (error) {
              expect(error).to.be.an("error");
              expect(error).to.have.property("message").and.contain(plugin);
              return;
            }
            expect.fail();
          });
        });
      });

      describe("with non-exist plugin", () => {
        it("is fail", async () => {
          try {
            await preManager.install("thinca/non-exist-plugin");
          } catch (error) {
            expect(error).to.have.property("exitCode").and.not.equal(0);
            return;
          }
          expect.fail();
        });
      });
    });

    describe(".uninstall()", () => {
      it("uninstalls a plugin", async () => {
        const manager = newManager();
        const path = manager.nameToPath(plugin);
        const version = await manager.install(plugin);
        expect(fs.existsSync(path)).toBe(true);
        expect(version).to.match(/^[0-9a-f]{40}$/);
        const afterPath = await manager.uninstall(plugin);
        expect(fs.existsSync(afterPath)).toBe(false);
      });

      describe("with not installed plugin", () => {
        it("is fail", async () => {
          try {
            await preManager.uninstall("thinca/not-installed-plugin");
          } catch (error) {
            if (error instanceof Error) {
              expect(error).to.be.an("error");
              expect(error.message).to.contain("Plugin is not installed:");
              return;
            }
          }
          expect.fail();
        });
      });
    });

    describe(".clean()", () => {
      let manager: PluginManager;
      beforeAll(() => {
        manager = newManager();
        return manager.install(plugin);
      });
      it("uninstalls plugins", async () => {
        expect(manager.dirNames.length).toBeGreaterThan(0);
        await manager.clean();
        expect(manager.dirNames).toHaveLength(0);
      });
    });

    function behavesUpdate(method: "update" | "updatePlugin"): void {
      let pluginPath: string, tags: string;

      beforeEach(() => {
        pluginPath = preManager.nameToPath(plugin);
        tags = unlinkTags(pluginPath);
      });

      describe("with no updates", () => {
        let promise: Promise<UpdateInfo>;
        beforeAll(() => {
          promise = preManager[method](plugin);
        });
        it("does nothing as result", async () => {
          await promise;
          expect(fs.existsSync(pluginPath)).toBe(true);
          expect(fs.existsSync(tags)).toBe(false);
        });
        it("returns update info object with Promise", async () => {
          const updateInfo = await promise;
          expect(updateInfo.pluginName).to.eql(plugin);
          expect(updateInfo.pluginPath).to.eql(pluginPath);
          expect(updateInfo.beforeVersion).to.eql(updateInfo.afterVersion);
          expect(updateInfo.updated()).toBe(false);
        });
      });

      describe("with updates", () => {
        let manager: PluginManager, promise: Promise<UpdateInfo>, plugin: string;
        beforeAll(async () => {
          manager = newManager();
          const plug = await contextUpdateExists(manager);
          plugin = plug;
          promise = manager[method](plugin);
        });
        it("updates repository", async () => {
          const updateInfo = await promise;
          expect(updateInfo.pluginName).to.eql(plugin);
          expect(updateInfo.pluginPath).to.eql(manager.nameToPath(plugin));
          expect(updateInfo.beforeVersion).to.not.eql(updateInfo.afterVersion);
          expect(updateInfo.updated()).toBe(true);
        });
      });

      describe("with no exist path", () => {
        it("is fail", async () => {
          try {
            await preManager[method]("not-installed-plugin");
          } catch (error) {
            expect(error).to.be.an("error");
            return;
          }
          expect.fail();
        });
      });
    }

    describe(".update()", () => {
      behavesUpdate("update");
    });

    describe(".updatePlugin()", () => {
      behavesUpdate("updatePlugin");
    });

    describe(".updateAll()", () => {
      let pluginPath: string, tags: string, promise: Promise<UpdateInfo[]>;

      beforeEach(() => {
        pluginPath = preManager.nameToPath(plugin);
        tags = unlinkTags(pluginPath);
      });

      describe("with no arguments", () => {
        describe("with no updates", () => {
          beforeAll(() => {
            promise = preManager.updateAll();
          });
          it("does nothing as result", async () => {
            await promise;
            expect(fs.existsSync(pluginPath)).toBe(true);
            expect(fs.existsSync(tags)).toBe(false);
          });
          it("returns updateInfos", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.have.lengthOf(1);
            const [info] = updateInfos;
            expect(info.pluginName).to.eql(plugin);
            expect(info.pluginPath).to.eql(pluginPath);
            expect(info.beforeVersion).to.eql(info.afterVersion);
            expect(info.updated()).toBe(false);
          });
        });

        describe("with updates", () => {
          let updatedPlugin: string;
          beforeAll(async () => {
            updatedPlugin = await contextUpdateExists(preManager);
            promise = preManager.updateAll();
          });
          it("updates repository", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.have.lengthOf(2);
            updateInfos.sort((a, b) => a.updated() === b.updated() ? 0 : a.updated() ? 1 : -1);
            const [notUpdatedInfo, updatedInfo] = updateInfos;

            expect(notUpdatedInfo.pluginName).to.eql(plugin);
            expect(notUpdatedInfo.pluginPath).to.eql(pluginPath);
            expect(notUpdatedInfo.beforeVersion).to.eql(notUpdatedInfo.afterVersion);
            expect(notUpdatedInfo.updated()).toBe(false);

            expect(updatedInfo.pluginName).to.eql(updatedPlugin);
            expect(updatedInfo.pluginPath).to.eql(preManager.nameToPath(updatedPlugin));
            expect(updatedInfo.beforeVersion).to.not.eql(updatedInfo.afterVersion);
            expect(updatedInfo.updated()).toBe(true);
          });
        });
      });

      describe("with plugin list as arguments", () => {
        let plugins: string[];
        describe("with no updates", () => {
          beforeAll(() => {
            plugins = [plugin];
            promise = preManager.updateAll(plugins);
          });
          it("does nothing as result", async () => {
            await promise;
            expect(fs.existsSync(pluginPath)).toBe(true);
            expect(fs.existsSync(tags)).toBe(false);
          });
          it("returns updateInfos", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.have.lengthOf(plugins.length);
            const [info] = updateInfos;
            expect(info.pluginName).to.eql(plugin);
            expect(info.pluginPath).to.eql(pluginPath);
            expect(info.beforeVersion).to.eql(info.afterVersion);
            expect(info.updated()).toBe(false);
          });
        });

        describe("with updates", () => {
          let updatedPlugin: string;

          beforeAll(async () => {
            updatedPlugin = await contextUpdateExists(preManager);
          });

          describe("when argument does not contain updateing plugin", () => {
            beforeAll(async () => {
              plugins = [plugin];
              promise = preManager.updateAll(plugins);
            });
            it("does nothing as result", async () => {
              await promise;
              expect(fs.existsSync(pluginPath)).toBe(true);
              expect(fs.existsSync(tags)).toBe(false);
            });
            it("returns updateInfos", async () => {
              const updateInfos = await promise;
              expect(updateInfos).to.have.lengthOf(plugins.length);
              const [info] = updateInfos;
              expect(info.pluginName).to.eql(plugin);
              expect(info.pluginPath).to.eql(pluginPath);
              expect(info.beforeVersion).to.eql(info.afterVersion);
              expect(info.updated()).toBe(false);
            });
          });

          describe("when argument does not contain updateing plugin", () => {
            beforeAll(async () => {
              plugins = [updatedPlugin];
              promise = preManager.updateAll(plugins);
            });
            it("updates repository", async () => {
              const updateInfos = await promise;
              expect(updateInfos).to.have.lengthOf(plugins.length);

              const [info] = updateInfos;
              expect(info.pluginName).to.eql(updatedPlugin);
              expect(info.pluginPath).to.eql(preManager.nameToPath(updatedPlugin));
              expect(info.beforeVersion).to.not.eql(info.afterVersion);
              expect(info.updated()).toBe(true);
            });
          });
        });

        describe("with empty array", () => {
          beforeAll(() => {
            promise = preManager.updateAll([]);
          });
          it("returns empty result", async () => {
            const updateInfos = await promise;
            expect(updateInfos).toHaveLength(0);
          });
        });
      });
    });

    describe(".updateTags()", () => {
      it("updates helptags", async () => {
        const pluginPath = preManager.nameToPath(plugin);
        const tags = unlinkTags(pluginPath);
        expect(fs.existsSync(tags)).toBe(false);
        const paths = await preManager.updateTags([pluginPath]);
        expect(paths).to.be.an("array");
        expect(paths[0]).to.eql(pluginPath);
        expect(paths).to.eql([pluginPath]);
        expect(fs.existsSync(tags)).toBe(true);
      });
    });

    describe(".nameToRepository()", () => {
      describe("simple name", () => {
        it("is treated as vim-scripts's plugin", () => {
          expect(preManager.nameToRepository("foo")).to.eql("https://github.com/vim-scripts/foo");
        });
      });

      describe("username/repos form", () => {
        it("is treated as Github's plugin", () => {
          expect(preManager.nameToRepository("user/repos")).to.eql("https://github.com/user/repos");
        });
      });

      describe("full URL", () => {
        it("returns directly", () => {
          expect(preManager.nameToRepository("https://github.com/user/repos")).to.eql("https://github.com/user/repos");
        });
      });
    });

    describe(".repositoryToDirname()", () => {
      const expectValue = "github.com__user__repos";
      let repos: string;
      const sample = () => {
        expect(preManager.repositoryToDirname(repos)).to.eql(expectValue);
      };
      const testDotGitCase = () => {
        describe("when repository has .git suffix", () => {
          beforeEach(() => { repos += ".git"; });
          it("is removed", sample);
        });
      };

      describe("when repository is http/https", () => {
        beforeEach(() => { repos = "https://github.com/user/repos"; });
        it("returns path", sample);
        testDotGitCase();
      });

      describe("when repository is git://", () => {
        beforeEach(() => { repos = "git://github.com/user/repos"; });
        it("returns path", sample);
        testDotGitCase();
      });

      describe("when repository is ssh", () => {
        beforeEach(() => { repos = "git@github.com:user/repos"; });
        it("returns path", sample);
        testDotGitCase();
      });
    });

    describe(".nameToPath()", () => {
      it("converts plugin name to path", () => {
        const pre = preManager;
        expect(pre.nameToPath("foo")).to.eql(pathJoin(pre.basePath, "github.com__vim-scripts__foo"));
      });
    });

    describe(".dirnameToName()", () => {
      describe("vim-scripts plugin", () => {
        it("converts dirname to plugin name", () => {
          expect(preManager.dirnameToName("github.com__vim-scripts__foo")).to.eql("foo");
        });
      });
      describe("github.com plugin", () => {
        it("converts dirname to plugin name", () => {
          expect(preManager.dirnameToName("github.com__user__foo")).to.eql("user/foo");
        });
      });
      describe("other plugin", () => {
        it("does not restore the full URL", () => {
          expect(preManager.dirnameToName("example.com__user__foo")).to.eql("example.com/user/foo");
        });
      });
    });
  });
});
