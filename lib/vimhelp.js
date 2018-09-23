const execVim = require("./exec_vim");

class VimHelp {
  constructor(vimBin = "vim") {
    this.vimBin = vimBin;
    this.helplang = [];
  }

  search(word) {
    const safeWord = word.replace(/\|/g, "bar");
    const commands = [
      `verbose silent help ${safeWord}`,
      [
        "?\\%(^\\s*$\\|[^*]$\\)?",
        "/\\*\\S\\+\\*/",
        ";",
        "/^*\\|[^*]$/",
        "-1",
        "/^\\s*\\*\\S\\+\\*\\|\\*\\S\\+\\*\\s*\\%(>\\)\\=$/",
        "?^[^=-].*[^=-]$?",
        "print"
      ].join("")
    ];
    const runtimepaths = this.rtpProvider ? this.rtpProvider() : [];
    const preCommands = runtimepaths.map((rtp) =>
      `set runtimepath+=${rtp.replace(/[\\, ]/, '\\\0')}`
    );
    preCommands.push(`set helplang=${this.helplang.join(",")}`);
    return this._execVim(preCommands.concat(commands));
  }

  _execVim(commands) {
    return execVim(this.vimBin, [...commands, "qall!"]);
  }

  setRTPProvider(provider) {
    this.rtpProvider = provider;
  }
}

module.exports = VimHelp;
