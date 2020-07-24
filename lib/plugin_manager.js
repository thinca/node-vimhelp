const {execFile} = require("child_process");
const fs = require("fs");
const {join: pathJoin} = require("path");

const execVim = require("./exec_vim");

const execGit = (args, options = {}) => {
  return new Promise((resolve, reject) => {
    const defaultOptions = {env: Object.assign({}, process.env, {GIT_TERMINAL_PROMPT: "0"})};
    execFile("git", args, Object.assign(defaultOptions, options), (error, resultText, errorText) => {
      if (error) {
        reject({exitCode: error.code, resultText, errorText});
      } else {
        resolve(resultText);
      }
    });
  });
};

const getPluginVersion = async (pluginPath) => {
  if (!fs.existsSync(pluginPath)) {
    return Promise.reject(new Error(`pluginPath does not exist: ${pluginPath}`));
  }
  const version = await execGit(["rev-parse", "HEAD"], {cwd: pluginPath});
  return version.trim();
};

class PluginManager {
  constructor(basePath, vimBin = "vim") {
    this.basePath = basePath;
    this.vimBin = vimBin;
  }

  get plugins() {
    return this.dirNames.map((dirName) => {
      const pluginName = this.dirnameToName(dirName);
      const repository = this.nameToRepository(pluginName);
      const runtimepath = pathJoin(this.basePath, dirName);
      return {
        pluginName,
        dirName,
        runtimepath,
        repository
      };
    });
  }
  get dirNames() {
    return fs.readdirSync(this.basePath);
  }

  get pluginNames() {
    return this.dirNames.map(this.dirnameToName);
  }

  get runtimepaths() {
    return this.dirNames.map((path) => pathJoin(this.basePath, path));
  }

  get rtpProvider() {
    return () => this.runtimepaths;
  }

  async install(pluginName) {
    const repos = this.nameToRepository(pluginName);
    const pluginPath = this.nameToPath(pluginName);
    if (fs.existsSync(pluginPath)) {
      throw new Error(`Plugin already installed: ${pluginName}`);
    }
    await execGit(["clone", "--depth", "1", "--quiet", repos, pluginPath]);
    await this.updateTags([pluginPath]);
    return await getPluginVersion(pluginPath);
  }

  uninstall(pluginName) {
    const path = this.nameToPath(pluginName);
    return new Promise((resolve, reject) => {
      if (fs.existsSync(path)) {
        fs.rmdir(path, {recursive: true}, (err) => err ? reject(err) : resolve(path));
      } else {
        reject(new Error(`Plugin is not installed: ${path}`));
      }
    });
  }

  clean() {
    return Promise.all(this.pluginNames.map(this.uninstall.bind(this)));
  }

  async update(pluginName) {
    const info = await this.updatePlugin(pluginName);
    if (info.updated()) {
      await this.updateTags([info.pluginPath]);
    }
    return info;
  }

  async updatePlugin(pluginName) {
    const pluginPath = this.nameToPath(pluginName);
    const beforeVersion = await getPluginVersion(pluginPath);
    await execGit(["pull"], {cwd: pluginPath});
    const afterVersion = await getPluginVersion(pluginPath);
    return {
      beforeVersion,
      afterVersion,
      pluginPath,
      pluginName,
      updated() {
        return this.beforeVersion !== this.afterVersion;
      }
    };
  }

  async updateAll(pluginNames = this.pluginNames) {
    const updateInfos = await Promise.all(
      pluginNames.map(this.updatePlugin.bind(this))
    );
    const needTagUpdates = updateInfos.filter((info) => info.updated());
    await this.updateTags(
      needTagUpdates.map((info) => info.pluginPath)
    );
    return updateInfos;
  }

  async updateTags(pluginPaths) {
    const commands = pluginPaths
      .map((path) => pathJoin(path, "doc"))
      .filter((path) => fs.existsSync(path))
      .map((path) => `helptags ${path}`);
    if (commands.length === 0) {
      return pluginPaths;
    }
    commands.push("qall!");
    await execVim(this.vimBin, commands);
    return pluginPaths;
  }

  nameToRepository(pluginName) {
    let repos = pluginName;
    if (!/\//.test(repos)) {
      repos = `vim-scripts/${repos}`;
    }
    if (/^[^/]+\/[^/]+$/.test(repos)) {
      repos = `https://github.com/${repos}`;
    }
    return repos;
  }

  repositoryToDirname(repos) {
    return repos
      .replace(/^\w+(?::\/\/|@)/, "")
      .replace(/\.git$/, "")
      .replace(/[:/]/g, "__");
  }

  nameToPath(pluginName) {
    const repos = this.nameToRepository(pluginName);
    const dirname = this.repositoryToDirname(repos);
    return pathJoin(this.basePath, dirname);
  }

  dirnameToName(dirname) {
    return dirname
      .replace(/__/g, "/")
      .replace(/^github\.com\//, "")
      .replace(/^vim-scripts\//, "");
  }
}

module.exports = PluginManager;
