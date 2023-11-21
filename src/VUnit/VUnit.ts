//use
'use strict';

//specific imports
import {VunitExportData} from './VUnitPackage';

//general imports
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import kill = require('tree-kill');
import readline = require('readline');
import uuid = require('uuid-random');

//--------------------------------------------
//module-internal Constants
//--------------------------------------------
const cEmptyVunitExportData : VunitExportData = {
    export_format_version: {
        major: 1,
        minor: 0,
        patch: 0,
    },
    files: [],
    tests: [],
};

//Problem-Matcher
const cVunitProblemMatcher : RegExp = /\*+\s+(Error|Warning)[:|\s+\(\.*\)].*\s(.:.*\w*)\((\d+)\).(.*)/;
const cVunitProblemMatcher_ColumnIndex : number = 0;
const cVunitProblemMatcher_SeverityIndex : number = 1;
const cVunitProblemMatcher_FileIndex : number = 2;
const cVunitProblemMatcher_LineIndex : number = 3;
const cVunitProblemMatcher_MessageIndex : number = 4;


export class VUnit {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------
    private mOutputChannel : vscode.OutputChannel;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor() {
        this.mOutputChannel = vscode.window.createOutputChannel("VUnitByHGB.VUnit");
    }

    public async GetVersion(vunitScript : string): Promise<string> {
        return new Promise((resolve, reject) => {
            let version: string | undefined;
            this.Run(vunitScript, ['--version'], (vunit: ChildProcess): void => {
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

    public async FindScripts(workspaceFolder : vscode.WorkspaceFolder): Promise<string[]> 
    {
        const vunitScriptName : string | undefined = vscode.workspace.getConfiguration().get("vunit-by-hgb.scriptname");
        let vunitScripts: string[] = new Array<string>();

        if (!vunitScriptName)
        {
            return vunitScripts;
        }

        let results = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceFolder, `**/${vunitScriptName}`),
            '**/{vunit,examples,acceptance/artificial}/{vhdl,verilog}'
        );

        vunitScripts = results.map((file) => {
            return file.fsPath;
        });

        vunitScripts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        return vunitScripts;
    }

    public async Run(
        vunitScript: string,
        vunitArgs: string[],
        vunitProcess: (vunit: ChildProcess) => void = () => {}
    ): Promise<string> {
        try{

            return new Promise((resolve, reject) => {
                if (!this.GetWorkspaceRoot()) {
                    return reject(new Error('Workspace root not defined.'));
                } else if (!vunitScript) {
                    return reject(
                        new Error('Unable to determine path of VUnit run script.')
                    );
                } else if (!fs.existsSync(vunitScript)) {
                    return reject(Error(`VUnit run script ${vunitScript} does not exist.`));
                }
                const python = vscode.workspace
                    .getConfiguration()
                    .get('vunit-by-hgb.python') as string;
                const args = ['"' + vunitScript + '"'].concat(vunitArgs);
                this.mOutputChannel.appendLine('');
                this.mOutputChannel.appendLine('===========================================');
                this.mOutputChannel.appendLine('Running VUnit: ' + python + ' ' + args.join(' '));
                let vunit = spawn(python, args, {
                    cwd: path.dirname(vunitScript),
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
        catch(error)
        {
            console.log(error);
        }

        return "";
    }

    public async GetData(workDir: string, vunitScript:string): Promise<VunitExportData> {
        const vunitJson = path.join(workDir, `${uuid()}.json`);
        fs.mkdirSync(path.dirname(vunitJson), { recursive: true });
    
        let vunitData: VunitExportData = cEmptyVunitExportData;
        let options = ['--list', `--export-json ${vunitJson}`];
        const vunitExportJsonOptions = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.exportJsonOptions');
        if (vunitExportJsonOptions) {
            options.push(vunitExportJsonOptions as string);
        }

        let vunitProcess : any;

        await this.Run(vunitScript, options, (vunit: ChildProcess) => {

            vunitProcess = vunit;
            
            readline
                .createInterface({
                    input: vunitProcess.stdout,
                    terminal: false,
                })
                .on('line', (line: string) => {
                    //TODO: check for python errors
                    
                });
            
            })
            .then(() => {
                vunitData = JSON.parse(fs.readFileSync(vunitJson, 'utf-8'));
                fs.unlinkSync(vunitJson);
            })
            .catch((err) => {
                vunitData = cEmptyVunitExportData;
            });
        return vunitData;
    }

    public GetWorkspaceRoot(): string | undefined {
        const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
        let wsRoot: string | undefined = undefined;
        if (workspaceFolder) {
            wsRoot = workspaceFolder.uri.fsPath;
        }
        return wsRoot;
    }

    public MatchProblems(line : string, diagnosticCollection : vscode.DiagnosticCollection) : void
    {   
        const match = cVunitProblemMatcher.exec(line);
        if (match) {
            const file = match[cVunitProblemMatcher_FileIndex];
            const lineNum = parseInt(match[cVunitProblemMatcher_LineIndex]);
            const columnNum = parseInt(match[cVunitProblemMatcher_ColumnIndex]);
            const severity = match[cVunitProblemMatcher_SeverityIndex];
            const message = match[cVunitProblemMatcher_MessageIndex];

            const diagnosticSeverity = severity === 'Error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
            const range = new vscode.Range(new vscode.Position(lineNum - 1, columnNum - 1), new vscode.Position(lineNum - 1, columnNum));
            const diagnostic = new vscode.Diagnostic(range, message, diagnosticSeverity);
            diagnostic.source = "VUnit";
            
            // check for existing diagnostics for this file
            if (diagnosticCollection.has(vscode.Uri.file(file))) 
            {
                const currentDiagnostics = diagnosticCollection.get(vscode.Uri.file(file));

                if (currentDiagnostics) {
                    // add new diagnostic to existing diagnostic-list
                    const updatedDiagnostics = currentDiagnostics.concat(diagnostic);
                    diagnosticCollection.set(vscode.Uri.file(file), updatedDiagnostics);
                }
            } 
            else 
            {
                // if no existing diagnostics, add a new diagnostic
                diagnosticCollection.set(vscode.Uri.file(file), [diagnostic]);
            }
        }
    }
}

//--------------------------------------------
//Helper-Functions
//--------------------------------------------
