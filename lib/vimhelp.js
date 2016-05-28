const {spawn} = require("child_process");
const fs = require("fs");
const {join: pathJoin} = require("path");
const rmdir = require("rmdir");
const isThere = require("is-there");

// Can not use `const` for test
let execVim = (vimBin, commands) => {
  return new Promise((resolve, reject) => {
    const vim = spawn(vimBin, [
      "-u", "NONE", "-i", "NONE", "-N",
      "-Z", "-R", "-e", "-s"
    ]);
    let resultText = "";
    let errorText = "";
    vim.stdout.on("data", (data) => {
      resultText += data.toString();
    });
    vim.stderr.on("data", (data) => {
      errorText += data.toString();
    });
    vim.on("exit", (exitCode) => {
      if (exitCode === 0 && errorText === "") {
        resolve(resultText);
      } else {
        reject({exitCode, resultText, errorText});
      }
    });
    const script = commands
      .filter((c) => /\S/.test(c || ""))
      .map((c) => `${c}\n`).join("");
    vim.stdin.write(script);
  });
};

const execGit = (args, options = {}) => {
  return new Promise((resolve, reject) => {
    let defaultOptions = {env: {GIT_TERMINAL_PROMPT: "0"}};
    let git = spawn("git", args, Object.assign(defaultOptions, options));
    let resultText = "";
    let errorText = "";
    git.stdout.on("data", (data) => {
      resultText += data.toString();
    });
    git.stderr.on("data", (data) => {
      errorText += data.toString();
    });
    git.on("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve(resultText);
      } else {
        reject({exitCode, resultText, errorText});
      }
    });
  });
};

const getPluginVersion = (pluginPath) => {
  if (!isThere(pluginPath)) {
    return Promise.reject(new Error(`pluginPath does not exist: ${pluginPath}`));
  }
  return execGit(["rev-parse", "HEAD"], {cwd: pluginPath})
    .then((version) => version.trim());
};

class VimHelp {
  constructor(vimBin = "vim") {
    this.vimBin = vimBin;
  }

  search(word) {
    const commands = [
      `verbose silent help ${word}`,
      ".,/[^*]$//\\*\\S\\+\\*$\\|\\%$/?^[^=-].*[^=-]$?print"
    ];
    const runtimepaths = this.rtpProvider ? this.rtpProvider() : [];
    const rtpCommands = runtimepaths.map((rtp) =>
      `set runtimepath+=${rtp.replace(/[\\, ]/, '\\\0')}`
    );
    return this._execVim(rtpCommands.concat(commands));
  }

  _execVim(commands) {
    return execVim(this.vimBin, [...commands, "qall!"]);
  }

  setRTPProvider(provider) {
    this.rtpProvider = provider;
  }
}

class PluginManager {
  constructor(basePath, vimBin = "vim") {
    this.basePath = basePath;
    this.vimBin = vimBin;
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

  install(pluginName) {
    let repos = this.nameToRepository(pluginName);
    let pluginPath = this.nameToPath(pluginName);
    return new Promise((resolve, reject) => {
      if (isThere(pluginPath)) {
        reject(new Error(`Plugin already installed: ${pluginName}`));
        return;
      }
      resolve();
    }).then(() => execGit(["clone", "--depth", "1", "--quiet", repos, pluginPath]))
      .then(() => this.updateTags([pluginPath]))
      .then(() => getPluginVersion(pluginPath));
  }

  uninstall(pluginName) {
    let path = this.nameToPath(pluginName);
    return new Promise((resolve, reject) => {
      if (isThere(path)) {
        rmdir(path, () => { resolve(path); });
      } else {
        reject(new Error(`Plugin is not installed: ${path}`));
      }
    });
  }

  update(pluginName) {
    return this.updatePlugin(pluginName)
      .then((info) => {
        if (info.updated()) {
          return this.updateTags([info.pluginPath])
            .then(() => info);
        }
        return info;
      });
  }

  updatePlugin(pluginName) {
    let pluginPath = this.nameToPath(pluginName);
    let beforeVersion;
    return getPluginVersion(pluginPath)
      .then((version) => {
        beforeVersion = version;
        return execGit(["pull", "--depth=1"], {cwd: pluginPath});
      })
      .then(() => getPluginVersion(pluginPath))
      .then((afterVersion) => ({
        beforeVersion,
        afterVersion,
        pluginPath,
        pluginName,
        updated() {
          return this.beforeVersion !== this.afterVersion;
        }
      }));
  }

  updateAll(pluginNames = this.pluginNames) {
    return Promise.all(
      pluginNames.map(this.updatePlugin.bind(this))
    ).then((updateInfos) => {
      let needTagUpdates = updateInfos.filter((info) => info.updated());
      return Promise.all(
        needTagUpdates
          .map((info) => info.pluginPath)
          .map(this.updateTags.bind(this))
      ).then(() => updateInfos);
    });
  }

  updateTags(pluginPaths) {
    let commands = pluginPaths
      .map((path) => pathJoin(path, "doc"))
      .filter((path) => isThere(path))
      .map((path) => `helptags ${path}`);
    if (commands.length === 0) {
      return Promise.resolve(pluginPaths);
    }
    commands.push("qall!");
    return execVim(this.vimBin, commands).then(() => pluginPaths);
  }

  nameToRepository(pluginName) {
    let repos = pluginName;
    if (!/\//.test(repos)) {
      repos = `vim-scripts/${repos}`;
    }
    if (/^[^\/]+\/[^\/]+$/.test(repos)) {
      repos = `https://github.com/${repos}`;
    }
    return repos;
  }

  repositoryToDirname(repos) {
    return repos
      .replace(/^\w+(?::\/\/|@)/, "")
      .replace(/\.git$/, "")
      .replace(/[:\/]/g, "__");
  }

  nameToPath(pluginName) {
    let repos = this.nameToRepository(pluginName);
    let dirname = this.repositoryToDirname(repos);
    return pathJoin(this.basePath, dirname);
  }

  dirnameToName(dirname) {
    return dirname
      .replace(/__/g, "/")
      .replace(/^github\.com\//, "")
      .replace(/^vim-scripts\//, "");
  }
}

module.exports = {VimHelp, PluginManager};
