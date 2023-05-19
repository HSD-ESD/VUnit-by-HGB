'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import kill = require('tree-kill');
import readline = require('readline');
import uuid = require('uuid-random');

export class VUnit {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------
    private mOutputChannel : vscode.OutputChannel;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor() {
        this.mOutputChannel = vscode.window.createOutputChannel("VUnit");
    }

    public async GetVunitVersion(): Promise<string> {
        return new Promise((resolve, reject) => {
            let version: string | undefined;
            this.RunVunit(['--version'], (vunit: ChildProcess): void => {
                let proc: any = vunit;
                readline
                    .createInterface({
                        input: proc.stdout,
                        terminal: false,
                    })
                    .on('line', (line: string) => {
                        version = line.trim();
                    });
            })
                .then(() => {
                    if(version)
                    {
                        resolve(version); 
                    }
                })
                .catch((err) => {
                    reject(new Error(err));
                });
        });
    }

    public async FindRunPy(
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<string[]> {
        let results = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, '**/run.py'),
            '**/{vunit,examples,acceptance/artificial}/{vhdl,verilog}'
        );
        let runPy: string[] = results.map((file) => {
            return file.fsPath;
        });
        return runPy;
    }

    //--------------------------------------------
	//Private Methods
	//--------------------------------------------
    private async RunVunit(
        vunitArgs: string[],
        vunitProcess: (vunit: ChildProcess) => void = () => {}
    ): Promise<string> {
        const runPy = await this.GetRunPy();
        return new Promise((resolve, reject) => {
            if (!getWorkspaceRoot()) {
                return reject(new Error('Workspace root not defined.'));
            } else if (!runPy) {
                return reject(
                    new Error('Unable to determine path of VUnit run script.')
                );
            } else if (!fs.existsSync(runPy)) {
                return reject(Error(`VUnit run script ${runPy} does not exist.`));
            }
            const python = vscode.workspace
                .getConfiguration()
                .get('vunit.python') as string;
            const args = ['"' + runPy + '"'].concat(vunitArgs);
            this.mOutputChannel.appendLine('');
            this.mOutputChannel.appendLine('===========================================');
            this.mOutputChannel.appendLine('Running VUnit: ' + python + ' ' + args.join(' '));
            let vunit = spawn(python, args, {
                cwd: path.dirname(runPy),
                shell: true,
            });
            vunit.on('close', (code) => {
                if (code === 0) {
                    this.mOutputChannel.appendLine('\nFinished with exit code 0');
                    resolve(code.toString());
                } else {
                    let msg = `VUnit returned with non-zero exit code (${code}).`;
                    this.mOutputChannel.appendLine('\n' + msg);
                    reject(new Error(msg));
                }
            });
            vunitProcess(vunit);
            vunit.stdout.on('data', (data: string) => {
                this.mOutputChannel.append(data.toString());
            });
            vunit.stderr.on('data', (data: string) => {
                this.mOutputChannel.append(data.toString());
            });
        });
    }

    public async GetRunPy(): Promise<string> {
        return new Promise((resolve, reject) => {
            const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
            if (!workspaceFolder) {
                return reject(
                    new Error('No workspace folder open when getting run.py')
                );
            }
    
            const runPyConf = vscode.workspace
                .getConfiguration()
                .get('vunit.runpy');
            if (runPyConf) {
                resolve(path.join(workspaceFolder.uri.fsPath, runPyConf as string));
            } else if (vscode.workspace.getConfiguration().get('vunit.findRunPy')) {
                this.FindRunPy(workspaceFolder).then((res) => {
                    if (res.length === 0) {
                        reject(new Error('run.py not found or configured.'));
                    } else if (res.length === 1) {
                        resolve(res[0]);
                    } else {
                        reject(
                            new Error(
                                'Multiple run.py files found in workspace (' +
                                    res.join(', ') +
                                    ').'
                            )
                        );
                    }
                });
            } else {
                reject('run.py not found');
            }
        });
    }

}

//Helper-Functions
export function getWorkspaceRoot(): string | undefined {
    const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
    let wsRoot: string | undefined = undefined;
    if (workspaceFolder) {
        wsRoot = workspaceFolder.uri.fsPath;
    }
    return wsRoot;
}