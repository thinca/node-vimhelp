const {expect} = require("chai");
const fs = require("fs");
const {join: pathJoin} = require("path");
const {execFileSync} = require("child_process");
const temp = require("temp").track();
const PluginManager = require("../lib/plugin_manager");

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

    const contextUpdateExists = async (manager) => {
      const {repoDir, workDir} = createDummyPlugin();
      const plugin = `file://${repoDir}`;
      await manager.install(plugin);
      execFileSync("git", ["commit", "--message", "update", "--allow-empty"], {cwd: workDir, stdio: "ignore"});
      execFileSync("git", ["push"], {cwd: workDir, stdio: "ignore"});
      return plugin;
    };

    let preManager;
    before(() => {
      preManager = new PluginManager(temp.mkdirSync("vimhelp-test"));
      return preManager.install(plugin);
    });

    const unlinkTags = (pluginPath) => {
      const tags = pathJoin(pluginPath, "doc", "tags");
      if (fs.existsSync(tags)) {
        fs.unlinkSync(tags);
      }
      return tags;
    };

    const newManager = () => {
      return new PluginManager(temp.mkdirSync("vimhelp-test"));
    };

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
      context("with exist plugin", () => {
        let manager, promise;
        before(() => {
          manager = newManager();
          promise = manager.install(plugin);
        });
        it("installs a plugin", async () => {
          const path = manager.nameToPath(plugin);
          await promise;
          expect(fs.existsSync(path)).to.be.ok;
          const tags = pathJoin(path, "doc", "tags");
          expect(fs.existsSync(tags)).to.be.ok;
        });
        it("returns version hash", async () => {
          const version = await promise;
          expect(version).to.match(/^[0-9a-f]{40}$/);
        });
        context("with already installed", () => {
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

      context("with non-exist plugin", () => {
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
        expect(fs.existsSync(path)).to.be.ok;
        expect(version).to.match(/^[0-9a-f]{40}$/);
        const afterPath = await manager.uninstall(plugin);
        expect(fs.existsSync(afterPath)).to.not.be.ok;
      });

      context("with not installed plugin", () => {
        it("is fail", async () => {
          try {
            await preManager.uninstall("thinca/not-installed-plugin");
          } catch (error) {
            expect(error).to.be.an("error");
            expect(error.message).to.contain("Plugin is not installed:");
            return;
          }
          expect.fail();
        });
      });
    });

    describe(".clean()", () => {
      let manager;
      before(() => {
        manager = newManager();
        return manager.install(plugin);
      });
      it("uninstalls plugins", async () => {
        expect(manager.dirNames).to.not.be.empty;
        await manager.clean();
        expect(manager.dirNames).to.be.empty;
      });
    });

    const behavesUpdate = (method) => {
      let pluginPath, tags;

      beforeEach(() => {
        pluginPath = preManager.nameToPath(plugin);
        tags = unlinkTags(pluginPath);
      });

      context("with no updates", () => {
        let promise;
        before(() => {
          promise = preManager[method](plugin);
        });
        it("does nothing as result", async () => {
          await promise;
          expect(fs.existsSync(pluginPath)).to.be.true;
          expect(fs.existsSync(tags)).to.be.false;
        });
        it("returns update info object with Promise", async () => {
          const updateInfo = await promise;
          expect(updateInfo.pluginName).to.eql(plugin);
          expect(updateInfo.pluginPath).to.eql(pluginPath);
          expect(updateInfo.beforeVersion).to.eql(updateInfo.afterVersion);
          expect(updateInfo.updated()).to.be.false;
        });
      });

      context("with updates", () => {
        let manager, promise, plugin;
        before(async () => {
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
          expect(updateInfo.updated()).to.be.true;
        });
      });

      context("with no exist path", () => {
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
    };

    describe(".update()", () => {
      behavesUpdate("update");
    });

    describe(".updatePlugin()", () => {
      behavesUpdate("updatePlugin");
    });

    describe(".updateAll()", () => {
      let pluginPath, tags, promise;

      beforeEach(() => {
        pluginPath = preManager.nameToPath(plugin);
        tags = unlinkTags(pluginPath);
      });

      context("with no arguments", () => {
        context("with no updates", () => {
          before(() => {
            promise = preManager.updateAll();
          });
          it("does nothing as result", async () => {
            await promise;
            expect(fs.existsSync(pluginPath)).to.be.true;
            expect(fs.existsSync(tags)).to.be.false;
          });
          it("returns updateInfos", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.have.lengthOf(1);
            const [info] = updateInfos;
            expect(info.pluginName).to.eql(plugin);
            expect(info.pluginPath).to.eql(pluginPath);
            expect(info.beforeVersion).to.eql(info.afterVersion);
            expect(info.updated()).to.be.false;
          });
        });

        context("with updates", () => {
          // TODO
        });
      });

      context("with plugin list as arguments", () => {
        let plugins;
        before(() => {
          plugins = [plugin];
        });
        context("with no updates", () => {
          before(() => {
            promise = preManager.updateAll(plugins);
          });
          it("does nothing as result", async () => {
            await promise;
            expect(fs.existsSync(pluginPath)).to.be.true;
            expect(fs.existsSync(tags)).to.be.false;
          });
          it("returns updateInfos", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.have.lengthOf(plugins.length);
            const [info] = updateInfos;
            expect(info.pluginName).to.eql(plugin);
            expect(info.pluginPath).to.eql(pluginPath);
            expect(info.beforeVersion).to.eql(info.afterVersion);
            expect(info.updated()).to.be.false;
          });
        });

        context("with updates", () => {
          // TODO
        });

        context("with empty array", () => {
          before(() => {
            promise = preManager.updateAll([]);
          });
          it("returns empty result", async () => {
            const updateInfos = await promise;
            expect(updateInfos).to.be.empty;
          });
        });
      });
    });

    describe(".updateTags()", () => {
      it("updates helptags", async () => {
        const pluginPath = preManager.nameToPath(plugin);
        const tags = unlinkTags(pluginPath);
        expect(fs.existsSync(tags)).to.be.false;
        const paths = await preManager.updateTags([pluginPath]);
        expect(paths).to.be.an("array");
        expect(paths[0]).to.eql(pluginPath);
        expect(paths).to.eql([pluginPath]);
        expect(fs.existsSync(tags)).to.be.true;
      });
    });

    describe(".nameToRepository()", () => {
      context("simple name", () => {
        it("is treated as vim-scripts's plugin", () => {
          expect(preManager.nameToRepository("foo")).to.eql("https://github.com/vim-scripts/foo");
        });
      });

      context("username/repos form", () => {
        it("is treated as Github's plugin", () => {
          expect(preManager.nameToRepository("user/repos")).to.eql("https://github.com/user/repos");
        });
      });

      context("full URL", () => {
        it("returns directly", () => {
          expect(preManager.nameToRepository("https://github.com/user/repos")).to.eql("https://github.com/user/repos");
        });
      });
    });

    describe(".repositoryToDirname()", () => {
      const expectValue = "github.com__user__repos";
      let repos;
      const sample = () => {
        expect(preManager.repositoryToDirname(repos)).to.eql(expectValue);
      };
      const testDotGitCase = () => {
        context("when repository has .git suffix", () => {
          beforeEach(() => { repos += ".git"; });
          it("is removed", sample);
        });
      };

      context("when repository is http/https", () => {
        beforeEach(() => { repos = "https://github.com/user/repos"; });
        it("returns path", sample);
        testDotGitCase();
      });

      context("when repository is git://", () => {
        beforeEach(() => { repos = "git://github.com/user/repos"; });
        it("returns path", sample);
        testDotGitCase();
      });

      context("when repository is ssh", () => {
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
      context("vim-scripts plugin", () => {
        it("converts dirname to plugin name", () => {
          expect(preManager.dirnameToName("github.com__vim-scripts__foo")).to.eql("foo");
        });
      });
      context("github.com plugin", () => {
        it("converts dirname to plugin name", () => {
          expect(preManager.dirnameToName("github.com__user__foo")).to.eql("user/foo");
        });
      });
      context("other plugin", () => {
        it("does not restore the full URL", () => {
          expect(preManager.dirnameToName("example.com__user__foo")).to.eql("example.com/user/foo");
        });
      });
    });
  });
});
