import {execFile} from "child_process";

export function execVim(vimBin: string, commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const vim = execFile(vimBin, [
      "-u", "NONE", "-i", "NONE", "-N",
      "-Z", "-X", "-R", "-e", "-s"
    ], (error, resultText, errorText) => {
      if (error) {
        reject({exitCode: error.code, resultText, errorText});
      } else {
        resolve(resultText.trimEnd());
      }
    });
    const script = commands
      .map((c) => c.replace(/\r?\n[^]*/, ""))
      .filter((c) => /\S/.test(c))
      .map((c) => `${c}\n`).join("");
    vim.stdin!.write(script);
  });
}
