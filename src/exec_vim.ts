import {execFile} from "child_process";

export class ExecError extends Error {
  exitCode?: number;
  resultText: string;
  errorText: string;

  constructor(exitCode: string | number | null | undefined, resultText: string, errorText: string) {
    super(errorText);
    this.name = "ExecError";
    this.exitCode = typeof exitCode === "number" ? exitCode : undefined;
    this.resultText = resultText;
    this.errorText = errorText;
  }
}

export function execVim(vimBin: string, commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const vim = execFile(vimBin, [
      "-u", "NONE", "-i", "NONE", "-N",
      "-Z", "-X", "-R", "-e", "-s"
    ], (error, resultText, errorText) => {
      if (error) {
        reject(new ExecError(error.code, resultText, errorText));
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
