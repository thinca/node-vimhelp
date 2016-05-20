const {spawn} = require("child_process");

class VimHelp {
  constructor(vimBin = "vim") {
    this.vimBin = vimBin;
  }

  search(word) {
    const commands = [
      `verbose silent help ${word}`,
      ".,/[^*]$//\\*\\S\\+\\*$\\|\\%$/?^[^=-].*[^=-]$?print",
    ];
    return this._execVim(commands);
  }

  _execVim(commands) {
    return new Promise((resolve, reject) => {
      const vim = spawn(this.vimBin, [
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
      const script = [...commands, "qall!"]
        .filter((c) => /\S/.test(c || ""))
        .map((c) => `${c}\n`).join("");
      vim.stdin.write(script);
    });
  }
}

module.exports = {VimHelp};
