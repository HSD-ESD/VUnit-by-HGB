//specific imports
import { VUnit } from "./VUnit";
import { VunitExportData } from "./VUnitPackage";

//general imports
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import exp = require("constants");
import readline = require('readline');
import kill = require('tree-kill');
import { ChildProcess } from "child_process";

//--------------------------------------------
// module-internal constants
//--------------------------------------------

//TestBench-Status-Matcher
const cVunitTestEnd : RegExp = /(pass|fail) \(.*\) (.*) \(.*\)/;
const cVunitTimedTestEnd : RegExp = /(pass|fail) \(.*\) (.*) \((\d+(?:\.\d+)?) seconds\)/;
const cVunitTestStart : RegExp = /Starting (.*)/;
const cVunitStopped : RegExp = /Stopped at ([^\s]+) line (\d+)/;

export class VUnitTestController {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------

    //vs-code-members
    private mContext : vscode.ExtensionContext;
    private mOutputChannel : vscode.OutputChannel;
    private mDiagnosticCollection : vscode.DiagnosticCollection;

    //specific members
    private mTestController : vscode.TestController;
    private mRunProfile : vscode.TestRunProfile;
    private mDebugProfile : vscode.TestRunProfile;

    private mWorkSpacePath : string = "";
    private mVUnit : VUnit;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor(context : vscode.ExtensionContext) {

        //initialize vs-code-members
        this.mContext = context;
        this.mOutputChannel = vscode.window.createOutputChannel("VUnitByHGB.VUnitTestController");
        this.mDiagnosticCollection = vscode.languages.createDiagnosticCollection('VUnitByHGB.VUnitErrors');

        //initialize specific members
        this.mVUnit = new VUnit();

        //get workspace-path of extension
        const workSpacePath = this.mVUnit.GetWorkspaceRoot(); 
        if(workSpacePath) { this.mWorkSpacePath = workSpacePath; }

        // create TestController for VUnit
        this.mTestController = vscode.tests.createTestController('vunit-test-controller', 'VUnit TestController');
        this.mContext.subscriptions.push(this.mTestController);

        //create profile for running Tests
        this.mRunProfile = this.mTestController.createRunProfile(
                                'Run', 
                                vscode.TestRunProfileKind.Run, 
                                (request, token) => {
                                    this.RunTests(false, request, token);
                            });
        
        //create profile for debugging tests
        this.mDebugProfile = this.mTestController.createRunProfile(
                                'Debug',
                                vscode.TestRunProfileKind.Debug,
                                (request, token) => {
                                    this.RunTests(true, request, token);
                            });

        //resolve-handler for initial loading of testcases in User-Interface
        this.mTestController.resolveHandler = load => {
            this.LoadTests();
        };

        //refresh-handler for manual refreshing of testcases in User-Interface
        this.mTestController.refreshHandler = load => {
            this.LoadTests();
        };

        this.HandleFileEvents();
    }

    public getContext() : vscode.ExtensionContext
    {
        return this.mContext;
    }
    
    public async RunTests(
        shouldDebug: boolean,
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) : Promise<void>
    {
        const run : vscode.TestRun = this.mTestController.createTestRun(request);

        this.mDiagnosticCollection.clear();

        //specific selection of elements from User-Interface should be run
        if (request.include) {

            //execute selected test-cases on console
            if (!shouldDebug)
            {
                //set all selected testcases to "running-mode" for spinning wheel in UI
                await Promise.all(request.include.map(t => this.traverseNode(t, request, run, startNode)));
                await this.RunVUnitTestsShell(request.include[0], request, run);
            }
            //execute selected test-cases in GUI
            else if (shouldDebug)
            {   
                
                if (request.include[0].children.size > 0)
                {
                    // read configuration from vscode-settings
                    const multipleGuiTestcases = vscode.workspace
                        .getConfiguration()
                        .get('vunit-by-hgb.executeMultipleGuiTestcases') as boolean;

                    if (!multipleGuiTestcases) 
                    {
                        vscode.window.showErrorMessage("Executing multiple testcases in GUI-Mode: disabled!");
                    }
                    else
                    {
                        await this.RunVUnitTestsGUI(request.include[0], request, run);
                    }
                }
                else
                {
                    await this.RunVUnitTestsGUI(request.include[0], request, run);
                }

            }

        } 
        // all testcases should be run
        else {
            
            //get all top-level items (all VUnit-Scripts)
            const TopLevelItems : vscode.TestItem[] = mapTestItems(this.mTestController.items, item => item); 

            //set all testcases to "enqueued-mode" in UI
            await Promise.all(TopLevelItems.map(t => this.traverseNode(t, request, run, enqueueNode)));

            //execute all test-cases on console
            if (!shouldDebug)
            {
                for(const item of TopLevelItems)
                {
                    //set all selected testcases to "running-mode" for spinning wheel in UI
                    await this.traverseNode(item, request, run, startNode);
                    await this.RunVUnitTestsShell(item, request, run);
                }
            }
            //execute all test-cases in GUI
            else if (shouldDebug)
            {
                // read configuration from vscode-settings
                const multipleGuiTestcases = vscode.workspace
                    .getConfiguration()
                    .get('vunit-by-hgb.executeMultipleGuiTestcases') as boolean;

                if (!multipleGuiTestcases) 
                {
                    vscode.window.showErrorMessage("Executing all testcases in GUI-Mode: disabled!");
                }
                else
                {
                    for(const item of TopLevelItems)
                    {
                        await this.RunVUnitTestsGUI(item, request, run);
                    }
                }
            }
        }
        
        run.end();
    }

    public async LoadTests() : Promise<void>
    {
        
        //Find all VUnit-Scripts in WorkSpace
        const VUnitScripts : string[] = await this.mVUnit.FindScripts((vscode.workspace.workspaceFolders || [])[0]);

        if (this.mTestController.items.size === 0)
        {
            //just pick the first VUnit-Script of all found files and get vunit-version
            await this.mVUnit.GetVersion(VUnitScripts[0])
                .then((res) => {
                    this.mOutputChannel.append(`Found VUnit version ${res}`);
                })
                .catch((err) => {
                    this.mOutputChannel.append(err);
                });
        }

        //delete all old items
        for(const [id,item] of this.mTestController.items)
        {
            this.mTestController.items.delete(id);
        }

        //load all VUnit-Scripts parallely
        await Promise.all(VUnitScripts.map((vunitScript) => this.LoadVUnitScript(vunitScript)));

        // store top-level-items in alphabetic order
        const TopLevelItems : vscode.TestItem[] = mapTestItems(this.mTestController.items, item => item); 
        TopLevelItems.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        this.mTestController.items.replace(TopLevelItems);
    }

    private async LoadVUnitScript(vunitScript : string) : Promise<boolean>
    {
        // get data for each VUnit-Script-file
        const exportData: VunitExportData = await this.mVUnit.GetData(this.mWorkSpacePath, vunitScript);

        //relative path from workspace-folder to run-py-file 
        const vunitScriptPath : string = path.relative(this.mWorkSpacePath, vunitScript);

        //create test-item for selected VUnit-Script
        let vunitScriptItem : vscode.TestItem = this.mTestController.createTestItem(vunitScript,vunitScriptPath, vscode.Uri.file(vunitScript));
        this.mTestController.items.add(vunitScriptItem);

        // add all testcases to specified VUnit-testcase-item
        for(const testcase of exportData.tests)
        {
            // split testcase-string into tokens
            let split = testcase.name.split('.');
            let libraryName = split[0];
            let testBenchName = split[1];
            let testCaseName = split.slice(2).join('.');

            // get item of library
            const libraryID = getLibraryItemId(vunitScript, libraryName);
            let libraryItem : vscode.TestItem | undefined = vunitScriptItem.children.get(libraryID);

            // create node for library if not existing yet
            if (!libraryItem)
            {
                libraryItem = this.mTestController.createTestItem(libraryID, libraryName);
                vunitScriptItem.children.add(libraryItem);
            }

            // get item of testbench
            const testBenchID = getTestBenchItemId(vunitScript, libraryName, testBenchName);
            let testBenchItem : vscode.TestItem | undefined = libraryItem.children.get(testBenchID);
            
            //create node for testbench if not existing yet
            if (!testBenchItem)
            {
                testBenchItem = this.mTestController.createTestItem(testBenchID, testBenchName, vscode.Uri.file(testcase.location.file_name));
                libraryItem.children.add(testBenchItem);
            }

            //create node for testcase
            const testCaseID : string = getTestCaseItemId(vunitScript, testcase.name);
            const testCaseItem : vscode.TestItem = this.mTestController.createTestItem(testCaseID, testCaseName, vscode.Uri.file(testcase.location.file_name));
            testCaseItem.range = GetTestbenchRange(testcase.location.file_name, testcase.location.offset, testcase.location.length);

            testBenchItem.children.add(testCaseItem);
        }

        return true;
    }

    private async traverseNode(
        node: vscode.TestItem,
	    request: vscode.TestRunRequest,
	    run: vscode.TestRun,
        callback : (node: vscode.TestItem, run : vscode.TestRun) => void
    ) : Promise<void>
    {
        if (request.exclude?.includes(node)) {
            return;
        }

        if (node.children.size > 0)
        {
            // recurse all children if this is a "suite"
            await Promise.all(mapTestItems(node.children, t => this.traverseNode(t, request, run, callback)));
        }
        else
        {
            callback(node, run);
        }
    }

    private findNode(itemId: string, node: vscode.TestItem): vscode.TestItem | undefined 
    {
        if (node.id === itemId) {
          return node;
        }
      
        if (node.children.size > 0) {
          for (const [id, testNode] of node.children) {
            const result = this.findNode(itemId, testNode);
            if (result) {
              return result;
            }
          }
        }
      
        return undefined;
    }

    private async RunVUnitTestsShell(node : vscode.TestItem, request: vscode.TestRunRequest, run: vscode.TestRun) : Promise<void>
    {
        //extract path of VUnit-Script
        const vunitScriptPath = node.id.split('|')[0];
        //wildcard-appendix
        let wildcardAppendix : string = "";
        //check, if this node is a test-suite
        if(node.children.size > 0)
        {
            wildcardAppendix = ".*";
        }
        //Extract testcase-name from testcase-ID
        let testCaseWildCard : string = "";

        //check, if node is a top-level node
        if(node.parent)
        {
            testCaseWildCard = '"' + node.id.split('|')[1] + wildcardAppendix + '"';
        }
        //Command-Line-Arguments for VUnit
        let options = [testCaseWildCard, '--no-color', '--exit-0'];

        // read configuration from vscode-settings
        const vunitOptions = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.shellOptions');
        if (vunitOptions) {
            options.push(vunitOptions as string);
        }  
        
        const showExecutionTime = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.showExecutionTime') as boolean;

        //variable for referencing output from vunit-process to analyse its output
        let vunitProcess : any;

        //necessary for determining, which file caused an assertion failure
        let IsAssertionFailure : Boolean = false;

        //launch vunit-process with given arguments from above
        await this.mVUnit.Run(vunitScriptPath, options, (vunit: ChildProcess) => {
            
            // handle cancellation of test-suite
            let disposable = run.token.onCancellationRequested(() => {
                killProcess(vunit);
                this.traverseNode(node, request, run, skipRunningNode);
            });
            this.mContext.subscriptions.push(disposable);

            // append output to testcase
            vunit.stdout?.on('data', (data : string) => {
                run.appendOutput(data);
            });
            vunit.stderr?.on('data', (data : string) => {
                run.appendOutput(data);
            });
            
            vunitProcess = vunit;

            readline
                .createInterface({
                    input: vunitProcess.stdout,
                    terminal: false,
                })
                .on('line', (line: string) => {

                    //check for success/failure of VUnit-TestCase
                    this.MatchTestCaseStatus(line, node, run, vunitScriptPath, showExecutionTime);

                    //match VUnit-Errors
                    if(vscode.workspace.getConfiguration().get('vunit-by-hgb.matchProblems'))
                    {
                        this.mVUnit.MatchProblems(line, this.mDiagnosticCollection); 
                    }

                    //match VUnit-Assertion-Failure
                    if(vscode.workspace.getConfiguration().get('vunit-by-hgb.matchAssertionFailure'))
                    {
                        // Check for assertion failure
                        if (line.includes('** Error: Assertion violation.') && !IsAssertionFailure) {
                            IsAssertionFailure = true;
                        }

                        if(IsAssertionFailure)
                        {
                            this.MatchAssertionFailure(line, IsAssertionFailure);
                        }
                    }

                });
        }).finally(() => {
            vunitProcess = 0;
        })
        .catch((err) => {
            run.errored(node, new vscode.TestMessage("Error in Execution of " + vunitScriptPath));
        });

    }

    private async RunVUnitTestsGUI(node: vscode.TestItem, request: vscode.TestRunRequest, run: vscode.TestRun) : Promise<void>
    {
        //extract path of VUnit-script
        const vunitScriptPath = node.id.split('|')[0];

        //wildcard-appendix
        let wildcardAppendix : string = "";
        //check, if this node is a test-suite
        if(node.children.size > 0)
        {
            wildcardAppendix = ".*";
        }
        //Extract testcase-name from testcase-ID
        let testCaseWildCard : string = "";

        //check, if node is a top-level node
        if(node.parent)
        {
            testCaseWildCard = '"' + node.id.split('|')[1] + wildcardAppendix + '"';
        }

        //Command-Line-Arguments for VUnit
        let options = [testCaseWildCard, '--no-color', '--exit-0', '-g'];

        const vunitOptions = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.guiOptions');
        if (vunitOptions) {
            options.push(vunitOptions as string);
        }
        
        await this.mVUnit.Run(vunitScriptPath, options, (vunit: ChildProcess) => { 
            // handle cancellation of test-suite
            let disposable = run.token.onCancellationRequested(() => {
                killProcess(vunit);
            });
            this.mContext.subscriptions.push(disposable);
        });

    }

    private MatchTestCaseStatus(line : string, node : vscode.TestItem, run : vscode.TestRun, vunitScriptPath : string, showExecutionTime : boolean) : void
    {
        
        let testCaseMatcher : RegExp = cVunitTestEnd;
        if (showExecutionTime)
        {
            testCaseMatcher = cVunitTimedTestEnd;
        }

        let result = testCaseMatcher.exec(line);

        if (result) {

            const status = result[1];
            const testcaseName = result[2];
            const executionTime_ms = showExecutionTime ? (parseFloat(result[3]) * 1000) : undefined;

            const testCaseItemId : string = getTestCaseItemId(vunitScriptPath, testcaseName);
            //get related test-item
            const item = this.findNode(testCaseItemId, node);

            if(!item)
            {
                return;
            }

            item.busy = false;

            //evaluate result
            if(status === 'pass')
            {
                run.passed(item, executionTime_ms);
            }
            else
            {
                run.failed(item, new vscode.TestMessage(result[2] + " failed!"), executionTime_ms); 
            }
        }

    }

    private MatchAssertionFailure(line : string, IsAssertionFailure : Boolean) : void
    {
        const match = cVunitStopped.exec(line);
        if (match) {
            const assertionFile = match[1];
            const assertionLineNumber = parseInt(match[2]);
            
            const diagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(assertionLineNumber - 1, 0, assertionLineNumber - 1, 0),
                message: 'Assertion violation.',
                source: 'VUnit',
            };

            // check for existing diagnostics for this file
            if (this.mDiagnosticCollection.has(vscode.Uri.file(assertionFile))) 
            {
                const currentDiagnostics = this.mDiagnosticCollection.get(vscode.Uri.file(assertionFile));

                if (currentDiagnostics) {

                    //avoid duplication of same diagnostic
                    const isDuplicateDiagnostic = currentDiagnostics.some((existingDiagnostic) => {
                        return existingDiagnostic.range.isEqual(diagnostic.range) && existingDiagnostic.message === diagnostic.message;
                    });

                    if (!isDuplicateDiagnostic) {
                        // add new diagnostic to existing diagnostic-list
                        const updatedDiagnostics = currentDiagnostics.concat(diagnostic);
                        this.mDiagnosticCollection.set(vscode.Uri.file(assertionFile), updatedDiagnostics);
                    }

                }
            } 
            else 
            {
                // if no existing diagnostics, add a new diagnostic
                this.mDiagnosticCollection.set(vscode.Uri.file(assertionFile), [diagnostic]);
            }

            //reset boolean for efficiently detecting other assertion failures
            IsAssertionFailure = false;
        }
    }

    private async HandleFileEvents() : Promise<void>
    {
        vscode.workspace.onDidCreateFiles((event) => 
        {
            const vunitScriptName : string | undefined = vscode.workspace.getConfiguration().get("vunit-by-hgb.scriptname");
            
            if(vunitScriptName)
            {
                const IsVUnitScript : boolean = event.files.some((file) => {
                    const filePath = file.fsPath.toLowerCase();
                    return filePath.endsWith(vunitScriptName);
                });

                if(IsVUnitScript)
                {
                    this.LoadTests();
                }
            }

            
        });

        vscode.workspace.onDidDeleteFiles((event) => 
        {
            const vunitScriptName : string | undefined = vscode.workspace.getConfiguration().get("vunit-by-hgb.scriptname");
            
            if(vunitScriptName)
            {
                const IsVUnitScript : boolean = event.files.some((file) => {
                    const filePath = file.fsPath.toLowerCase();
                    return filePath.endsWith(vunitScriptName);
                });

                if(IsVUnitScript)
                {
                    this.LoadTests();
                }
            }
        });

        vscode.workspace.onDidRenameFiles((event) => 
        {
            const vunitScriptName : string | undefined = vscode.workspace.getConfiguration().get("vunit-by-hgb.scriptname");
            
            if(vunitScriptName)
            {
                const IsVUnitScript : boolean = event.files.some((file) => {
                    const newFilePath = file.newUri.fsPath.toLowerCase();
                    const oldFilePath = file.oldUri.fsPath.toLowerCase();
                    return newFilePath.endsWith(vunitScriptName) || oldFilePath.endsWith(vunitScriptName);
                });

                if(IsVUnitScript)
                {
                    this.LoadTests();
                }
            }
        });
    }

}


//--------------------------------------------
//Helper Methods
//--------------------------------------------

// Small helper that works like "array.map" for children of a test collection
const mapTestItems = <T>(items: vscode.TestItemCollection, mapper: (t: vscode.TestItem) => T): T[] => {
	const result: T[] = [];
	items.forEach(t => result.push(mapper(t)));
	return result;
};

function killProcess(process : ChildProcess) : void 
{
    kill(process.pid);
}

function getTestCaseItemId(vunitScriptPath : string, testCaseName : string) : string
{
    const testCaseId : string = vunitScriptPath.concat("|", testCaseName);
    return testCaseId;
}

function getLibraryItemId(vunitScriptPath : string, libraryName : string) : string 
{
    const libraryItemId : string = vunitScriptPath.concat("|", libraryName);
    return libraryItemId;
}

function getTestBenchItemId(vunitScriptPath : string, libraryName : string, testBenchName : string) : string 
{
    const testBenchItemId : string = vunitScriptPath.concat("|", libraryName, ".", testBenchName);
    return testBenchItemId;
}

function GetTestbenchRange(filePath : string, offset : number, testcaseNameLength : number) : vscode.Range
{
    const testBenchSrc : string = fs.readFileSync(filePath, 'utf8');
    const linesUntilTestcase : string[] = testBenchSrc.substring(0, offset).split(/\r?\n/);
    const testCaseStartLine = linesUntilTestcase.length - 1;
    //const testcaseEndLine : number = testBenchSrc.substring(offset, testBenchSrc.length).split(/\r?\n/).findIndex(line => IsTestbenchEnd(line));
    return new vscode.Range(new vscode.Position(testCaseStartLine, 0), new vscode.Position(testCaseStartLine, 0));
}

function skipRunningNode(node : vscode.TestItem, run : vscode.TestRun) : void 
{
    if (node.busy)
    {
        node.busy = false;
        run.skipped(node);
    }
}

function startNode(node : vscode.TestItem, run : vscode.TestRun) : void 
{
    run.started(node);
    node.busy = true;
}

function enqueueNode(node : vscode.TestItem, run : vscode.TestRun) : void 
{
    run.enqueued(node);
}

function IsTestbenchEnd(line : string) : boolean
{
    //empty
    return true;
}
