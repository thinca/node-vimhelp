const {expect} = require("chai");
const fs = require("fs");
const {join: pathJoin} = require("path");
const temp = require("temp").track();
const isThere = require("is-there");
const {PluginManager} = require("../lib/vimhelp");

process.on("unhandledRejection", (reason) => {
  console.log(reason);
});

describe("vimhelp", () => {
  describe("PluginManager", function() {
    this.timeout(10000);  // for git clone

    const plugin = "thinca/vim-themis";

    let preManager;
    before((done) => {
      preManager = new PluginManager(temp.mkdirSync("vimhelp-test"));
      preManager.install(plugin).then(() => done()).catch(done);
    });

    const unlinkTags = (pluginPath) => {
      const tags = pathJoin(pluginPath, "doc", "tags");
      if (isThere(tags)) {
        fs.unlinkSync(tags);
      }
      return tags;
    };

    const newManager = () => {
      return new PluginManager(temp.mkdirSync("vimhelp-test"));
    };

    describe(".dirNames", () => {
      it("returns array of dir names", () => {
        const pre = preManager;
        expect(pre.dirNames).to.eql(["github.com__thinca__vim-themis"]);
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
        expect(pre.runtimepaths).to.eql([pathJoin(pre.basePath, "github.com__thinca__vim-themis")]);
      });
    });

    describe(".rtpProvider", () => {
      it("returns the rtp provider", () => {
        const pre = preManager;
        const rtp = pre.rtpProvider;
        expect(rtp()).to.eql([pathJoin(pre.basePath, "github.com__thinca__vim-themis")]);
      });
    });

    describe(".install()", () => {
      context("with exist plugin", () => {
        let manager, promise;
        before(() => {
          manager = newManager();
          promise = manager.install(plugin);
        });
        it("installs a plugin", (done) => {
          const path = manager.nameToPath(plugin);
          promise.then(() => {
            expect(isThere(path)).to.be.ok;
            const tags = pathJoin(path, "doc", "tags");
            expect(isThere(tags)).to.be.ok;
            done();
          }).catch(done);
        });
        it("returns version hash", (done) => {
          promise.then((version) => {
            expect(version).to.match(/^[0-9a-f]{40}$/);
            done();
          }).catch(done);
        });
        context("with already installed", () => {
          it("is fail", (done) => {
            promise.then(() => {
              return manager.install(plugin).then(done).catch((error) => {
                expect(error).to.be.an("error");
                expect(error).to.have.property("message").and.contain(plugin);
                done();
              });
            }).catch(done);
          });
        });
      });

      context("with non-exist plugin", () => {
        let manager;
        before(() => {
          manager = newManager();
        });
        it("is fail", (done) => {
          manager.install("thinca/non-exist-plugin").then(done).catch((error) => {
            expect(error).to.have.property("exitCode").and.not.equal(0);
            done();
          }).catch(done);
        });
      });
    });

    describe(".uninstall()", () => {
      it("uninstalls a plugin", (done) => {
        const manager = newManager();
        const path = manager.nameToPath(plugin);
        manager.install(plugin).then((version) => {
          expect(isThere(path)).to.be.ok;
          expect(version).to.match(/^[0-9a-f]{40}$/);
          return manager.uninstall(plugin);
        }).then((path) => {
          expect(isThere(path)).to.not.be.ok;
          done();
        }).catch(done);
      });

      context("with not installed plugin", () => {
        it("is fail", (done) => {
          const manager = newManager();
          manager.uninstall("thinca/not-installed-plugin").then(done).catch((error) => {
            expect(error).to.be.an("error");
            expect(error.message).to.contain("Plugin is not installed:");
            done();
          }).catch(done);
        });
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
        it("does nothing as result", (done) => {
          promise.then(() => {
            expect(isThere(pluginPath)).to.be.true;
            expect(isThere(tags)).to.be.false;
            done();
          }).catch(done);
        });
        it("returns update info object with Promise", (done) => {
          promise.then((updateInfo) => {
            expect(updateInfo.pluginName).to.eql(plugin);
            expect(updateInfo.pluginPath).to.eql(pluginPath);
            expect(updateInfo.beforeVersion).to.eql(updateInfo.afterVersion);
            expect(updateInfo.updated()).to.be.false;
            done();
          }).catch(done);
        });
      });

      context("with updates", () => {
        // TODO
      });

      context("with no exist path", () => {
        it("is fail", (done) => {
          preManager[method]("not-installed-plugin").then(done).catch((error) => {
            expect(error).to.be.an("error");
            done();
          });
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
          it("does nothing as result", (done) => {
            promise.then(() => {
              expect(isThere(pluginPath)).to.be.true;
              expect(isThere(tags)).to.be.false;
              done();
            }).catch(done);
          });
          it("returns updateInfos", (done) => {
            promise.then((updateInfos) => {
              expect(updateInfos).to.have.lengthOf(1);
              const [info] = updateInfos;
              expect(info.pluginName).to.eql(plugin);
              expect(info.pluginPath).to.eql(pluginPath);
              expect(info.beforeVersion).to.eql(info.afterVersion);
              expect(info.updated()).to.be.false;
              done();
            }).catch(done);
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
          it("does nothing as result", (done) => {
            promise.then(() => {
              expect(isThere(pluginPath)).to.be.true;
              expect(isThere(tags)).to.be.false;
              done();
            }).catch(done);
          });
          it("returns updateInfos", (done) => {
            promise.then((updateInfos) => {
              expect(updateInfos).to.have.lengthOf(plugins.length);
              const [info] = updateInfos;
              expect(info.pluginName).to.eql(plugin);
              expect(info.pluginPath).to.eql(pluginPath);
              expect(info.beforeVersion).to.eql(info.afterVersion);
              expect(info.updated()).to.be.false;
              done();
            }).catch(done);
          });
        });

        context("with updates", () => {
          // TODO
        });

        context("with empty array", () => {
          before(() => {
            promise = preManager.updateAll([]);
          });
          it("returns empty result", (done) => {
            promise.then((updateInfos) => {
              expect(updateInfos).to.be.empty;
              done();
            }).catch(done);
          });
        });
      });
    });

    describe(".updateTags()", () => {
      it("updates helptags", (done) => {
        const pluginPath = preManager.nameToPath(plugin);
        const tags = unlinkTags(pluginPath);
        expect(isThere(tags)).to.be.false;
        preManager.updateTags([pluginPath]).then((paths) => {
          expect(paths).to.be.an("array");
          expect(paths[0]).to.eql(pluginPath);
          expect(paths).to.eql([pluginPath]);
          expect(isThere(tags)).to.be.true;
          done();
        }).catch(done);
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
